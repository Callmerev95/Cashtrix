/**
 * Obsidian hero card — pure seams (visibility pref) plus the rendered
 * contract: watermark + eye toggle + masked/visible amount + holder line.
 * The ambient sheen is motion-only (dead under reduce-motion) and asserts
 * nothing.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TotalBalanceCard } from '@/features/wallets/components/total-balance-card';
import {
  BALANCE_HIDDEN_KEY,
  parseBalanceHidden,
  readBalanceHidden,
  writeBalanceHidden,
} from '@/features/wallets';

describe('parseBalanceHidden', () => {
  it("only the exact '1' counts as hidden", () => {
    expect(parseBalanceHidden('1')).toBe(true);
  });

  it.each([['0'], [''], [null], [undefined], ['true']])(
    'ignores %p (visible)',
    (value) => {
      expect(parseBalanceHidden(value)).toBe(false);
    },
  );
});

describe('balance-hidden storage', () => {
  it('round-trips through AsyncStorage and never throws', async () => {
    await AsyncStorage.removeItem(BALANCE_HIDDEN_KEY);
    await expect(readBalanceHidden()).resolves.toBe(false);
    await writeBalanceHidden(true);
    await expect(readBalanceHidden()).resolves.toBe(true);
    await writeBalanceHidden(false);
    await expect(readBalanceHidden()).resolves.toBe(false);
  });
});

describe('TotalBalanceCard', () => {
  const props = {
    total: 248590.4,
    walletCount: 3,
    holderName: 'Evelyn Vance',
  };

  it('shows the grouped amount, count, watermark and holder', async () => {
    await AsyncStorage.removeItem(BALANCE_HIDDEN_KEY);
    render(<TotalBalanceCard {...props} />);

    expect(await screen.findByTestId('total-balance-card')).toBeTruthy();
    expect(screen.getByTestId('total-balance').props.children).toBe(
      'Rp 248.590,40',
    );
    expect(screen.getByText('EVELYN VANCE')).toBeTruthy();
    expect(screen.getByTestId('balance-visibility')).toBeTruthy();
  });

  it('eye toggle masks the amount and persists the choice', async () => {
    await AsyncStorage.removeItem(BALANCE_HIDDEN_KEY);
    render(<TotalBalanceCard {...props} />);
    await screen.findByTestId('total-balance-card');

    fireEvent.press(screen.getByTestId('balance-visibility'));
    await waitFor(() => {
      expect(screen.getByTestId('total-balance').props.children).toBe(
        'Rp ••••••',
      );
    });
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(BALANCE_HIDDEN_KEY)).toBe('1');
    });

    fireEvent.press(screen.getByTestId('balance-visibility'));
    await waitFor(() => {
      expect(screen.getByTestId('total-balance').props.children).toBe(
        'Rp 248.590,40',
      );
    });
  });

  it('starts masked when the preference is set', async () => {
    await AsyncStorage.setItem(BALANCE_HIDDEN_KEY, '1');
    render(<TotalBalanceCard {...props} />);

    await waitFor(() => {
      expect(screen.getByTestId('total-balance').props.children).toBe(
        'Rp ••••••',
      );
    });
    await AsyncStorage.removeItem(BALANCE_HIDDEN_KEY);
  });

  it('renders the skeleton while loading', () => {
    render(<TotalBalanceCard {...props} loading />);

    expect(screen.getByTestId('total-balance-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('total-balance')).toBeNull();
  });
});
