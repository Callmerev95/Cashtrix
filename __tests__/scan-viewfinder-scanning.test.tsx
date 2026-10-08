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
  // Device truth (2026-10-08 probe): v57 exposes NO root permission fns —
  // they live on the legacy `Camera` holder. The mock mirrors that shape
  // so a root-only lookup regression fails here instead of on device.
  Camera: {
    getCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
    requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

async function renderFinder(scanning: boolean) {
  render(
    <ScanViewfinder
      visible
      scanning={scanning}
      previewUri={scanning ? 'file://capture.jpg' : null}
      onClose={jest.fn()}
      onCaptured={jest.fn()}
    />,
  );
  // Permission resolves async (deferred timer + promise): flush both so
  // the camera branch (granted mock) is mounted before asserting.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test('capture mode shows frame + capture, no scan state', async () => {
  await renderFinder(false);
  expect(screen.getByTestId('scan-viewfinder')).toBeTruthy();
  expect(screen.getByTestId('scan-frame')).toBeTruthy();
  expect(screen.getByTestId('scan-capture')).toBeTruthy();
  expect(screen.getAllByTestId('scan-corner')).toHaveLength(4);
  expect(screen.queryByTestId('receipt-scanning')).toBeNull();
  expect(screen.queryByTestId('receipt-scan-state')).toBeNull();
});

test('scanning mode shows overlay state in the frame, capture hidden', async () => {
  await renderFinder(true);
  expect(screen.getByTestId('scan-viewfinder')).toBeTruthy();
  expect(screen.getByTestId('scan-frame')).toBeTruthy();
  expect(screen.getByTestId('receipt-scanning')).toBeTruthy();
  expect(screen.getByTestId('receipt-scan-state')).toBeTruthy();
  expect(screen.getAllByTestId('scan-corner')).toHaveLength(4);
  expect(screen.queryByTestId('scan-capture')).toBeNull();
});

test('laser advances mid-sweep (interval triangle wave)', async () => {
  // Fake timers BEFORE render: both the permission gate and the sweep
  // interval must live on the fake clock for the advance below to move them.
  jest.useFakeTimers();
  try {
    render(
      <ScanViewfinder
        visible
        scanning
        previewUri="file://capture.jpg"
        onClose={jest.fn()}
        onCaptured={jest.fn()}
      />,
    );
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
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

test('torch toggles selected state next to close, capture undisturbed', async () => {
  await renderFinder(false);
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

describe('camera permission at open (not at shutter)', () => {
  const { Alert } = require('react-native');

  function setCameraPermission(
    current: Record<string, unknown>,
    requested: Record<string, unknown>,
  ) {
    const cam = require('expo-camera') as {
      Camera?: Record<string, unknown>;
      getCameraPermissionsAsync?: unknown;
      requestCameraPermissionsAsync?: unknown;
    };
    delete cam.getCameraPermissionsAsync;
    delete cam.requestCameraPermissionsAsync;
    cam.Camera = {
      getCameraPermissionsAsync: jest.fn(async () => current),
      requestCameraPermissionsAsync: jest.fn(async () => requested),
    };
  }

  function renderOpen(onClose: () => void) {
    render(
      <ScanViewfinder
        visible
        scanning={false}
        previewUri={null}
        onClose={onClose}
        onCaptured={jest.fn()}
      />,
    );
  }

  it('granted permission stays silent and open', async () => {
    jest.useFakeTimers();
    try {
      setCameraPermission({ granted: true, status: 'granted' }, { granted: true });
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const onClose = jest.fn();
      renderOpen(onClose);
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      const cam = require('expo-camera') as {
        Camera: { requestCameraPermissionsAsync: jest.Mock };
      };
      expect(cam.Camera.requestCameraPermissionsAsync).not.toHaveBeenCalled();
      expect(alert).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      alert.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('denial alerts and closes instead of stranding a black preview', async () => {
    jest.useFakeTimers();
    try {
      setCameraPermission(
        { granted: false, canAskAgain: true, status: 'undetermined' },
        { granted: false },
      );
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const onClose = jest.fn();
      renderOpen(onClose);
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      expect(alert).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalled();
      alert.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });
});

  it('root-only future shape keeps working (forward-compat)', async () => {
    jest.useFakeTimers();
    try {
      const cam = require('expo-camera') as {
        Camera?: unknown;
        getCameraPermissionsAsync?: unknown;
        requestCameraPermissionsAsync?: unknown;
      };
      delete cam.Camera;
      cam.getCameraPermissionsAsync = jest.fn(async () => ({
        granted: false,
        canAskAgain: true,
        status: 'undetermined',
      }));
      cam.requestCameraPermissionsAsync = jest.fn(async () => ({ granted: true }));
      const { Alert } = require('react-native') as {
        Alert: { alert: jest.Mock };
      };
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const onClose = jest.fn();
      render(
        <ScanViewfinder
          visible
          scanning={false}
          previewUri={null}
          onClose={onClose}
          onCaptured={jest.fn()}
        />,
      );
      await act(async () => {
        jest.advanceTimersByTime(0);
      });
      expect(cam.requestCameraPermissionsAsync).toHaveBeenCalled();
      expect(alert).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      alert.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

test('camera mounts only after grant (no black first frame)', async () => {
  const cam = require('expo-camera') as {
    Camera: {
      getCameraPermissionsAsync: jest.Mock;
      requestCameraPermissionsAsync: jest.Mock;
    };
  };
  cam.Camera = {
    getCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
    requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  };
  render(
    <ScanViewfinder
      visible
      scanning={false}
      previewUri={null}
      onClose={jest.fn()}
      onCaptured={jest.fn()}
    />,
  );
  // Permission still resolving: wait spinner, no camera branch yet.
  expect(screen.getByTestId('scan-permission-wait')).toBeTruthy();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(screen.queryByTestId('scan-permission-wait')).toBeNull();
});
