import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSession = {
  verify: jest.fn(),
  requestCode: jest.fn(async () => {}),
  setName: jest.fn(async () => {}),
  signOut: jest.fn(async () => {}),
  retry: jest.fn(async () => {}),
};
jest.mock('../../context/SessionContext', () => ({ useSession: () => mockSession }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ email: 'ann@example.org' }),
}));

import VerifyScreen from '../../app/(auth)/verify';
import NameScreen from '../../app/(auth)/name';
import OfflineScreen from '../../app/offline';

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
});
