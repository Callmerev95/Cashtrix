/**
 * Screen wrapper smoke test — verifies the canonical frame values
 * (canvas colour, 20px margin, ≥96px + safe-area bottom clearance) actually
 * reach the rendered style, since this is what keeps the floating nav from
 * occluding content on every screen.
 */
import { render } from '@testing-library/react-native';
import { StyleSheet, Text, type ViewStyle } from 'react-native';

import { Screen } from '@/components';
import { colors, layout } from '@/theme';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

describe('Screen wrapper', () => {
  it('renders its children', () => {
    const { getByText } = render(
      <Screen>
        <Text>Dashboard</Text>
      </Screen>,
    );

    expect(getByText('Dashboard')).toBeTruthy();
  });

  it('applies the canvas colour, 20px margin and 96px + inset clearance', () => {
    const { getByTestId } = render(<Screen testID="screen" />);
    const style = StyleSheet.flatten(
      getByTestId('screen').props.style,
    ) as ViewStyle;

    expect(style.backgroundColor).toBe(colors.background);
    expect(style.paddingHorizontal).toBe(layout.screenMargin);
    expect(style.paddingBottom).toBe(layout.navClearance + 34);
  });
});
