/**
 * Undo snackbar tests (V4 AC #1/#6). The component is the render seam: the
 * ~5 s window, the `Urungkan` press and the auto-dismiss all live here, while
 * the actual `restore_transaction` call lives in the transactions context.
 * No Supabase, no router — just the timer contract that keeps the window.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { UndoSnackbar } from '@/features/transactions';

const SNACK = {
  id: 'tx-1',
  label: 'Makanan · Rp 25.000 dihapus',
  createdAt: 1_700_000_000_000,
};

describe('UndoSnackbar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('tidak merender apa pun tanpa snack', () => {
    render(<UndoSnackbar snack={null} onUndo={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.queryByTestId('undo-snackbar')).toBeNull();
  });

  it('menampilkan label + tombol Urungkan', () => {
    render(<UndoSnackbar snack={SNACK} onUndo={jest.fn()} onDismiss={jest.fn()} />);

    expect(screen.getByTestId('undo-snackbar')).toBeTruthy();
    expect(screen.getByText(SNACK.label)).toBeTruthy();
    expect(screen.getByTestId('undo-button')).toBeTruthy();
  });

  it('memanggil onUndo saat Urungkan ditekan (tanpa dismiss)', () => {
    const onUndo = jest.fn();
    const onDismiss = jest.fn();
    render(<UndoSnackbar snack={SNACK} onUndo={onUndo} onDismiss={onDismiss} />);

    fireEvent.press(screen.getByTestId('undo-button'));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('menutup sendiri setelah 5 detik (soft-delete berdiri)', () => {
    const onDismiss = jest.fn();
    render(<UndoSnackbar snack={SNACK} onUndo={jest.fn()} onDismiss={onDismiss} />);

    act(() => {
      jest.advanceTimersByTime(4_999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('mengulang jendela untuk snack baru (createdAt berbeda)', () => {
    const onDismiss = jest.fn();
    const { rerender } = render(
      <UndoSnackbar snack={SNACK} onUndo={jest.fn()} onDismiss={onDismiss} />,
    );

    act(() => {
      jest.advanceTimersByTime(4_000);
    });
    rerender(
      <UndoSnackbar
        snack={{ ...SNACK, id: 'tx-2', createdAt: SNACK.createdAt + 1 }}
        onUndo={jest.fn()}
        onDismiss={onDismiss}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(4_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});