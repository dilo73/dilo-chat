// ─── Root layout: providers + navigation stack ─────────────────────────────
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SettingsProvider, useSettings } from '../theme/SettingsContext';
import { AuthProvider } from '../lib/auth';

// Prevent crash if splash module misbehaves on some devices.
try {
  SplashScreen.preventAutoHideAsync();
} catch {
  /* splash already hidden or unavailable */
}

function RootNavigator() {
  const { ready, theme } = useSettings();

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
      // Force-hide after 2s in case hideAsync hangs on some devices.
      const t = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 2000);
      return () => clearTimeout(t);
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[id]" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SettingsProvider>
  );
}
