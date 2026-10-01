// ─── Avatar: colored circle with initials ──────────────────────────────────
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { initials } from '../lib/format';
import { ThemeColors } from '../theme/themes';

const PALETTE = ['#00a884', '#a855f7', '#38bdf8', '#f87171', '#34d399', '#d4af37', '#fb923c'];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({ name, size = 52, colors }: { name: string; size?: number; colors: ThemeColors }) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(name) }]}>
      <Text style={[styles.text, { fontSize: size * 0.38, color: colors.textOnAccent }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
});
