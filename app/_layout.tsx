// ─── Root layout: providers + navigation stack ─────────────────────────────
import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SettingsProvider, useSettings } from '../theme/SettingsContext';
import { AuthProvider } from '../lib/auth';

// ─── Crash catcher: show ANY error on screen instead of dying silently ────
// Module-level slot so the global handler can push fatal errors into React state.
let pushFatalError: ((e: Error) => void) | null = null;

// Catch fatal JS errors that happen OUTSIDE React render (async, etc.)
try {
  const ErrorUtilsAny = (global as any).ErrorUtils;
  if (ErrorUtilsAny?.setGlobalHandler) {
    const prev = ErrorUtilsAny.getGlobalHandler?.();
    ErrorUtilsAny.setGlobalHandler((error: any, isFatal: boolean) => {
      try {
        if (isFatal && pushFatalError) {
          pushFatalError(error instanceof Error ? error : new Error(String(error)));
          return; // swallowed: shown on screen instead of killing the app
        }
      } catch { /* ignore */ }
      if (prev) prev(error, isFatal);
    });
  }
} catch { /* ignore */ }

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidMount() {
    pushFatalError = (e: Error) => this.setState({ error: e });
  }
  componentWillUnmount() {
    pushFatalError = null;
  }
  componentDidCatch(error: Error) {
    console.log('CAUGHT BY BOUNDARY:', error?.message);
  }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <ScrollView contentContainerStyle={styles.errBox}>
          <Text style={styles.errTitle}>⚠️ App Error (batao Dilo ko):</Text>
          <Text style={styles.errMsg}>{String(e?.message || e)}</Text>
          <Text style={styles.errStack}>{String(e?.stack || '').slice(0, 2000)}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

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
    <AppErrorBoundary>
      <SettingsProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SettingsProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errBox: { flexGrow: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center' },
  errTitle: { fontSize: 18, fontWeight: '700', color: '#c00', marginBottom: 12 },
  errMsg: { fontSize: 15, color: '#111', marginBottom: 12 },
  errStack: { fontSize: 11, color: '#666' },
});
