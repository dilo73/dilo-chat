// Temporarily disabled - will be re-added safely
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function DisabledScreen() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b141a' },
  text: { color: '#fff', fontSize: 16 },
});
