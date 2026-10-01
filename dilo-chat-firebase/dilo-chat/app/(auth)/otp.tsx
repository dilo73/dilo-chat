// ─── Step 2: enter the 6-digit OTP code ────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, realOtpPossible, REAL_OTP_FAILED } from '../../lib/auth';
import { useSettings } from '../../theme/SettingsContext';

const CODE_LEN = 6;

export default function OtpScreen() {
  const { theme, font } = useSettings();
  const { confirmCode, startVerification, useDemoInstead } = useAuth();
  const c = theme.colors;

  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [otpFailed, setOtpFailed] = useState(false);
  const [seconds, setSeconds] = useState(30);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const setDigit = (i: number, val: string) => {
    const ch = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = ch;
    setDigits(next);
    if (ch && i < CODE_LEN - 1) inputs.current[i + 1]?.focus();
  };

  const onKeyPress = (i: number, key: string) => {
    if (key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
      const next = [...digits];
      next[i - 1] = '';
      setDigits(next);
    }
  };

  const verify = async () => {
    const code = digits.join('');
    if (code.length !== CODE_LEN) {
      Alert.alert('Hmm', 'Please enter the 6-digit code.');
      return;
    }
    setBusy(true);
    try {
      await confirmCode(code);
      router.replace('/(tabs)/chats');
    } catch (e: any) {
      if (e?.message === REAL_OTP_FAILED || e?.message === 'NO_PENDING') {
        setOtpFailed(true);
      } else {
        Alert.alert('Wrong code', 'That code did not work. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setSeconds(30);
    setDigits(Array(CODE_LEN).fill(''));
    // Re-send uses the stored pending phone/name.
    try {
      const raw = await AsyncStorage.getItem('dilochat_pending_v1');
      if (raw) {
        const p = JSON.parse(raw);
        await startVerification(p.phone, p.name);
      }
    } catch { /* ignore */ }
  };

  const continueDemo = async () => {
    setBusy(true);
    try {
      await useDemoInstead();
      router.replace('/(tabs)/chats');
    } catch {
      Alert.alert('Error', 'Could not continue. Go back and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: c.background }]}
    >
      {/* reCAPTCHA container for Firebase Phone Auth on web */}
      {Platform.OS === 'web' && <View nativeID="dilochat-recaptcha" />}

      <View style={styles.inner}>
        <View style={[styles.iconWrap, { backgroundColor: c.surface }]}>
          <Ionicons name="chatbox-ellipses-outline" size={38} color={c.accent} />
        </View>
        <Text style={[styles.title, { color: c.text, fontFamily: font.family }]}>Enter the code</Text>
        <Text style={[styles.sub, { color: c.textDim }]}>
          We sent a 6-digit code to your phone.{!realOtpPossible && ' (Demo mode: any 6 digits work)'}
        </Text>

        <View style={styles.codeRow}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(r) => { inputs.current[i] = r; }}
              value={d}
              onChangeText={(v) => setDigit(i, v)}
              onKeyPress={({ nativeEvent }) => onKeyPress(i, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              style={[styles.box, { backgroundColor: c.inputBg, color: c.text, borderColor: d ? c.accent : c.divider }]}
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={verify}
          disabled={busy}
          style={[styles.button, { backgroundColor: c.accent, opacity: busy ? 0.6 : 1 }]}
          activeOpacity={0.8}
        >
          {busy
            ? <ActivityIndicator color={c.textOnAccent} />
            : <Text style={[styles.buttonText, { color: c.textOnAccent }]}>Verify</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={resend} disabled={seconds > 0} style={styles.resend}>
          <Text style={[styles.resendText, { color: seconds > 0 ? c.textDim : c.accent }]}>
            {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
          </Text>
        </TouchableOpacity>

        {otpFailed && (
          <View style={[styles.failBox, { backgroundColor: c.surface, borderColor: c.divider }]}>
            <Text style={[styles.failText, { color: c.text }]}>
              Real SMS verification could not start on this device.
            </Text>
            <TouchableOpacity
              onPress={continueDemo}
              style={[styles.demoButton, { backgroundColor: c.accent }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.buttonText, { color: c.textOnAccent, fontSize: 14 }]}>
                Continue in demo mode
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: 26, justifyContent: 'center' },
  iconWrap: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 26, lineHeight: 21 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 26 },
  box: {
    width: 48, height: 58, borderRadius: 12, borderWidth: 1.5,
    textAlign: 'center', fontSize: 22, fontWeight: '700',
  },
  button: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 16.5, fontWeight: '700' },
  resend: { alignItems: 'center', marginTop: 18 },
  resendText: { fontSize: 14, fontWeight: '600' },
  failBox: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 22 },
  failText: { fontSize: 13.5, textAlign: 'center', marginBottom: 12, lineHeight: 19 },
  demoButton: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
});
