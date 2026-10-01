// ─── Root layout: providers + navigation stack + app lock + crash catcher ───
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { SettingsProvider, useSettings } from '../theme/SettingsContext';
import { AuthProvider } from '../lib/auth';
import { APP_LOCK_KEY } from './(tabs)/settings';

// ─── Crash catcher: show ANY error on screen instead of dying silently ────
let pushFatalError: ((e: Error) => void) | null = null;
try {
  const ErrorUtilsAny = (global as any).ErrorUtils;
  if (ErrorUtilsAny?.setGlobalHandler) {
    const prev = ErrorUtilsAny.getGlobalHandler?.();
    ErrorUtilsAny.setGlobalHandler((error: any, isFatal: boolean) => {
      try {
        if (isFatal && pushFatalError) {
          pushFatalError(error instanceof Error ? error : new Error(String(error)));
          return;
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

function useAppLock() {
  const [locked, setLocked] = useState(false);

  const checkAndLock = async () => {
    try {
      const v = await AsyncStorage.getItem(APP_LOCK_KEY);
      if (v === '1') setLocked(true);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    checkAndLock();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkAndLock();
    });
    return () => sub.remove();
  }, []);

  const unlock = async () => {
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Dilo Chat unlock karo',
        fallbackLabel: 'Passcode use karo',
        cancelLabel: 'Cancel',
      });
      if (res.success) setLocked(false);
    } catch { /* stay locked */ }
  };

  return { locked, unlock };
}

function LockOverlay({ onUnlock, colors }: {
  onUnlock: () => void; colors: any;
}) {
  return (
    <View style={[styles.lockWrap, { backgroundColor: colors.background }]}>
      <View style={[styles.lockIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name="lock-closed" size={44} color={colors.accent} />
      </View>
      <Text style={[styles.lockTitle, { color: colors.text }]}>Dilo Chat locked 🔒</Text>
      <Text style={[styles.lockSub, { color: colors.textDim }]}>
        App kholne ke liye unlock karo
      </Text>
      <TouchableOpacity
        onPress={onUnlock}
        style={[styles.unlockBtn, { backgroundColor: colors.accent }]}
        activeOpacity={0.8}
      >
        <Ionicons name="finger-print" size={20} color={colors.textOnAccent} />
        <Text style={[styles.unlockText, { color: colors.textOnAccent }]}>Unlock</Text>
      </TouchableOpacity>
    </View>
  );
}

function RootNavigator() {
  const { ready, theme } = useSettings();
  const { locked, unlock } = useAppLock();

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
      const t = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 2000);
      return () => clearTimeout(t);
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <View style={{ flex: 1 }}>
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
        <Stack.Screen name="starred" />
        <Stack.Screen name="broadcast" />
      </Stack>
      {locked && (
        <View style={StyleSheet.absoluteFill}>
          <LockOverlay onUnlock={unlock} colors={theme.colors} />
        </View>
      )}
    </View>
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
  lockWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
  },
  lockIcon: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  lockTitle: { fontSize: 21, fontWeight: '700', marginBottom: 8 },
  lockSub: { fontSize: 14, textAlign: 'center', marginBottom: 28, lineHeight: 21 },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 30, paddingVertical: 14, borderRadius: 26,
  },
  unlockText: { fontSize: 16, fontWeight: '700', marginLeft: 8 },
});
