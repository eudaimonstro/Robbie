import type { ReactNode } from 'react';
import { render } from '@testing-library/react-native';

let mockStatus = 'loading';
let mockSegments: string[] = [];
const mockReplace = jest.fn();
const mockHideAsync = jest.fn(async () => {});

jest.mock('../../context/SessionContext', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => ({ status: mockStatus, user: null }),
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
});
