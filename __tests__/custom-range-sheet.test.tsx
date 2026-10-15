/**
 * Custom range sheet contract (L4c).
 *
 * Closed renders nothing (house pattern, same as VoiceSheet); every open is
 * a fresh mount restarting from `initial`. Apply returns calendar-day keys
 * for the tapped days; the domain (not the sheet) owns swap/clamp rules.
 */
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { CustomRangeSheet } from '@/features/analytics/components/custom-range-sheet';
import { toDateKey } from '@/features/transactions/domain';

function dayAgo(days: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
}

function renderOpen(initial: { startKey: string; endKey: string } | null = null) {
  const onClose = jest.fn();
  const onApply = jest.fn();
  render(
    <CustomRangeSheet
      open
      initial={initial}
      onClose={onClose}
      onApply={onApply}
    />,
  );
  return { onClose, onApply };
}

/**
 * Press a grid day the way a user would: each grid opens on its own value
 * month (start = trailing default, end = today), so a target across a month
 * boundary needs one chevron hop first. Keys are zero-padded `YYYY-MM-DD`,
 * so a plain string compare orders months correctly; the trailing-29→10
 * window can cross at most one boundary, so a single hop always suffices.
 */
function pressGridDay(grid: 'start' | 'end', key: string, openMonth: string) {
  const targetMonth = key.slice(0, 7);
  if (targetMonth > openMonth) {
    fireEvent.press(screen.getByTestId(`custom-range-${grid}-next`));
  } else if (targetMonth < openMonth) {
    fireEvent.press(screen.getByTestId(`custom-range-${grid}-prev`));
  }
  fireEvent.press(screen.getByTestId(`custom-range-${grid}-day-${key}`));
}

function startOpenMonth(): string {
  return toDateKey(dayAgo(29)).slice(0, 7);
}

function endOpenMonth(): string {
  return toDateKey(dayAgo(0)).slice(0, 7);
}

test('closed renders nothing; open shows both pickers', () => {
  render(
    <CustomRangeSheet
      open={false}
      initial={null}
      onClose={jest.fn()}
      onApply={jest.fn()}
    />,
  );
  expect(screen.queryByTestId('custom-range-sheet')).toBeNull();

  renderOpen();
  expect(screen.getByTestId('custom-range-sheet')).toBeTruthy();
  expect(screen.getByTestId('custom-range-start')).toBeTruthy();
  expect(screen.getByTestId('custom-range-end')).toBeTruthy();
});

test('picking days then Apply returns their keys', () => {
  const { onApply } = renderOpen();
  const startKey = toDateKey(dayAgo(10));
  const endKey = toDateKey(dayAgo(2));

  pressGridDay('start', startKey, startOpenMonth());
  pressGridDay('end', endKey, endOpenMonth());
  fireEvent.press(screen.getByTestId('custom-range-apply'));

  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply).toHaveBeenCalledWith({ startKey, endKey });
});

test('reopen restarts from the applied window', () => {
  const startKey = toDateKey(dayAgo(20));
  const endKey = toDateKey(dayAgo(12));
  const onApply = jest.fn();
  const { rerender } = render(
    <CustomRangeSheet
      open
      initial={{ startKey, endKey }}
      onClose={jest.fn()}
      onApply={onApply}
    />,
  );
  // No taps: Apply echoes the applied window back unchanged.
  fireEvent.press(screen.getByTestId('custom-range-apply'));
  expect(onApply).toHaveBeenCalledWith({ startKey, endKey });
  rerender(
    <CustomRangeSheet
      open={false}
      initial={{ startKey, endKey }}
      onClose={jest.fn()}
      onApply={onApply}
    />,
  );
  expect(screen.queryByTestId('custom-range-sheet')).toBeNull();
});

test('Cancel and the scrim both close without applying', () => {
  const { onClose, onApply } = renderOpen();
  fireEvent.press(screen.getByTestId('custom-range-cancel'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onApply).not.toHaveBeenCalled();

  fireEvent.press(screen.getByTestId('custom-range-sheet-scrim'));
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(onApply).not.toHaveBeenCalled();
});

test('summary line shows the picked window and day count', () => {
  const startKey = toDateKey(dayAgo(10));
  const endKey = toDateKey(dayAgo(2));
  renderOpen({ startKey, endKey });
  // 9 calendar days inclusive (10 → 2 days ago).
  expect(screen.getByTestId('custom-range-sheet-summary')).toHaveTextContent(
    /9 hari/,
  );
});

test('summary follows new picks, ordered even when reversed', () => {
  renderOpen();
  const earlyKey = toDateKey(dayAgo(10));
  const lateKey = toDateKey(dayAgo(2));
  // End tapped first, then an earlier start: the line still reads true.
  pressGridDay('end', lateKey, endOpenMonth());
  pressGridDay('start', earlyKey, startOpenMonth());
  expect(screen.getByTestId('custom-range-sheet-summary')).toHaveTextContent(
    /9 hari/,
  );
});

test('sheet carries the house grab handle', () => {
  renderOpen();
  expect(screen.getByTestId('custom-range-sheet-handle')).toBeTruthy();
});

test('headers read as section headers without step numbers', () => {
  renderOpen();
  const startHeader = screen.getByTestId('custom-range-sheet-start-header');
  const endHeader = screen.getByTestId('custom-range-sheet-end-header');
  expect(startHeader).toHaveTextContent(/Tanggal mulai/);
  expect(startHeader).not.toHaveTextContent(/[12] ·/);
  expect(endHeader).toHaveTextContent(/Tanggal selesai/);
  expect(endHeader).not.toHaveTextContent(/[12] ·/);
});

test('dragging the handle down closes the sheet', async () => {
  const { onClose } = renderOpen();
  const handle = screen.getByTestId('custom-range-sheet-handle');
  fireEvent(handle, 'touchStart', {
    nativeEvent: { touches: [{ pageX: 0, pageY: 100 }] },
  });
  fireEvent(handle, 'touchMove', {
    nativeEvent: { touches: [{ pageX: 0, pageY: 260 }] },
  });
  fireEvent(handle, 'touchEnd', {
    nativeEvent: { changedTouches: [{ pageX: 0, pageY: 260 }] },
  });
  // Past the close threshold: the exit animation runs, then onClose fires.
  await screen.findByTestId('custom-range-sheet');
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

test('reopening after a drag-close remounts clean (no stuck black scrim)', async () => {
  // Regression for the Oct 2026 black-scrim bug: `return null` is not an
  // unmount, so hook state (dragY/closing/picks) survives a close. The
  // harness below REMOUNTS the sheet on reopen (parent-driven, exactly how
  // analytics.tsx now gates it), proving the card comes back at rest and
  // interactive with the last-applied window.
  function Harness() {
    const [open, setOpen] = useState(false);
    const [applied, setApplied] = useState<{ startKey: string; endKey: string } | null>(
      null,
    );
    return (
      <>
        <Pressable
          testID="toggle-sheet"
          accessibilityRole="button"
          onPress={() => setOpen((v) => !v)}
        >
          <Text>toggle</Text>
        </Pressable>
        {open ? (
          <CustomRangeSheet
            open={open}
            initial={applied}
            onClose={() => setOpen(false)}
            onApply={(next) => {
              setApplied(next);
              setOpen(false);
            }}
          />
        ) : null}
      </>
    );
  }
  render(<Harness />);
  const startKey = toDateKey(dayAgo(10));
  const endKey = toDateKey(dayAgo(2));

  fireEvent.press(screen.getByTestId('toggle-sheet'));
  pressGridDay('start', startKey, startOpenMonth());
  pressGridDay('end', endKey, endOpenMonth());
  const handle = screen.getByTestId('custom-range-sheet-handle');
  fireEvent(handle, 'touchStart', {
    nativeEvent: { touches: [{ pageX: 0, pageY: 100 }] },
  });
  fireEvent(handle, 'touchMove', {
    nativeEvent: { touches: [{ pageX: 0, pageY: 300 }] },
  });
  fireEvent(handle, 'touchEnd', {
    nativeEvent: { changedTouches: [{ pageX: 0, pageY: 300 }] },
  });
  await waitFor(
    () => expect(screen.queryByTestId('custom-range-sheet')).toBeNull(),
    // The drag-close rides the 200ms exit animation; give CI-loaded
    // runners headroom so this regression lock never flakes.
    { timeout: 5000 },
  );

  // Reopen: remounts fresh — the card is BACK AT REST (translateY 0, not an
  // off-screen black-scrim), interactive, with the trailing-30-days default
  // (the drag-close only closed the sheet; it never applied a window).
  fireEvent.press(screen.getByTestId('toggle-sheet'));
  expect(screen.getByTestId('custom-range-sheet-card')).toHaveStyle({
    transform: [{ translateY: 0 }],
  });
  expect(screen.getByTestId('custom-range-sheet-summary')).toHaveTextContent(
    /30 hari/,
  );
});
