import { Stack } from 'expo-router';
import Colors from '@/constants/colors';

export default function MemoryLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.dark.surface },
        headerTintColor: Colors.dark.text,
        headerTitleStyle: { fontWeight: '700' as const, fontSize: 16 },
        contentStyle: { backgroundColor: Colors.dark.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Memory Bank' }} />
    </Stack>
  );
}
