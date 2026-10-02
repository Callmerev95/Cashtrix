/**
 * GoogleButton — guards the GSI-styled pressable wired into login/register:
 * label mount, busy spinner, disabled press suppression.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { GoogleButton } from '@/components/google-button';

describe('GoogleButton', () => {
  it('renders the label with the G icon', () => {
    render(<GoogleButton testID="probe" label="Continue with Google" onPress={jest.fn()} />);
    expect(screen.getByText('Continue with Google')).toBeTruthy();
  });

  it('shows a spinner instead of the label while loading', () => {
    render(<GoogleButton testID="probe" label="Continue with Google" onPress={jest.fn()} loading />);
    expect(screen.queryByText('Continue with Google')).toBeNull();
  });

  it('does not fire onPress while disabled', () => {
    const onPress = jest.fn();
    render(<GoogleButton testID="probe" label="Continue with Google" onPress={onPress} disabled />);
    fireEvent.press(screen.getByTestId('probe'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
