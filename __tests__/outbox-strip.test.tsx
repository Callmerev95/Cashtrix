/**
 * OB3 strip contract: waiting/failed/done copy, the send action only when
 * something can be retried, and the disabled state while a flush is running.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { OutboxStrip } from '@/features/outbox/components/outbox-strip';

describe('OutboxStrip', () => {
  it('renders nothing when the queue and the done notice are empty', () => {
    render(
      <OutboxStrip
        waiting={0}
        failed={0}
        done={0}
        flushing={false}
        onSendNow={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('outbox-strip')).toBeNull();
  });

  it('shows the waiting count and the send action', () => {
    const onSendNow = jest.fn();
    render(
      <OutboxStrip
        waiting={2}
        failed={0}
        done={0}
        flushing={false}
        onSendNow={onSendNow}
      />,
    );

    expect(screen.getByText('2 menunggu terkirim')).toBeTruthy();
    fireEvent.press(screen.getByTestId('outbox-send-now'));
    expect(onSendNow).toHaveBeenCalledTimes(1);
  });

  it('shows both counts when waiting rows coexist with refusals', () => {
    render(
      <OutboxStrip
        waiting={2}
        failed={1}
        done={0}
        flushing={false}
        onSendNow={jest.fn()}
      />,
    );
    expect(screen.getByText('2 menunggu terkirim · 1 gagal terkirim')).toBeTruthy();
    expect(screen.getByTestId('outbox-failed-count')).toBeTruthy();
    expect(screen.getByTestId('outbox-send-now')).toBeTruthy();
  });

  it('hides the send action when only terminal failures remain', () => {
    render(
      <OutboxStrip
        waiting={0}
        failed={2}
        done={0}
        flushing={false}
        onSendNow={jest.fn()}
      />,
    );
    expect(screen.getByText('2 gagal terkirim')).toBeTruthy();
    expect(screen.queryByTestId('outbox-send-now')).toBeNull();
  });

  it('disables send while a flush is in flight', () => {
    render(
      <OutboxStrip
        waiting={1}
        failed={0}
        done={0}
        flushing
        onSendNow={jest.fn()}
      />,
    );
    expect(
      screen.getByTestId('outbox-send-now').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('shows the short-lived done notice only when the queue is empty', () => {
    const { rerender } = render(
      <OutboxStrip
        waiting={0}
        failed={0}
        done={3}
        flushing={false}
        onSendNow={jest.fn()}
      />,
    );
    expect(screen.getByTestId('outbox-done')).toBeTruthy();
    expect(screen.getByText('3 transaksi terkirim')).toBeTruthy();

    rerender(
      <OutboxStrip
        waiting={1}
        failed={0}
        done={3}
        flushing={false}
        onSendNow={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('outbox-done')).toBeNull();
  });
});
