import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
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
import { useReducedMotion } from '@/components/skeleton';
import { aiPrefillEvent, trackEvent } from '@/features/observability';

import {
  parseVoiceSplit,
  parseVoiceText,
  voiceRefusalMessage,
  voiceSplitRefusalMessage,
  type VoicePrefill,
  type VoiceSplitOkRow,
  type VoiceWallet,
} from '../domain';
import {
  aiVoiceDisplayDelay,
  hasVoiceConsent,
  requestAiVoice,
  setVoiceConsent,
  type AiVoicePrefillPayload,
} from '../api';

type VoiceSheetProps = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  wallets: VoiceWallet[];
  onPrefill: (prefill: VoicePrefill) => void;
  onSplitSave?: (rows: VoiceSplitOkRow[]) => void;
};

function resolveWalletHint(
  hint: string | null,
  wallets: VoiceWallet[],
): string | null {
  if (!hint) return null;
  const trimmed = hint.trim().toLowerCase();
  if (trimmed === '') return null;
  return (
    wallets.find((wallet) => wallet.name.toLowerCase() === trimmed)?.id ??
    null
  );
}

export function VoiceSheet({
  open,
  onOpenChange,
  wallets,
  onPrefill,
  onSplitSave,
}: VoiceSheetProps) {
  const language = useLanguage();
  const t = dictionaryFor(language).voice;
  const commonCancel = dictionaryFor(language).common.cancel;
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState('');
  const appliedKey = useRef<string | null>(null);
  const [removedIdx, setRemovedIdx] = useState<number[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState<
    null | 'working' | 'fail' | 'rate_limited' | 'quota_exceeded'
  >(null);
  const [aiPrefill, setAiPrefill] = useState<{
    payload: AiVoicePrefillPayload;
    walletId: string | null;
  } | null>(null);
  const requestId = useRef(0);

  function setPanelOpen(next: boolean) {
    onOpenChange?.(next);
  }

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

  function firePrefill(prefill: VoicePrefill) {
    const key = [
      prefill.amount,
      prefill.kind,
      prefill.walletId ?? '',
      prefill.categoryHint ?? '',
    ].join('|');
    if (appliedKey.current === key) return;
    appliedKey.current = key;
    onPrefill(prefill);
  }

  function trackAi(ok: boolean) {
    try {
      trackEvent(aiPrefillEvent({ ok }));
    } catch {
      // Analytics never blocks input.
    }
  }

  function handleText(next: string) {
    setText(next);
    setRemovedIdx([]);
    setAiPrefill(null);
    if (next.trim() === '') {
      requestId.current += 1;
      setAiLoading(false);
      setAiNote(null);
      return;
    }
    const current = requestId.current + 1;
    requestId.current = current;
    setAiLoading(true);
    setAiNote('working');
    void (async () => {
      if (!(await hasVoiceConsent())) {
        if (requestId.current !== current) return;
        setAiLoading(false);
        Alert.alert(
          t.consentTitle,
          `${t.consentBody} ${t.consentPersistNote}`,
          [
            {
              text: commonCancel,
              style: 'cancel',
              onPress: () => {
                if (requestId.current !== current) return;
                setAiNote(null);
                const parsed = parseVoiceText(next, wallets);
                if (parsed.status === 'ok') {
                  firePrefill({
                    amount: parsed.amount,
                    kind: parsed.kind,
                    walletId: parsed.walletId,
                    categoryHint: parsed.categoryHint,
                    note: parsed.note,
                  });
                }
              },
            },
            {
              text: t.consentSend,
              onPress: () => {
                void (async () => {
                  await setVoiceConsent();
                  if (requestId.current !== current) return;
                  setAiLoading(true);
                  setAiNote('working');
                  await runAiFor(next, current);
                })();
              },
            },
          ],
        );
        return;
      }
      await runAiFor(next, current);
    })();
  }

  async function runAiFor(next: string, current: number) {
    const [outcome] = await Promise.all([
      requestAiVoice({ text: next }),
      aiVoiceDisplayDelay(),
    ]);
    if (requestId.current !== current) return;
    setAiLoading(false);
    if (outcome.status === 'ok') {
      const local = parseVoiceSplit(next, wallets);
      if (local.status === 'ok' && local.rows.length > 1) {
        setAiPrefill(null);
        setAiNote(null);
        trackAi(true);
        return;
      }
      const walletId = resolveWalletHint(outcome.prefill.walletHint, wallets);
      setAiPrefill({ payload: outcome.prefill, walletId });
      setAiNote(null);
      trackAi(true);
      firePrefill({
        amount: outcome.prefill.amount,
        kind: outcome.prefill.kind,
        walletId,
        categoryHint: outcome.prefill.categoryHint,
        note: outcome.prefill.note,
      });
      return;
    }
    if (outcome.status === 'rate_limited') {
      setAiNote('rate_limited');
      trackAi(false);
      return;
    }
    if (outcome.status === 'quota_exceeded') {
      setAiNote('quota_exceeded');
      trackAi(false);
      return;
    }
    setAiNote('fail');
    trackAi(false);
    const parsed = parseVoiceText(next, wallets);
    if (parsed.status === 'ok') {
      firePrefill({
        amount: parsed.amount,
        kind: parsed.kind,
        walletId: parsed.walletId,
        categoryHint: parsed.categoryHint,
        note: parsed.note,
      });
    }
  }

  function removeSplitRow(index: number) {
    setRemovedIdx((current) =>
      current.includes(index) ? current : [...current, index],
    );
  }

  const localResult = parseVoiceText(text, wallets);
  const localSplit = parseVoiceSplit(text, wallets);

  const aiPreviewParts = aiPrefill
    ? [
        formatGrouped(aiPrefill.payload.amount, language),
        transactionTypeLabel(aiPrefill.payload.kind, language),
        wallets.find((wallet) => wallet.id === aiPrefill.walletId)?.name,
        aiPrefill.payload.categoryHint,
      ].filter((part): part is string => Boolean(part))
    : [];

  const localPreviewParts =
    localResult.status === 'ok'
      ? [
          formatGrouped(localResult.amount, language),
          transactionTypeLabel(localResult.kind, language),
          wallets.find((wallet) => wallet.id === localResult.walletId)?.name,
          localResult.categoryHint,
        ].filter((part): part is string => Boolean(part))
      : [];

  const splitRows =
    localSplit.status === 'ok' && localSplit.rows.length > 1
      ? localSplit.rows
      : null;
  const visibleRows = splitRows
    ? splitRows.filter((_, index) => !removedIdx.includes(index))
    : [];
  const savableRows = visibleRows.filter(
    (row): row is VoiceSplitOkRow => row.ok,
  );

  const showSplit = !aiPrefill && !aiLoading && splitRows !== null;
  const showLocalSingle =
    !aiPrefill && !aiLoading && !showSplit && text !== '';

  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!aiLoading || reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [aiLoading, pulse, reduceMotion]);
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.8],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 0],
  });

  return (
    <View>
      <View style={styles.micWrap}>
        {aiLoading && !reduceMotion ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.pulseRing,
              { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
            ]}
          />
        ) : null}
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
      </View>

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
          {text === '' ? null : aiLoading ? (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {t.aiWorking}
            </Text>
          ) : aiNote === 'rate_limited' ? (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {t.aiRateLimited}
            </Text>
          ) : aiNote === 'quota_exceeded' ? (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {t.aiQuota}
            </Text>
          ) : aiPrefill ? (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {aiPreviewParts.join(' · ')}
            </Text>
          ) : showSplit ? (
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
          ) : showLocalSingle ? (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {localResult.status === 'ok'
                ? localPreviewParts.join(' · ')
                : voiceRefusalMessage(localResult.status, language)}
            </Text>
          ) : aiNote === 'fail' ? (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {localResult.status === 'ok'
                ? localPreviewParts.join(' · ')
                : voiceRefusalMessage(localResult.status, language)}
            </Text>
          ) : null}
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
  micWrap: {
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.accent,
  },
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
