import { Stack } from 'expo-router';
import { colors } from '../../theme';

export default function MeetingLayout() {
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
        name="index"
        options={{
          title: 'Meeting',
        }}
      />
      <Stack.Screen
        name="motions"
        options={{
          title: 'Make a Motion',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="agenda"
        options={{
          title: 'Agenda',
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
