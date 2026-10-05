/**
 * Viewfinder scan-overlay tests: after capture the live feed freezes onto
 * the photo and the laser sweeps the frame itself while OCR runs — the scan
 * feedback lives on the camera overlay, not in a card below the form.
 *
 * Own file because the camera module mock is file-scoped (the default
 * stand-in reports no CameraView so the app degrades; here it exists).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ScanViewfinder } from '@/features/receipts/components/scan-viewfinder';

jest.mock('expo-camera', () => ({
  CameraView: () => null,
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderFinder(scanning: boolean) {
  render(
    <ScanViewfinder
      visible
      scanning={scanning}
      previewUri={scanning ? 'file://capture.jpg' : null}
      onClose={jest.fn()}
      onCaptured={jest.fn()}
    />,
  );
}

test('capture mode shows frame + capture, no scan state', () => {
  renderFinder(false);
  expect(screen.getByTestId('scan-viewfinder')).toBeTruthy();
  expect(screen.getByTestId('scan-frame')).toBeTruthy();
  expect(screen.getByTestId('scan-capture')).toBeTruthy();
  expect(screen.queryByTestId('receipt-scanning')).toBeNull();
  expect(screen.queryByTestId('receipt-scan-state')).toBeNull();
});

test('scanning mode shows overlay state in the frame, capture hidden', () => {
  renderFinder(true);
  expect(screen.getByTestId('scan-viewfinder')).toBeTruthy();
  expect(screen.getByTestId('scan-frame')).toBeTruthy();
  expect(screen.getByTestId('receipt-scanning')).toBeTruthy();
  expect(screen.getByTestId('receipt-scan-state')).toBeTruthy();
  expect(screen.queryByTestId('scan-capture')).toBeNull();
});

test('laser advances mid-sweep (interval triangle wave)', () => {
  jest.useFakeTimers();
  try {
    renderFinder(true);
    const laser = screen.getByTestId('scan-laser');
    const yOf = (node: unknown): number => {
      const { style } = (node as { props: { style: unknown } }).props;
      const flat = Array.isArray(style)
        ? Object.assign({}, ...style)
        : (style as Record<string, unknown>);
      const raw = (flat as { transform?: { translateY: unknown }[] })
        .transform?.[0]?.translateY;
      if (
        typeof raw === 'object' &&
        raw !== null &&
        '__getValue' in raw &&
        typeof (raw as { __getValue: unknown }).__getValue === 'function'
      ) {
        return (raw as { __getValue: () => number }).__getValue();
      }
      return raw as number;
    };
    const before = yOf(laser);
    act(() => {
      jest.advanceTimersByTime(650);
    });
    const mid = yOf(screen.getByTestId('scan-laser'));
    expect(mid).toBeGreaterThan(before);
  } finally {
    jest.useRealTimers();
  }
});

test('torch toggles selected state next to close, capture undisturbed', () => {
  renderFinder(false);
  expect(
    screen.getByTestId('scan-torch').props.accessibilityState,
  ).toMatchObject({ selected: false });
  fireEvent.press(screen.getByTestId('scan-torch'));
  expect(
    screen.getByTestId('scan-torch').props.accessibilityState,
  ).toMatchObject({ selected: true });
  expect(screen.getByTestId('scan-capture')).toBeTruthy();
  expect(screen.getByTestId('scan-close')).toBeTruthy();
});
