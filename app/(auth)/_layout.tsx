/**
 * Auth group layout — the signed-out surface. No headers: each screen paints
 * its own centered stack on the obsidian canvas (DESIGN.md §6).
 */
import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
