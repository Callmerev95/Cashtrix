import { StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '@/theme';

import { VoiceWaveform } from './voice-waveform';

export function VoiceListeningView({
  timerLabel,
  title,
}: {
  timerLabel: string | null;
  title: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={[typography.headlineMd, styles.title]}>{title}</Text>
      <VoiceWaveform />
      {timerLabel !== null ? (
        <Text testID="voice-timer" style={[typography.currencyDisplay, styles.timer]}>
          {timerLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  title: {
    color: colors.textPrimary,
    textAlign: 'center',
  },
  timer: {
    color: colors.accent,
    textAlign: 'center',
  },
});
