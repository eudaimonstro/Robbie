import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../context/SessionContext';
import { SocketProvider, useSocket } from '../context/SocketContext';
import { colors } from '../theme';

// Keep the splash screen up while the saved session is restored, so the app doesn't flash the
// sign-in screen before going to the right place
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutNav() {
  const { status, user } = useSession();
  const { isConnected, isLoading, meetingCode } = useSocket();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    const [group, screen] = segments as string[];

    // A saved session the server couldn't check: not signed out, so don't ask for a new code
    if (status === 'unreachable') {
      if (group !== 'offline') router.replace('/offline');
      return;
    }
    if (status === 'signedOut') {
      if (group !== '(auth)' || screen === 'name') router.replace('/(auth)/login');
      return;
    }
    if (!user?.name) {
      if (screen !== 'name') router.replace('/(auth)/name');
      return;
    }
    // Wait for the remembered meeting, so a restart doesn't flash the join screen
    if (isLoading) return;
    if (isConnected) {
      if (group !== '(meeting)' || screen === 'join') router.replace('/(meeting)');
      return;
    }
    if (!meetingCode) {
      if (group !== '(meeting)' || screen !== 'join') router.replace('/(meeting)/join');
      return;
    }
    // Joining, or reconnecting after a dropped connection: stay on the meeting screens
    if (group !== '(meeting)') router.replace('/(meeting)/join');
  }, [status, user?.name, isConnected, isLoading, meetingCode, segments, router]);

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [status]);

  // The navigator always renders: expo-router can't navigate before the root layout mounts it

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.primary[600],
          },
          headerTintColor: colors.white,
          headerTitleStyle: {
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: colors.background.default,
          },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(meeting)" options={{ headerShown: false }} />
        <Stack.Screen name="offline" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <SocketProvider>
          <RootLayoutNav />
        </SocketProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
