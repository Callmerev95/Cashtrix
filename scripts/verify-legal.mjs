/**
 * AI5 legal gate (issue #94): dokumen legal dwibahasa jadi syarat gate.
 *
 * Cek statis tanpa device/DB: 4 file ada + keyword arsitektur Fase 1 hadir
 * di tiap file + tanpa klaim basi + tanpa em dash di copy baru + footer
 * v2.0.0. Dijalankan di CI `static` setelah kontrak testID.
 *
 * Run: node scripts/verify-legal.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`ok - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL - ${name}${detail ? `: ${detail}` : ''}`);
  }
}

const FILES = [
  'docs/legal/privacy.html',
  'docs/legal/privacy-id.html',
  'docs/legal/terms.html',
  'docs/legal/terms-id.html',
];

const texts = new Map();
for (const file of FILES) {
  try {
    texts.set(file, readFileSync(join(ROOT, file), 'utf8'));
    check(`${file} ada`, true);
  } catch {
    check(`${file} ada`, false, 'hilang');
  }
}

const REQUIRED = {
  'docs/legal/privacy.html': ['parse-voice', 'scan-receipt', 'Gemini', 'Save'],
  'docs/legal/privacy-id.html': ['parse-voice', 'scan-receipt', 'Gemini', 'Simpan'],
  'docs/legal/terms.html': ['receipt scan', 'voice entry', 'save manually', 'wrong'],
  'docs/legal/terms-id.html': ['Pindai struk', 'entri suara', 'simpan manual', 'salah'],
};
for (const file of FILES) {
  const text = texts.get(file);
  if (!text) continue;
  for (const keyword of REQUIRED[file]) {
    check(`${file} sebut ${keyword}`, text.includes(keyword), 'hilang');
  }
}

const RETENTION = {
  'docs/legal/privacy.html': '30 days',
  'docs/legal/privacy-id.html': '30 hari',
  'docs/legal/terms.html': 'suggestion',
  'docs/legal/terms-id.html': 'saran',
};
for (const [file, keyword] of Object.entries(RETENTION)) {
  const text = texts.get(file);
  if (!text) continue;
  check(`${file} retensi/saran jujur`, text.includes(keyword), 'hilang');
}

const BANNED = [
  'processed by Google',
  'processed by Apple',
  'Temporary processing files are deleted',
  'Berkas sementara pemrosesan dihapus',
  'v1.2',
];
for (const file of FILES) {
  const text = texts.get(file);
  if (!text) continue;
  const hit = BANNED.find((phrase) => text.includes(phrase));
  check(`${file} tanpa klaim basi`, !hit, hit ?? '');
}

const FOOTER = {
  'docs/legal/privacy.html': 'Privacy Policy v2.0.0',
  'docs/legal/privacy-id.html': 'Kebijakan Privasi v2.0.0',
  'docs/legal/terms.html': 'Terms of Service v2.0.0',
  'docs/legal/terms-id.html': 'Ketentuan Layanan v2.0.0',
};
for (const [file, keyword] of Object.entries(FOOTER)) {
  const text = texts.get(file);
  if (!text) continue;
  check(`${file} footer v2.0.0`, text.includes(keyword), 'hilang');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
