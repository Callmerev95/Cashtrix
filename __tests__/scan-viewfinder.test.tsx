import { render, screen } from '@testing-library/react-native';

import { ScanReview } from '@/features/receipts/components/scan-review';
import {
  isScanViewfinderAvailable,
  ScanViewfinder,
} from '@/features/receipts/components/scan-viewfinder';
import { colors } from '@/theme';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

test('viewfinder degrades without native module (Jest default)', () => {
  expect(isScanViewfinderAvailable()).toBe(false);
  render(
    <ScanViewfinder
      visible
      onClose={jest.fn()}
      onCaptured={jest.fn()}
    />,
  );
  expect(screen.queryByTestId('scan-viewfinder')).toBeNull();
});

test('viewfinder hidden when not visible', () => {
  render(
    <ScanViewfinder
      visible={false}
      onClose={jest.fn()}
      onCaptured={jest.fn()}
    />,
  );
  expect(screen.queryByTestId('scan-viewfinder')).toBeNull();
});

test('scan tokens: bracket is gold (never income-green), ai fill is gold pastel', () => {
  expect(colors.scanBracket).toBe(colors.accent);
  expect(colors.scanBracket).not.toBe(colors.gain);
  expect(colors.aiFilledSurface).toBe('rgba(212, 175, 55, 0.12)');
  expect(colors.aiFilledBorder).toBe('rgba(212, 175, 55, 0.35)');
});

test('review split renders preview + ai-filled fields + actions', () => {
  render(
    <ScanReview
      visible
      prefill={{
        amount: 55000,
        occurredOn: null,
        merchant: 'STARBUCKS',
        categorySuggestion: 'Makanan',
        confidence: 0.42,
      }}
      previewUri="file://receipt.jpg"
      categoryName="Makanan"
      onContinue={jest.fn()}
      onRetake={jest.fn()}
    />,
  );
  expect(screen.getByTestId('scan-review')).toBeTruthy();
  expect(screen.getByTestId('scan-review-image')).toBeTruthy();
  expect(screen.getByTestId('scan-review-form')).toBeTruthy();
  expect(screen.getByTestId('ai-filled-merchant')).toBeTruthy();
  expect(screen.getByTestId('ai-filled-amount')).toBeTruthy();
  expect(screen.getByTestId('ai-filled-category')).toBeTruthy();
  expect(screen.getByTestId('scan-review-continue')).toBeTruthy();
  expect(screen.getByTestId('scan-review-retake')).toBeTruthy();
});

test('review hidden without prefill', () => {
  render(
    <ScanReview
      visible
      prefill={null}
      previewUri=""
      categoryName={null}
      onContinue={jest.fn()}
      onRetake={jest.fn()}
    />,
  );
  expect(screen.queryByTestId('scan-review')).toBeNull();
});
