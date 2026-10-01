// ─── Splash / auth gate ────────────────────────────────────────────────────
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useSettings } from '../theme/SettingsContext';

export default function Index() {
  const { user, loading } = useAuth();
  const { theme, font } = useSettings();

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      router.replace(user ? '/(tabs)/chats' : '/(auth)/phone');
    }, 600);
    return () => clearTimeout(t);
  }, [loading, user]);

  const c = theme.colors;
  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Image source={require('../assets/icon.png')} style={styles.logo} />
      <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>Dilo Chat</Text>
      <Text style={[styles.tagline, { color: c.textDim }]}>Chat in VIP style ✨</Text>
      <ActivityIndicator color={c.accent} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 110, height: 110, borderRadius: 26, marginBottom: 18 },
  title: { fontSize: 34, fontWeight: '700' },
  tagline: { fontSize: 15, marginTop: 6 },
  spinner: { marginTop: 26 },
});
