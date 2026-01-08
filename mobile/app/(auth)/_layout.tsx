import { Stack } from 'expo-router';
import { colors } from '../../theme';

export default function AuthLayout() {
  return (
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
      <Stack.Screen
        name="login"
        options={{
          title: 'Join Meeting',
        }}
      />
      <Stack.Screen
        name="verify"
        options={{
          title: 'Verify Email',
        }}
      />
    </Stack>
  );
}
