import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SocketProvider, useSocket } from '../context/SocketContext';
import { colors } from '../theme';

function RootLayoutNav() {
  const { isAuthenticated, isConnected, isLoading } = useSocket();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inMeetingGroup = segments[0] === '(meeting)';

    if (isAuthenticated && isConnected) {
      // User is authenticated and connected, go to meeting
      if (!inMeetingGroup) {
        router.replace('/(meeting)');
      }
    } else if (!isAuthenticated) {
      // User is not authenticated, go to login
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    }
  }, [isAuthenticated, isConnected, isLoading, segments, router]);

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
      <SocketProvider>
        <RootLayoutNav />
      </SocketProvider>
    </SafeAreaProvider>
  );
}
