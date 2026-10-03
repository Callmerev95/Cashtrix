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
import { tapPrefill, tapRecord } from '@/features/haptics';
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
  hasRecordConsent,
  hasVoiceConsent,
  requestAiTranscribe,
  requestAiVoice,
  setRecordConsent,
  setVoiceConsent,
  uploadVoiceRecording,
  VOICE_RECORD_MAX_MS,
  type AiVoicePrefillPayload,
} from '../api';
import { VoiceWaveform } from './voice-waveform';

/** Minimal structural shape of `expo-audio` (lazy-loaded, may be absent). */
type AudioRecorderShape = {
  prepareToRecordAsync(): Promise<void>;
  record(): void;
  stop(): Promise<void>;
  uri: string | null;
};

type AudioModuleShape = {
  AudioModule: {
    requestRecordingPermissionsAsync(): Promise<{ granted: boolean }>;
  };
  RecordingPresets: { HIGH_QUALITY: unknown };
  AudioRecorder: new (options: unknown) => AudioRecorderShape;
};

/** Lazy `expo-audio` loader (pola lock/api.ts): null when absent. */
function loadAudioModule(): AudioModuleShape | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-audio') as AudioModuleShape;
  } catch {
    return null;
  }
}

type VoiceSheetProps = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  wallets: VoiceWallet[];
  onPrefill: (prefill: VoicePrefill) => void;
  onSplitSave?: (rows: VoiceSplitOkRow[]) => void;
  /** Supabase user id — record button hides when absent (degrade). */
  userId?: string;
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
  userId,
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [recordNote, setRecordNote] = useState<
    | null
    | 'uploading'
    | 'transcribing'
    | 'denied'
    | 'unavailable'
    | 'too_large'
    | 'failed'
  >(null);
  const recorderRef = useRef<AudioRecorderShape | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearRecordTimers() {
    if (recordTimerRef.current !== null) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (recordStopRef.current !== null) {
      clearTimeout(recordStopRef.current);
      recordStopRef.current = null;
    }
  }

  /** Transcript-free path: `transcribe-voice` returns the prefill directly. */
  function applyTranscribePrefill(payload: AiVoicePrefillPayload) {
    const walletId = resolveWalletHint(payload.walletHint, wallets);
    setAiPrefill({ payload, walletId });
    setRecordNote(null);
    trackAi(true);
    firePrefill({
      amount: payload.amount,
      kind: payload.kind,
      walletId,
      categoryHint: payload.categoryHint,
      note: payload.note,
    });
  }

  async function finishRecording() {
    // B1: the take ended — buzz stop first, everything below is upload.
    void tapRecord('stop');
    const recorder = recorderRef.current;
    recorderRef.current = null;
    clearRecordTimers();
    setIsRecording(false);
    if (!recorder) {
      setRecordNote('failed');
      return;
    }
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch {
      setRecordNote('failed');
      return;
    }
    if (!uri || !userId) {
      setRecordNote('failed');
      return;
    }
    setRecordNote('uploading');
    let storagePath: string;
    try {
      storagePath = await uploadVoiceRecording({ userId, sourceUri: uri });
    } catch (error) {
      setRecordNote(
        error instanceof Error && error.message === 'voice_too_large'
          ? 'too_large'
          : 'failed',
      );
      return;
    }
    setRecordNote('transcribing');
    const [outcome] = await Promise.all([
      requestAiTranscribe({ storagePath }),
      aiVoiceDisplayDelay(),
    ]);
    if (outcome.status === 'ok') {
      applyTranscribePrefill(outcome.prefill);
      return;
    }
    if (outcome.status === 'rate_limited') {
      setRecordNote(null);
      setAiNote('rate_limited');
      trackAi(false);
      return;
    }
    if (outcome.status === 'quota_exceeded') {
      setRecordNote(null);
      setAiNote('quota_exceeded');
      trackAi(false);
      return;
    }
    // empty/offline: server deleted nothing to keep (object already removed
    // server-side or never transcribed) — fall back to manual typing.
    setRecordNote('failed');
    trackAi(false);
  }

  async function beginRecording() {
    const audio = loadAudioModule();
    if (!audio) {
      setRecordNote('unavailable');
      return;
    }
    let permission: { granted: boolean };
    try {
      permission = await audio.AudioModule.requestRecordingPermissionsAsync();
    } catch {
      setRecordNote('unavailable');
      return;
    }
    if (!permission.granted) {
      setRecordNote('denied');
      return;
    }
    const recorder = new audio.AudioRecorder(
      audio.RecordingPresets.HIGH_QUALITY,
    );
    try {
      await recorder.prepareToRecordAsync();
    } catch {
      setRecordNote('unavailable');
      return;
    }
    recorderRef.current = recorder;
    setRecordSecs(0);
    setRecordNote(null);
    setIsRecording(true);
    try {
      recorder.record();
    } catch {
      recorderRef.current = null;
      setIsRecording(false);
      setRecordNote('unavailable');
      return;
    }
    // B1: the take started — buzz start. Best-effort, never blocks.
    void tapRecord('start');
    recordTimerRef.current = setInterval(() => {
      setRecordSecs((secs) => secs + 1);
    }, 1000);
    // Hard cap (ADR-0015): auto-stop at 15 s so no recording can bloat
    // tokens or hit the 1 MB bucket cap.
    recordStopRef.current = setTimeout(() => {
      void finishRecording();
    }, VOICE_RECORD_MAX_MS);
  }

  function handleRecordPress() {
    if (isRecording) {
      void finishRecording();
      return;
    }
    if (recordNote === 'uploading' || recordNote === 'transcribing') return;
    void (async () => {
      if (!(await hasRecordConsent())) {
        Alert.alert(t.recordConsentTitle, t.recordConsentBody, [
          { text: commonCancel, style: 'cancel' },
          {
            text: t.consentSend,
            onPress: () => {
              void (async () => {
                await setRecordConsent();
                await beginRecording();
              })();
            },
          },
        ]);
        return;
      }
      await beginRecording();
    })();
  }

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

  function firePrefill(prefill: VoicePrefill): boolean {
    const key = [
      prefill.amount,
      prefill.kind,
      prefill.walletId ?? '',
      prefill.categoryHint ?? '',
    ].join('|');
    if (appliedKey.current === key) return false;
    appliedKey.current = key;
    onPrefill(prefill);
    return true;
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
      // B1: the AI prefill landed — one soft tick, only when it actually
      // applies (the guard above swallows keystroke duplicates).
      if (
        firePrefill({
          amount: outcome.prefill.amount,
          kind: outcome.prefill.kind,
          walletId,
          categoryHint: outcome.prefill.categoryHint,
          note: outcome.prefill.note,
        })
      ) {
        void tapPrefill();
      }
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
          {userId ? (
            <Pressable
              testID="voice-record"
              accessibilityRole="button"
              accessibilityLabel={t.recordA11y}
              onPress={handleRecordPress}
              style={({ pressed }) => [
                styles.record,
                isRecording && styles.recordActive,
                pressed && pressedFeedback,
              ]}
            >
              <MaterialIcons
                name={isRecording ? 'stop' : 'fiber-manual-record'}
                size={18}
                color={isRecording ? colors.background : colors.accent}
              />
              <Text
                style={[
                  typography.bodyMd,
                  styles.recordLabel,
                  isRecording && styles.recordLabelActive,
                ]}
              >
                {isRecording
                  ? fill(t.recording, { secs: recordSecs })
                  : t.record}
              </Text>
            </Pressable>
          ) : null}
          {recordNote === 'uploading' ? (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {t.recordUploading}
            </Text>
          ) : recordNote === 'transcribing' ? (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {t.recordTranscribing}
            </Text>
          ) : recordNote === 'denied' ? (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {t.recordDenied}
            </Text>
          ) : recordNote === 'unavailable' ? (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {t.recordUnavailable}
            </Text>
          ) : recordNote === 'too_large' ? (
            <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
              {t.recordTooLarge}
            </Text>
          ) : null}
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
            <>
              <VoiceWaveform />
              <Text testID="voice-status" style={[typography.bodyMd, styles.status]}>
                {t.aiWorking}
              </Text>
            </>
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
  record: {
    minHeight: layout.minTapTarget,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  recordActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  recordLabel: {
    color: colors.accent,
  },
  recordLabelActive: {
    color: colors.background,
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
