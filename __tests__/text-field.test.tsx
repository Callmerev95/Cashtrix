/**
 * TextField focus-ring regression test — guards the Android focus-flap fix.
 *
 * Finding: changing the style of the well (or any ancestor of the focused
 * input) while it holds focus drops focus, and Android walks it forward
 * field-to-field until nothing is focused — on device that reads as
 * "keyboard opens then instantly closes". The well/input styles must
 * therefore be identical before, during, and after focus; only the sibling
 * ring overlay may change (its opacity).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TextField } from '@/components/text-field';

function wellStyleOf(testID: string) {
  return screen.getByTestId(`${testID}-well`).props.style;
}

function ringOpacityOf(testID: string) {
  const ring = screen.getByTestId(`${testID}-focus-ring`);
  return StyleSheet.flatten(ring.props.style).opacity;
}

describe('TextField focus ring', () => {
  it('keeps the well and input styles identical across focus/blur', () => {
    render(<TextField testID="probe" />);
    const input = screen.getByTestId('probe');
    const before = wellStyleOf('probe');

    fireEvent(input, 'focus');
    // Red on the old code: the focused border was applied to the well here.
    expect(wellStyleOf('probe')).toEqual(before);

    fireEvent(input, 'blur');
    expect(wellStyleOf('probe')).toEqual(before);
  });

  it('toggles only the sibling ring opacity on focus/blur', () => {
    render(<TextField testID="probe" />);
    const input = screen.getByTestId('probe');

    expect(ringOpacityOf('probe')).toBe(0);
    fireEvent(input, 'focus');
    expect(ringOpacityOf('probe')).toBe(1);
    fireEvent(input, 'blur');
    expect(ringOpacityOf('probe')).toBe(0);
  });

  it('suppresses the ring while the error border shows', () => {
    render(<TextField testID="probe" hasError />);
    const input = screen.getByTestId('probe');
    const before = wellStyleOf('probe');

    fireEvent(input, 'focus');
    expect(ringOpacityOf('probe')).toBe(0);
    expect(wellStyleOf('probe')).toEqual(before);
  });
});
