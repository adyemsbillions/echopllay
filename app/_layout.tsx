import { Stack } from 'expo-router';
import { PlaybackProvider } from '../contexts/PlaybackContext';

export default function Layout() {
  return (
    <PlaybackProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="play" options={{ headerShown: false }} />
        <Stack.Screen name="player" options={{ headerShown: false }} />
      </Stack>
    </PlaybackProvider>
  );
}