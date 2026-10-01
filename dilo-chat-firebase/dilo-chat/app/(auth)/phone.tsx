// ─── Step 1: enter phone number + name ─────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, realOtpPossible, REAL_OTP_FAILED } from '../../lib/auth';
import { useSettings } from '../../theme/SettingsContext';

export default function PhoneScreen() {
  const { theme, font } = useSettings();
  const { startVerification } = useAuth();
  const c = theme.colors;

  const [countryCode, setCountryCode] = useState('+92');
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const digits = number.replace(/\D/g, '');
    if (digits.length < 7) {
      Alert.alert('Hmm', 'Please enter a valid phone number.');
      return;
    }
    if (name.trim().length < 2) {
      Alert.alert('Hmm', 'Please enter your name.');
      return;
    }
    setBusy(true);
    try {
      await startVerification(`${countryCode}${digits}`, name.trim());
      router.push('/(auth)/otp');
    } catch (e: any) {
      if (e?.message === REAL_OTP_FAILED) {
        Alert.alert(
          'Real SMS not available here',
          'Real OTP needs the web version or a dev build. You can continue in demo mode instead.',
        );
      } else {
        Alert.alert('Error', 'Could not start verification. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: c.background }]}
    >
      <View style={styles.inner}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>Welcome to Dilo Chat</Text>
        <Text style={[styles.sub, { color: c.textDim }]}>
          Register with your phone number to start chatting.
        </Text>

        {!realOtpPossible && (
          <View style={[styles.demoBadge, { backgroundColor: c.surface, borderColor: c.divider }]}>
            <Ionicons name="flask-outline" size={15} color={c.accent} />
            <Text style={[styles.demoText, { color: c.textDim }]}>
              Demo mode — any 6-digit code will work
            </Text>
          </View>
        )}

        <Text style={[styles.label, { color: c.textDim }]}>Your name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Umair"
          placeholderTextColor={c.textDim}
          style={[styles.input, { backgroundColor: c.inputBg, color: c.text, fontFamily: font.family }]}
        />

        <Text style={[styles.label, { color: c.textDim }]}>Phone number</Text>
        <View style={styles.phoneRow}>
          <TextInput
            value={countryCode}
            onChangeText={setCountryCode}
            keyboardType="phone-pad"
            maxLength={5}
            style={[styles.codeInput, { backgroundColor: c.inputBg, color: c.text }]}
          />
          <TextInput
            value={number}
            onChangeText={(t) => setNumber(t.replace(/[^\d]/g, ''))}
            placeholder="300 1234567"
            placeholderTextColor={c.textDim}
            keyboardType="number-pad"
            maxLength={12}
            style={[styles.input, styles.numberInput, { backgroundColor: c.inputBg, color: c.text }]}
          />
        </View>

        <TouchableOpacity
          onPress={send}
          disabled={busy}
          style={[styles.button, { backgroundColor: c.accent, opacity: busy ? 0.6 : 1 }]}
          activeOpacity={0.8}
        >
          {busy
            ? <ActivityIndicator color={c.textOnAccent} />
            : <Text style={[styles.buttonText, { color: c.textOnAccent }]}>Send Code</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: 26, justifyContent: 'center' },
  logo: { width: 84, height: 84, borderRadius: 20, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 14.5, textAlign: 'center', marginTop: 8, marginBottom: 18, lineHeight: 21 },
  demoBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: 10, padding: 9, marginBottom: 18,
  },
  demoText: { fontSize: 12.5, marginLeft: 7 },
  label: { fontSize: 13, marginBottom: 7, marginTop: 6 },
  input: { borderRadius: 12, paddingHorizontal: 15, paddingVertical: 14, fontSize: 16 },
  phoneRow: { flexDirection: 'row' },
  codeInput: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 14, fontSize: 16, width: 74, marginRight: 10, textAlign: 'center' },
  numberInput: { flex: 1 },
  button: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 26 },
  buttonText: { fontSize: 16.5, fontWeight: '700' },
});
