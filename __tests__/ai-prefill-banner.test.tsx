/**
 * AI prefill banner tests — the Jest seam for the shared AI indicator.
 *
 * Locked: `surface-card` fill + one hairline `border`, no icon; gold lives
 * only on the caller's text string, never on this background (DESIGN.md
 * §1/§7). Entrance is View-only: opacity 0 → 1 plus `translateY` 20 → 0,
 * with an optional stagger delay for consecutive rows.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { AI_BANNER_STAGGER_MS, AiPrefillBanner } from '@/components/ai-prefill-banner';
import { colors } from '@/theme';

test('banner memakai surface-card + hairline border, tanpa fill emas', () => {
  render(
    <AiPrefillBanner>
      <Text testID="banner-text">Soto 25rb</Text>
    </AiPrefillBanner>,
  );
  const banner = screen.getByTestId('ai-prefill-banner');
  const style = StyleSheet.flatten(banner.props.style);
  expect(style.backgroundColor).toBe(colors.surfaceCard);
  expect(style.backgroundColor).not.toBe(colors.accent);
  expect(style.borderColor).toBe(colors.border);
  expect(style.borderWidth).toBe(StyleSheet.hairlineWidth);
  expect(screen.getByTestId('banner-text')).toBeTruthy();
});

test('testID dan delay stagger dapat dioverride pemanggil', () => {
  expect(AI_BANNER_STAGGER_MS).toBe(60);
  render(
    <AiPrefillBanner testID="voice-prefill" delay={2 * AI_BANNER_STAGGER_MS}>
      <Text>Baris ketiga</Text>
    </AiPrefillBanner>,
  );
  expect(screen.getByTestId('voice-prefill')).toBeTruthy();
  expect(screen.queryByTestId('ai-prefill-banner')).toBeNull();
});
