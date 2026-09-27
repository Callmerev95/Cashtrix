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
import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';

import {
  parseVoiceText,
  voiceRefusalMessage,
  type VoicePrefill,
  type VoiceWallet,
} from '../domain';

type VoiceSheetProps = {
  wallets: VoiceWallet[];
  onPrefill: (prefill: VoicePrefill) => void;
  onOpenChange?: (open: boolean) => void;
};

export function VoiceSheet({ wallets, onPrefill, onOpenChange }: VoiceSheetProps) {
  const language = useLanguage();
  const t = dictionaryFor(language).voice;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  // Guards the prefill: identical parse outcomes never re-fire, so manual
  // corrections survive further typing in this box.
  const appliedKey = useRef<string | null>(null);

  // Pure — recomputed during render, no effect involved.
  const result = parseVoiceText(text, wallets);

  function setPanelOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  function handleText(next: string) {
    setText(next);
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

  const previewParts =
    result.status === 'ok'
      ? [
          formatGrouped(result.amount, language),
          transactionTypeLabel(result.kind, language),
          wallets.find((wallet) => wallet.id === result.walletId)?.name,
          result.categoryHint,
        ].filter((part): part is string => Boolean(part))
      : [];

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
          {text === '' ? null : (
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
  close: {
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
