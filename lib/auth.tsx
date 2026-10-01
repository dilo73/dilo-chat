// ─── Phone-number auth ──────────────────────────────────────────────────────
// • Demo mode (no Firebase keys yet, or native app): any 6-digit code works.
// • Real mode (keys pasted + running on web): Firebase Phone Auth SMS OTP.
//   Real SMS on a physical phone needs a dev build (see SETUP.md) —
//   until then the app clearly labels itself "Demo mode".

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  signInWithPhoneNumber, RecaptchaVerifier, ConfirmationResult, signOut,
} from 'firebase/auth';
import { isConfigured, auth } from './firebase';
import { chatDb } from './db';

export interface AuthUser {
  uid: string;
  phone: string;
  name: string;
  demo: boolean;
}

interface PendingVerification {
  phone: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** True when real Firebase SMS OTP can be used (keys + web). */
  realOtpPossible: boolean;
  /** True when the current session is a demo login. */
  demoMode: boolean;
  startVerification: (phone: string, name: string) => Promise<void>;
  confirmCode: (code: string) => Promise<void>;
  useDemoInstead: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SESSION_KEY = 'dilochat_session_v1';
const PENDING_KEY = 'dilochat_pending_v1';

export const REAL_OTP_FAILED = 'REAL_OTP_FAILED';

// Real SMS OTP only works with the Firebase JS SDK on web (it needs reCAPTCHA).
// On native builds it requires @react-native-firebase (see SETUP.md).
export const realOtpPossible: boolean = isConfigured && Platform.OS === 'web';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(!realOtpPossible);
  const confirmRef = useRef<ConfirmationResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as AuthUser;
          setUser(saved);
          setDemoMode(saved.demo);
          chatDb.setOnline(saved.uid, true).catch(() => {});
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const finishLogin = async (u: AuthUser) => {
    await chatDb.ensureUser(u.uid, u.phone, u.name);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setDemoMode(u.demo);
    setUser(u);
  };

  const startVerification = async (phone: string, name: string) => {
    const pending: PendingVerification = { phone, name };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    confirmRef.current = null;
    setDemoMode(!realOtpPossible);
    if (!realOtpPossible) return; // demo path: OTP screen accepts any 6-digit code
    try {
      const verifier = new RecaptchaVerifier(auth!, 'dilochat-recaptcha', { size: 'invisible' });
      confirmRef.current = await signInWithPhoneNumber(auth!, phone, verifier);
    } catch (e) {
      console.warn('Phone auth failed:', e);
      throw new Error(REAL_OTP_FAILED);
    }
  };

  const confirmCode = async (code: string) => {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) throw new Error('NO_PENDING');
    const pending = JSON.parse(raw) as PendingVerification;
    if (!/^\d{6}$/.test(code)) throw new Error('BAD_CODE');

    if (realOtpPossible && confirmRef.current && !demoMode) {
      const cred = await confirmRef.current.confirm(code);
      await finishLogin({
        uid: cred.user.uid, phone: pending.phone, name: pending.name, demo: false,
      });
    } else {
      // DEMO MODE: any 6-digit code is accepted.
      await finishLogin({
        uid: `demo_${pending.phone.replace(/\D/g, '')}`,
        phone: pending.phone, name: pending.name, demo: true,
      });
    }
    await AsyncStorage.removeItem(PENDING_KEY);
  };

  /** Fall back to a demo login when real OTP can't start. */
  const useDemoInstead = async () => {
    setDemoMode(true);
    confirmRef.current = null;
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) throw new Error('NO_PENDING');
    const pending = JSON.parse(raw) as PendingVerification;
    await finishLogin({
      uid: `demo_${pending.phone.replace(/\D/g, '')}`,
      phone: pending.phone, name: pending.name, demo: true,
    });
    await AsyncStorage.removeItem(PENDING_KEY);
  };

  const updateName = async (name: string) => {
    if (!user) return;
    const updated = { ...user, name };
    await chatDb.ensureUser(updated.uid, updated.phone, name);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    setUser(updated);
  };

  const logout = async () => {
    if (user) chatDb.setOnline(user.uid, false).catch(() => {});
    if (auth && user && !user.demo) {
      try { await signOut(auth); } catch { /* ignore */ }
    }
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user, loading, realOtpPossible, demoMode,
        startVerification, confirmCode, useDemoInstead, updateName, logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
