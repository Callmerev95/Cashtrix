/**
 * Quick actions (P3b-1 menu + P3b-2 Tahap 1 sheet skin).
 *
 * `showQuickActions()` keeps its P3b-1 signature at the 5 call sites; only
 * the rendering moved from the stiff native Alert to the themed bottom
 * sheet (`QuickActionSheetHost`, one core-Modal at the app root — same
 * shell as VoiceBottomSheet, no portal, no gesture code).
 *
 * Tested: store publish/dismiss/pick + haptic; sheet option/scrim/cancel;
 * WalletRow hold forwarding (a dropped `onLongPress` prop turns red).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { QuickActionSheetHost } from '@/components/quick-action-host';
import { QuickActionSheet, shouldCloseSheet, shouldClaimSheetDrag, sheetFlingVelocity } from '@/components/quick-action-sheet';
import {
  dismissQuickActions,
  getQuickActionsSnapshot,
  pickQuickAction,
  showQuickActions,
  type QuickAction,
} from '@/components/quick-action-store';
import { WalletRow } from '@/features/wallets/components/wallet-row';
import type { Wallet } from '@/features/wallets';

jest.mock('@/features/haptics/api', () => ({
  tapToggle: jest.fn(async () => undefined),
}));

const { tapToggle } = jest.requireMock('@/features/haptics/api') as {
  tapToggle: jest.Mock;
};

beforeEach(() => {
  dismissQuickActions();
  tapToggle.mockClear();
});

const actions: QuickAction[] = [
  { label: 'Ubah', icon: 'edit', run: jest.fn() },
  { label: 'Hapus', icon: 'delete-outline', destructive: true, run: jest.fn() },
];

describe('quick-action store', () => {
  it('menerbitkan request + bergetar sekali (tanpa dialog native)', () => {
    showQuickActions('Dana', actions, 'Batal');
    expect(getQuickActionsSnapshot()).toEqual({
      title: 'Dana',
      actions,
      cancelLabel: 'Batal',
    });
    expect(tapToggle).toHaveBeenCalledTimes(1);
  });

  it('dismiss mengosongkan, pick menjalankan lalu mengosongkan', () => {
    showQuickActions('Dana', actions, 'Batal');
    dismissQuickActions();
    expect(getQuickActionsSnapshot()).toBeNull();

    showQuickActions('Dana', actions, 'Batal');
    pickQuickAction(actions[1]!);
    expect(actions[1]!.run).toHaveBeenCalledTimes(1);
    expect(actions[0]!.run).not.toHaveBeenCalled();
    expect(getQuickActionsSnapshot()).toBeNull();
  });
});

describe('QuickActionSheet', () => {
  it('ambang tutup: jauh/cepat = tutup, dekat/lambat = pegas balik', () => {
    expect(shouldCloseSheet(91, 0)).toBe(true);
    expect(shouldCloseSheet(90, 0)).toBe(false);
    expect(shouldCloseSheet(0, 0.71)).toBe(true);
    expect(shouldCloseSheet(0, 0.7)).toBe(false);
    expect(shouldCloseSheet(-40, 0)).toBe(false);
  });

  it('ambang klaim: hanya vertikal-dominan lewat slop (tap + horizontal lolos)', () => {
    expect(shouldClaimSheetDrag(20, 0)).toBe(true);
    expect(shouldClaimSheetDrag(-20, 0)).toBe(true);
    expect(shouldClaimSheetDrag(8, 0)).toBe(false);
    expect(shouldClaimSheetDrag(0, 0)).toBe(false);
    expect(shouldClaimSheetDrag(30, 40)).toBe(false);
    expect(shouldClaimSheetDrag(5, 2)).toBe(false);
  });

  it('kecepatan lepas: px/ms, nol bila durasi tak-valid', () => {
    expect(sheetFlingVelocity(200, 100)).toBeCloseTo(2);
    expect(sheetFlingVelocity(-50, 100)).toBeCloseTo(-0.5);
    expect(sheetFlingVelocity(100, 0)).toBe(0);
  });

  it('gagang drag terpasang (seret-bawah = tutup di device)', () => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    render(
      <QuickActionSheet
        open
        title="Dana"
        actions={actions}
        cancelLabel="Batal"
        onPick={onPick}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId('quick-action-handle')).toBeTruthy();
    expect(screen.getByText('Dana')).toBeTruthy();
    expect(screen.getByTestId('quick-action-option-0')).toBeTruthy();
    expect(screen.getByTestId('quick-action-option-1')).toBeTruthy();
    expect(screen.getByTestId('quick-action-cancel')).toBeTruthy();

    fireEvent.press(screen.getByTestId('quick-action-option-1'));
    expect(onPick).toHaveBeenCalledWith(actions[1]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('scrim + Batal menutup tanpa menjalankan apa pun', () => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    render(
      <QuickActionSheet
        open
        title="Dana"
        actions={actions}
        cancelLabel="Batal"
        onPick={onPick}
        onClose={onClose}
      />,
    );
    fireEvent.press(screen.getByTestId('quick-action-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('quick-action-cancel'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('QuickActionSheetHost', () => {
  it('muncul saat ada request, hilang + handler jalan saat opsi dipilih', () => {
    const run = jest.fn();
    render(<QuickActionSheetHost />);
    expect(screen.queryByTestId('quick-action-option-0')).toBeNull();

    act(() => {
      showQuickActions('Dana', [{ label: 'Ubah', run }], 'Batal');
    });
    expect(screen.getByTestId('quick-action-option-0')).toBeTruthy();

    fireEvent.press(screen.getByTestId('quick-action-option-0'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('quick-action-option-0')).toBeNull();
  });
});

describe('WalletRow onLongPress', () => {
  const wallet = {
    id: 'w1',
    name: 'Dana',
    type: 'ewallet',
    balance: 150000,
    transactionCount: 2,
  } as Wallet;

  it('meneruskan tahan ke handler (tanpa handler = tanpa Pressable hold)', () => {
    const onLongPress = jest.fn();
    render(
      <WalletRow
        testID="wallet-w1"
        wallet={wallet}
        onPress={jest.fn()}
        onLongPress={onLongPress}
      />,
    );
    fireEvent(screen.getByTestId('wallet-w1'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('baris arsip tanpa onPress tetap bisa di-hold (unarchive)', () => {
    const onLongPress = jest.fn();
    render(
      <WalletRow testID="wallet-w1" wallet={wallet} onLongPress={onLongPress} />,
    );
    fireEvent(screen.getByTestId('wallet-w1'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
