# Cashtrix

Aplikasi personal finance satu-orang: pencatatan uang milik akun, bukan rekening bank
dan bukan rumah tangga bersama.

## Language

### Identitas

**User**:
Identitas autentikasi (`auth.users`). Satu orang, satu akun.
_Avoid_: account, customer, client

**Profile**:
Identitas tampilan milik User: nama, avatar, mata uang tampilan, timezone, locale.
Bukan User.
_Avoid_: account, settings

### Uang

**Wallet** (Dompet):
Satu sumber dana milik User. Satu User boleh punya banyak Wallet, maksimum 10.
Tipe: bank, ewallet, cash, card.
_Avoid_: account, rekening (rekening = salah satu tipe), purse, pot

**Saldo**:
Posisi uang satu Wallet. Selalu dihitung: `opening_balance + Σ income − Σ expense
− Σ Transfer keluar + Σ Transfer masuk`. Tidak pernah disimpan sebagai kolom.
_Avoid_: balance column, cached balance

**Saldo gabungan**:
Jumlah Saldo semua Wallet milik User yang tidak diarsip.
_Avoid_: net worth, total assets (tidak menghitung utang kartu sebagai kewajiban terpisah)

**Mata uang**:
Kode tampilan di Profile (default IDR). Bukan konversi kurs.
_Avoid_: FX, exchange rate

### Gerakan

**Transaction**:
Satu pergerakan uang pada satu Wallet pada satu waktu. Tipe: income, expense, atau
Transfer. Nominal selalu positif; arah ditentukan oleh tipe.
_Avoid_: entry, record, posting, movement

**Transfer**:
Satu Transaction `type=transfer` yang memindahkan uang dari Wallet sumber
(`wallet_id`) ke Wallet tujuan (`counterparty_wallet_id`) milik User yang sama.
Nominal positif. Tidak punya Category (`category_id` kosong). Tidak mengubah
Saldo gabungan. Bukan income dan bukan expense; tidak masuk Spent, donut, atau
Alert. Di form Add: segmen ketiga di samping Expense / Income.
_Avoid_: move, send, internal transaction, transfer pair, transfer group

**Recurring rule**:
Jadwal milik User yang menghasilkan Occurrence bertipe income atau expense
(bukan Transfer). Frekuensi v1.1: bulanan. Wajib `starts_on` (hari-1 bulan,
timezone Profile); opsional `ends_on` (hari-1). Dikelola dari Profile
("Transaksi berulang"). Maksimum 20 aktif per User (yang di-Jeda tidak
menghitung kuota). Bisa di-Jeda atau dihapus. Archive Wallet yang dipakai
rule → rule otomatis Jeda.
_Avoid_: subscription, standing order, template, reminder

**Jeda**:
Status Recurring rule: catch-up berhenti, Occurrences yang sudah lahir tetap.
Bukan hapus, bukan Archive.
_Avoid_: pause sebagai sinonim di UI (UI memakai "Jeda"), disable, archive

**Occurrence**:
Transaction yang lahir dari Recurring rule pada tanggal jatuh tempo, lewat
Catch-up saat app dibuka. Diperlakukan identik dengan Transaction manual
(termasuk Spent dan Alert). `occurred_at` = tanggal jatuh tempo, bukan waktu
buka app. Hapus Recurring rule tidak menghapus Occurrence (`recurring_rule_id`
menjadi kosong).
_Avoid_: instance, run, firing

**Catch-up**:
RPC yang, saat app dibuka atau masuk foreground, menulis Occurrence yang tanggal
jatuh temponya sudah lewat atau hari ini dan belum ada Transaction-nya — termasuk
yang Soft-delete. Maksimum 12 Occurrence per Recurring rule per sesi buka; sisa
menunggu sesi berikutnya. Tidak menulis Occurrence masa depan.
_Avoid_: backfill, sync, cron, generate

**Due day**:
Hari dalam bulan untuk Recurring rule bulanan: 1–28, atau "hari terakhir bulan".
Tanggal 29–31 tidak dipakai, supaya Februari tidak bolong.
_Avoid_: due date (itu tanggal konkret suatu Occurrence), schedule day

### Pengelompokan

**Category**:
Pengelompokan Transaction. Sistem (milik bersama, `user_id` kosong) atau kustom
(milik satu User).
_Avoid_: tag, label, folder

**Category kind**:
`income` atau `expense`. Menentukan grid mana yang terlihat di form.
_Avoid_: type (type milik Transaction)

**Archive**:
Menyembunyikan Wallet atau Category kustom tanpa menghapus riwayat. Beda dari
Soft-delete (Transaction) dan dari Mute.
_Avoid_: hide, disable, delete

**Mute**:
Penyembunyian Category sistem per-User. Category sistem tidak bisa di-Archive
karena barisnya milik bersama.
_Avoid_: archive (untuk kategori sistem), hide, block

### Anggaran

**Budget**:
Batas belanja satu Category expense untuk satu Budget month.
_Avoid_: limit, cap, allowance, envelope

**Budget month**:
Hari ke-1 dari bulan kalender di timezone Profile User, disimpan sebagai `date`.
Bukan bulan UTC server.
_Avoid_: period, cycle, billing month

**Spent**:
Jumlah expense Category itu di Budget month, dihitung server-side. Bukan angka
yang ditulis User.
_Avoid_: used, consumed, actuals

**Threshold state**:
`ok` / `warning` (≥80%) / `exceeded` (≥100%), dihitung dari Spent / Budget.
_Avoid_: status, health, color

**Alert**:
Pemberitahuan sekali per User per Category per Budget month per ambang
(`warning_80` atau `exceeded_100`). Tidak dihapus jika Spent turun kembali.
_Avoid_: notification (itu saluran, bukan peristiwa), reminder

### Siklus hidup data

**Soft-delete**:
Transaction ditandai `deleted_at`, hilang dari feed, bisa dipulihkan 30 hari.
Bukan Archive.
_Avoid_: trash, archive, hide

**Idempotency key**:
UUID yang dibuat sekali per sesi form, mencegah Transaction ganda saat retry.
_Avoid_: request id, nonce

**Seed**:
Tindakan idempotent saat login pertama: satu Wallet "Cash". Bukan menyalin Category.
_Avoid_: onboard, bootstrap, provision
