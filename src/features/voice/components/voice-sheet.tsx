/**
 * Voice entry sheet (VC2, issue #64 — Option A per pemilik: dikte keyboard
 * OS, karena tak ada modul STT di bundle Expo dan intent-launcher satu
 * arah).
 *
 * The mic button opens this panel with the text field focused; the user
 * speaks through the OS keyboard mic (Gboard / dikte iOS — STT tetap milik
 * Google/Apple) or types directly. The app only ever receives text, parses
 * it with the VC1 parser, and hands a prefill to the form — prefill-saja,
 * tanpa auto-save (ADR-0010). No audio is recorded, uploaded, or stored
 * anywhere (PRD §4.4); the utterance only survives as the form's note field
 * (user data, like anything typed) and never reaches analytics (the save
 * path sends a boolean `hasNote`, never text).
 *
 * Prefill fires from the text-change handler, never an effect, and only
 * when the parse outcome actually changes (result-key guard) — typing on
 * after a manual correction cannot re-stomp the corrected field. A refusal
 * touches nothing: the form stays fully usable for manual entry.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  formatGrouped,
  transactionTypeLabel,
} from '@/features/transactions';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';

import {
  parseVoiceSplit,
  parseVoiceText,
  voiceRefusalMessage,
  voiceSplitRefusalMessage,
  type VoicePrefill,
  type VoiceSplitOkRow,
  type VoiceWallet,
} from '../domain';

type VoiceSheetProps = {
  /** Controlled by the host: the Add form owns it so the save button can
   * mirror it as `voice-save`, and seeds it open for the `cashtrix://voice`
   * alias (VC3). */
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  wallets: VoiceWallet[];
  onPrefill: (prefill: VoicePrefill) => void;
  /**
   * Split commit (WG2, ADR-0011): the sheet calls back with the surviving ok
   * rows (after per-row removal) and the host saves them all in one tap.
   * Absent = single-prefill only (legacy callers).
   */
  onSplitSave?: (rows: VoiceSplitOkRow[]) => void;
};

export function VoiceSheet({
  open,
  onOpenChange,
  wallets,
  onPrefill,
  onSplitSave,
}: VoiceSheetProps) {
  const language = useLanguage();
  const t = dictionaryFor(language).voice;
  const [text, setText] = useState('');
  // Guards the prefill: identical parse outcomes never re-fire, so manual
  // corrections survive further typing in this box.
  const appliedKey = useRef<string | null>(null);
  // Split-row removal (WG2 story 3): indices into the current parse, reset
  // on every keystroke so a re-parse never resurrects a removed row.
  const [removedIdx, setRemovedIdx] = useState<number[]>([]);

  // Pure — recomputed during render, no effect involved.
  const result = parseVoiceText(text, wallets);
  const split = parseVoiceSplit(text, wallets);

  function setPanelOpen(next: boolean) {
    onOpenChange?.(next);
  }

  /** One preview line: nominal · jenis · dompet · hint (misses dropped). */
  function previewFor(row: {
    amount: number;
    kind: 'expense' | 'income';
    walletId: string | null;
    categoryHint: string | null;
  }): string {
    return [
      formatGrouped(row.amount, language),
      transactionTypeLabel(row.kind, language),
      wallets.find((wallet) => wallet.id === row.walletId)?.name,
      row.categoryHint,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
  }

  function handleText(next: string) {
    setText(next);
    setRemovedIdx([]);
    const parsed = parseVoiceText(next, wallets);
    if (parsed.status !== 'ok') return;
    const key = [
      parsed.amount,
      parsed.kind,
      parsed.walletId ?? '',
      parsed.categoryHint ?? '',
    ].join('|');
    if (appliedKey.current === key) return;
    appliedKey.current = key;
    onPrefill({
      amount: parsed.amount,
      kind: parsed.kind,
      walletId: parsed.walletId,
      categoryHint: parsed.categoryHint,
      note: parsed.note,
    });
  }

  function removeSplitRow(index: number) {
    setRemovedIdx((current) =>
      current.includes(index) ? current : [...current, index],
    );
  }

  const previewParts =
    result.status === 'ok'
      ? [
          formatGrouped(result.amount, language),
          transactionTypeLabel(result.kind, language),
          wallets.find((wallet) => wallet.id === result.walletId)?.name,
          result.categoryHint,
        ].filter((part): part is string => Boolean(part))
      : [];

  // Split preview (WG2): 2–3 clauses parse to 2–3 rows. Single-clause
  // utterances keep the legacy single-prefill path above untouched.
  const splitRows =
    split.status === 'ok' && split.rows.length > 1 ? split.rows : null;
  const visibleRows = splitRows
    ? splitRows.filter((_, index) => !removedIdx.includes(index))
    : [];
  const savableRows = visibleRows.filter(
    (row): row is VoiceSplitOkRow => row.ok,
  );

  return (
    <View>
      <Pressable
        testID="voice-mic"
        accessibilityRole="button"
        accessibilityLabel={t.micA11y}
        onPress={() => setPanelOpen(!open)}
        style={({ pressed }) => [
          styles.mic,
          open && styles.micActive,
          pressed && pressedFeedback,
        ]}
      >
        <MaterialIcons
          name="mic"
          size={18}
          color={open ? colors.accent : colors.textSecondary}
        />
        <Text
          style={[
            typography.bodyMd,
            styles.micLabel,
            open && styles.micLabelActive,
          ]}
        >
          {t.mic}
        </Text>
      </Pressable>

      {open ? (
        <View testID="voice-sheet" style={styles.panel}>
          <TextInput
            testID="voice-input"
            style={styles.input}
            value={text}
            onChangeText={handleText}
            placeholder={t.inputPlaceholder}
            placeholderTextColor={colors.textSecondary}
            selectionColor={colors.accent}
            autoFocus
            multiline
          />
          <Text testID="voice-hint" style={[typography.bodySm, styles.hint]}>
            {t.inputHint}
          </Text>
          {text === '' ? null : splitRows ? (
            <View testID="voice-split-preview" style={styles.splitList}>
              {splitRows.map((row, index) => {
                if (removedIdx.includes(index)) return null;
                return (
                  <View key={index} style={styles.splitRow}>
                    <Text
                      testID="voice-split-row"
                      style={[typography.bodyMd, styles.status]}
                    >
                      {row.ok
                        ? previewFor(row)
                        : voiceSplitRefusalMessage(row.reason, language)}
                    </Text>
                    {!row.ok ? (
                      <Text
                        style={[typography.bodySm, styles.hint]}
                        selectable
                      >
                        {row.text}
                      </Text>
                    ) : null}
                    <Pressable
                      testID="voice-row-remove"
                      accessibilityRole="button"
                      accessibilityLabel={`${t.removeRow}: ${row.ok ? row.note : row.text}`}
                      onPress={() => removeSplitRow(index)}
                      style={({ pressed }) => [
                        styles.remove,
                        pressed && pressedFeedback,
                      ]}
                    >
                      <MaterialIcons
                        name="close"
                        size={18}
                        color={colors.textSecondary}
                      />
                    </Pressable>
                  </View>
                );
              })}
              {savableRows.length > 0 ? (
                <Pressable
                  testID="voice-split-save"
                  accessibilityRole="button"
                  onPress={() => onSplitSave?.(savableRows)}
                  style={({ pressed }) => [
                    styles.splitSave,
                    pressed && pressedFeedback,
                  ]}
                >
                  <Text style={[typography.bodyMd, styles.splitSaveLabel]}>
                    {fill(t.splitSave, { count: savableRows.length })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {result.status === 'ok'
                ? previewParts.join(' · ')
                : voiceRefusalMessage(result.status, language)}
            </Text>
          )}
          <Pressable
            testID="voice-close"
            accessibilityRole="button"
            accessibilityLabel={t.close}
            onPress={() => setPanelOpen(false)}
            style={({ pressed }) => [
              styles.close,
              pressed && pressedFeedback,
            ]}
          >
            <Text style={[typography.bodyMd, styles.hint]}>{t.close}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mic: {
    minHeight: layout.minTapTarget,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  micActive: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  micLabel: {
    color: colors.textSecondary,
  },
  micLabelActive: {
    color: colors.accent,
  },
  panel: {
    marginTop: spacing.sm,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  input: {
    minHeight: layout.minTapTarget,
    color: colors.textPrimary,
    ...typography.bodyLg,
    textAlignVertical: 'top',
  },
  hint: {
    color: colors.textSecondary,
  },
  status: {
    color: colors.accent,
  },
  splitList: {
    gap: spacing.sm,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  remove: {
    minHeight: layout.minTapTarget,
    minWidth: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitSave: {
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
  splitSaveLabel: {
    color: colors.background,
  },
  close: {
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
