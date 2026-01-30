import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Ana Sayfa' }} />
      <Stack.Screen name="details" options={{ title: 'Detaylar' }} />
      <Stack.Screen name="settings" options={{ title: 'Cihaz Ayarları' }} />
      <Stack.Screen name="multiWeight" options={{ title: 'Çoklu Tartım' }} />
    </Stack>
  );
}