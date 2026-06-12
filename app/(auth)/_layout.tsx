import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="email" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="setup" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
