import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

const mockSession = {
  verify: jest.fn(),
  requestCode: jest.fn(async () => {}),
  setName: jest.fn(async () => {}),
  signOut: jest.fn(async () => {}),
  retry: jest.fn(async () => {}),
  termsAccepted: false,
  acceptTerms: jest.fn(async () => {}),
};
jest.mock('../../context/SessionContext', () => ({ useSession: () => mockSession }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ email: 'ann@example.org' }),
}));

import VerifyScreen from '../../app/(auth)/verify';
import NameScreen from '../../app/(auth)/name';
import OfflineScreen from '../../app/offline';
import TermsScreen from '../../app/terms';

describe('auth screens', () => {
  beforeEach(() => jest.clearAllMocks());

  it('checks a code once even if the last digit changes while it is being checked', async () => {
    // Never settles, so the first check is still running
    mockSession.verify.mockReturnValue(new Promise(() => {}));
    await render(<VerifyScreen />);
    for (let digit = 1; digit <= 5; digit++) {
      await fireEvent.changeText(screen.getByLabelText(`Digit ${digit}`), String(digit));
    }
    await fireEvent.changeText(screen.getByLabelText('Digit 6'), '6');
    await fireEvent.changeText(screen.getByLabelText('Digit 6'), '7');
    expect(mockSession.verify).toHaveBeenCalledTimes(1);
    expect(mockSession.verify).toHaveBeenCalledWith('ann@example.org', '123456');
  });

  it('signs out from the name step to use a different email', async () => {
    await render(<NameScreen />);
    await fireEvent.press(screen.getByText('Use a different email'));
    expect(mockSession.signOut).toHaveBeenCalledTimes(1);
  });

  it('checks the session again from the offline screen', async () => {
    await render(<OfflineScreen />);
    expect(screen.getByText("Can't reach the server")).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockSession.retry).toHaveBeenCalledTimes(1);
  });

  it('can sign out from the offline screen', async () => {
    await render(<OfflineScreen />);
    await fireEvent.press(screen.getByText('Sign out'));
    expect(mockSession.signOut).toHaveBeenCalledTimes(1);
  });

  it('has a new user agree to the terms with their name, agreeing first', async () => {
    await render(<NameScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('John Smith'), 'Ann Lee');
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockSession.setName).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockSession.setName).toHaveBeenCalledWith('Ann Lee'));
    expect(mockSession.acceptTerms).toHaveBeenCalledTimes(1);
    expect(mockSession.acceptTerms.mock.invocationCallOrder[0]).toBeLessThan(
      mockSession.setName.mock.invocationCallOrder[0],
    );
  });

  it('opens the terms on the web', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<NameScreen />);
    await fireEvent.press(screen.getByText('Terms of Service'));
    expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/\/terms$/));
  });

  it('accepts the current terms from the terms screen', async () => {
    await render(<TermsScreen />);
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockSession.acceptTerms).toHaveBeenCalledTimes(1));
  });

  it('can sign out from the terms screen', async () => {
    await render(<TermsScreen />);
    await fireEvent.press(screen.getByText('Sign out'));
    expect(mockSession.signOut).toHaveBeenCalledTimes(1);
  });
});
