import { Stack } from 'expo-router';
import Colors from '@/constants/colors';

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.dark.surface },
        headerTintColor: Colors.dark.text,
        headerTitleStyle: { fontWeight: '700' as const, fontSize: 16 },
        contentStyle: { backgroundColor: Colors.dark.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'NEXUS',
          headerTitleStyle: {
            fontWeight: '800' as const,
            fontSize: 16,
            letterSpacing: 2,
            color: Colors.dark.accent,
          },
        }}
      />
    </Stack>
  );
}
