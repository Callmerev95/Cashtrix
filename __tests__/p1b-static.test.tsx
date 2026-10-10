/**
 * P1b pull behavior locks (JS-thread responder design — fully Jest-safe,
 * no native deps, so these assert the REAL logic, not a fallback).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ScrollView, Text } from 'react-native';

import { PullGesture, PullHeader, usePullRefresh } from '@/components/pull-refresh';
import { reanimatedUsable } from '@/components/reanimated-cap';
import { Stagger } from '@/components/stagger';
import { TabPop } from '@/components/tab-pop';

describe('P1b static fallbacks', () => {
  it('reanimated is unusable in Jest: loaders must degrade, never throw', () => {
    // Regression lock for the P1b navigation-suite breakage: requiring the
    // module is not proof it works (hooks are undefined without the
    // bridge). If this ever flips true in Jest, the twins need a mock.
    expect(reanimatedUsable()).toBe(false);
  });

  it('stagger renders children with its testID', async () => {
    render(
      <Stagger index={2} testID="probe-stagger">
        <Text>row</Text>
      </Stagger>,
    );
    expect(await screen.findByTestId('probe-stagger')).toBeTruthy();
    expect(screen.getByText('row')).toBeTruthy();
  });

  it('tab pop renders children motionlessly', async () => {
    render(
      <TabPop focused>
        <Text>tab</Text>
      </TabPop>,
    );
    expect(screen.getByText('tab')).toBeTruthy();
  });
});

describe('custom pull behavior (no worklets, no RNGH)', () => {
  function renderPull(spy: jest.Mock) {
    return render(
      <PullGesture refreshing={false} onRefresh={spy}>
        <ScrollView testID="pull-scroller">
          <PullHeader gap={0} testID="pull-spinner" />
          <Text>content</Text>
        </ScrollView>
      </PullGesture>,
    );
  }

  function scroller() {
    return screen.UNSAFE_getByType(ScrollView);
  }

  function move(y: number, id = 1) {
    fireEvent(scroller(), 'touchMove', {
      nativeEvent: { touches: [{ identifier: id, pageY: y }] },
    });
  }

  it('fires refresh after a past-threshold pull from the top', async () => {
    const spy = jest.fn(async () => undefined);
    renderPull(spy);
    move(100);
    move(400);
    fireEvent(scroller(), 'touchEnd', { nativeEvent: {} });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('needs no touchStart: origin comes from the first move', async () => {
    const spy = jest.fn(async () => undefined);
    renderPull(spy);
    move(100);
    move(400);
    fireEvent(scroller(), 'touchEnd', { nativeEvent: {} });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('ignores identifier shuffling between events', async () => {
    const spy = jest.fn(async () => undefined);
    renderPull(spy);
    move(100, 7);
    move(400, 42);
    fireEvent(scroller(), 'touchEnd', { nativeEvent: {} });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('stays silent on a short pull', async () => {
    const spy = jest.fn(async () => undefined);
    renderPull(spy);
    move(100);
    move(140);
    fireEvent(scroller(), 'touchEnd', { nativeEvent: {} });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).not.toHaveBeenCalled();
  });

  it('ignores pulls started mid-list', async () => {
    const spy = jest.fn(async () => undefined);
    renderPull(spy);
    fireEvent(scroller(), 'scroll', { nativeEvent: { contentOffset: { y: 60 } } });
    move(100);
    move(900);
    fireEvent(scroller(), 'touchEnd', { nativeEvent: {} });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).not.toHaveBeenCalled();
  });

  it('tolerates sticky residue at the top (epsilon gate)', async () => {
    const spy = jest.fn(async () => undefined);
    renderPull(spy);
    fireEvent(scroller(), 'scroll', { nativeEvent: { contentOffset: { y: 0.5 } } });
    move(100);
    move(400);
    fireEvent(scroller(), 'touchEnd', { nativeEvent: {} });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('aborts on multi-touch and on non-finite coordinates', async () => {
    const spy = jest.fn(async () => undefined);
    renderPull(spy);
    move(100);
    fireEvent(scroller(), 'touchMove', {
      nativeEvent: {
        touches: [
          { identifier: 1, pageY: 400 },
          { identifier: 2, pageY: 410 },
        ],
      },
    });
    fireEvent(scroller(), 'touchMove', {
      nativeEvent: { touches: [{ identifier: 1, pageY: NaN }] },
    });
    fireEvent(scroller(), 'touchEnd', { nativeEvent: {} });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).not.toHaveBeenCalled();
  });

  it('provider refresh resolves through the hook', async () => {
    const spy = jest.fn(async () => undefined);
    function HookProbe({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
      const { onRefresh: fire } = usePullRefresh(onRefresh);
      return <Text onPress={fire}>go</Text>;
    }
    render(<HookProbe onRefresh={spy} />);
    fireEvent.press(screen.getByText('go'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });
});
