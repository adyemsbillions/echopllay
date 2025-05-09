import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="play" options={{ headerShown: false }} />
      <Stack.Screen name="player" options={{ headerShown: false }} />
      
    </Stack>
  );
}