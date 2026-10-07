import type { ReactNode } from 'react';
import { render } from '@testing-library/react-native';

let mockStatus = 'loading';
let mockUser: { id: number; email: string; name: string | null } | null = null;
let mockTermsAccepted = true;
let mockSegments: string[] = [];
const mockReplace = jest.fn();
const mockHideAsync = jest.fn(async () => {});

jest.mock('../../context/SessionContext', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => ({ status: mockStatus, user: mockUser, termsAccepted: mockTermsAccepted }),
}));
jest.mock('../../context/SocketContext', () => ({
  SocketProvider: ({ children }: { children: ReactNode }) => children,
  useSocket: () => ({ isConnected: false, isLoading: false, meetingCode: null }),
}));
jest.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return {
    Stack,
    useRouter: () => ({ replace: mockReplace }),
    useSegments: () => mockSegments,
  };
});
// The real provider waits for the device's insets before rendering anything
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: () => mockHideAsync(),
}));

import RootLayout from '../../app/_layout';

describe('root layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments = [];
    mockUser = null;
    mockTermsAccepted = true;
  });

  it("goes to the offline screen, not sign-in, when the session can't be checked", async () => {
    mockStatus = 'unreachable';
    mockSegments = ['(auth)', 'login'];
    await render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/offline');
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/login');
    expect(mockHideAsync).toHaveBeenCalled();
  });

  it('stays on the offline screen while the server is unreachable', async () => {
    mockStatus = 'unreachable';
    mockSegments = ['offline'];
    await render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('goes to sign-in when signed out', async () => {
    mockStatus = 'signedOut';
    mockSegments = ['offline'];
    await render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('keeps the splash screen while the session loads', async () => {
    mockStatus = 'loading';
    await render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  it('asks a new user for a name, where the terms are asked too, before the terms screen', async () => {
    mockStatus = 'signedIn';
    mockUser = { id: 1, email: 'a@b.c', name: null };
    mockTermsAccepted = false;
    mockSegments = ['(auth)', 'verify'];
    await render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/name');
  });

  it('asks a signed-in user for the current terms before anything else', async () => {
    mockStatus = 'signedIn';
    mockUser = { id: 1, email: 'a@b.c', name: 'Ann' };
    mockTermsAccepted = false;
    mockSegments = ['(meeting)', 'join'];
    await render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/terms');
  });

  it('stays on the terms screen until the terms are accepted', async () => {
    mockStatus = 'signedIn';
    mockUser = { id: 1, email: 'a@b.c', name: 'Ann' };
    mockTermsAccepted = false;
    mockSegments = ['terms'];
    await render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
