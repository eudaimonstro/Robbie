import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../context/SessionContext';
import { SocketProvider, useSocket } from '../context/SocketContext';
import { colors } from '../theme';

function RootLayoutNav() {
  const { status, user } = useSession();
  const { isConnected, isLoading, meetingCode } = useSocket();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    const [group, screen] = segments as string[];

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

  // Restoring the session on launch
  if (status === 'loading') return null;

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
