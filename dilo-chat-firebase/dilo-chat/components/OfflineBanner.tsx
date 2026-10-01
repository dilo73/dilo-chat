// ─── "App is OFF" banner ───────────────────────────────────────────────────
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme/themes';

export function OfflineBanner({ theme }: { theme: Theme }) {
  const c = theme.colors;
  return (
    <View style={[styles.banner, { backgroundColor: '#7c2d12', borderBottomColor: c.divider }]}>
      <Ionicons name="cloud-offline-outline" size={16} color="#fdba74" />
      <Text style={styles.text}>
        App is OFF — messages will be queued and auto-sent when you go back online
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { color: '#fdba74', fontSize: 12.5, marginLeft: 8, textAlign: 'center', flexShrink: 1 },
});
