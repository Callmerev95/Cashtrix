/**
 * Shared balance visibility (polish batch 2026-10-19). The hero eye used to
 * hide only its own amount; it now drives every wallet balance surface via
 * one module store. The store outlives a test case, so each test resets it
 * together with the persisted preference.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  BALANCE_HIDDEN_KEY,
  MASKED_BALANCE_HERO,
  MASKED_BALANCE_ROW,
  getBalanceHiddenSnapshot,
  resetBalanceVisibilityForTests,
  setBalanceHidden,
  toggleBalanceHidden,
  useBalanceHidden,
  type Wallet,
} from '@/features/wallets';
import { WalletRow } from '@/features/wallets/components/wallet-row';

const wallet: Wallet = {
  id: 'w1',
  name: 'BCA',
  type: 'bank',
  openingBalance: 0,
  balance: 248590.4,
  transactionCount: 2,
  archivedAt: null,
};

function Probe() {
  const { hidden } = useBalanceHidden();
  return <Text>{hidden ? 'hidden' : 'visible'}</Text>;
}

beforeEach(async () => {
  resetBalanceVisibilityForTests();
  await AsyncStorage.removeItem(BALANCE_HIDDEN_KEY);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('mask constants', () => {
  it('uses 4 bullets for rows (screenshot) and 6 for the hero', () => {
    expect(MASKED_BALANCE_ROW).toBe('Rp ••••');
    expect(MASKED_BALANCE_HERO).toBe('Rp ••••••');
  });
});

describe('visibility store', () => {
  it('toggles the shared snapshot', () => {
    expect(getBalanceHiddenSnapshot()).toBe(false);
    setBalanceHidden(true);
    expect(getBalanceHiddenSnapshot()).toBe(true);
    toggleBalanceHidden();
    expect(getBalanceHiddenSnapshot()).toBe(false);
  });

  it('hydrates from AsyncStorage for every subscriber', async () => {
    await AsyncStorage.setItem(BALANCE_HIDDEN_KEY, '1');
    render(<Probe />);

    expect(await screen.findByText('hidden')).toBeTruthy();
  });

  it('lets an explicit toggle win over a late hydration read', async () => {
    let resolveRead!: (value: string | null) => void;
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );

    render(<Probe />);
    act(() => setBalanceHidden(false));
    await act(async () => {
      resolveRead('1');
    });

    expect(getBalanceHiddenSnapshot()).toBe(false);
    expect(screen.getByText('visible')).toBeTruthy();
  });
});

describe('WalletRow masking', () => {
  it('shows the real balance while visible', async () => {
    render(<WalletRow wallet={wallet} onPress={() => {}} testID="row" />);

    expect(await screen.findByText('Rp 248.590,40')).toBeTruthy();
    expect(screen.getByTestId('row').props.accessibilityLabel).toBe(
      'BCA, saldo Rp 248.590,40',
    );
  });

  it('follows the eye: masked text + a11y label without the amount', async () => {
    render(<WalletRow wallet={wallet} onPress={() => {}} testID="row" />);
    await screen.findByText('Rp 248.590,40');

    act(() => setBalanceHidden(true));

    await waitFor(() => {
      expect(screen.getByText(MASKED_BALANCE_ROW)).toBeTruthy();
    });
    expect(screen.queryByText('Rp 248.590,40')).toBeNull();
    expect(screen.getByTestId('row').props.accessibilityLabel).toBe(
      'BCA, saldo disembunyikan',
    );
  });
});
