// ─── Phone-number auth (REAL Firebase SMS OTP) ─────────────────────────────
// Sign-in uses the native Firebase phone authentication:
//   phone number → real SMS code → enter code → signed in with Firebase UID.
// There is NO demo mode and NO bypass. Signing in without the SMS code is
// impossible.

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { chatDb } from './db';

export interface AuthUser {
  uid: string;
  phone: string;
  name: string;
}

interface PendingVerification {
  phone: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  startVerification: (phone: string, name: string) => Promise<void>;
  confirmCode: (code: string) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  logout: () => Promise<void>;
}

// Error codes thrown by startVerification / confirmCode.
export const SEND_INVALID_NUMBER = 'INVALID_NUMBER';
export const SEND_TOO_MANY = 'TOO_MANY';
export const SEND_FAILED = 'SEND_FAILED';
export const VERIFY_WRONG_CODE = 'WRONG_CODE';
export const VERIFY_EXPIRED = 'EXPIRED';
export const VERIFY_NO_PENDING = 'NO_PENDING';
export const VERIFY_FAILED = 'VERIFY_FAILED';
const BAD_CODE_FORMAT = 'BAD_CODE';

const SESSION_KEY = 'dilochat_session_v1';
const PENDING_KEY = 'dilochat_pending_v1';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const confirmRef = useRef<FirebaseAuthTypes.ConfirmationResult | null>(null);

  // Restore session: Firebase keeps the user signed in on this device.
  useEffect(() => {
    const unsub = auth().onAuthStateChanged(async (fbUser) => {
      try {
        if (fbUser) {
          const raw = await AsyncStorage.getItem(SESSION_KEY);
          let profile: AuthUser | null = null;
          if (raw) {
            const saved = JSON.parse(raw) as AuthUser;
            if (saved.uid === fbUser.uid) profile = saved;
          }
          if (!profile) {
            profile = {
              uid: fbUser.uid,
              phone: fbUser.phoneNumber ?? '',
              name: '',
            };
            await chatDb.ensureUser(profile.uid, profile.phone, profile.name);
            await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(profile));
          }
          setUser(profile);
          chatDb.setOnline(profile.uid, true).catch(() => {});
        } else {
          await AsyncStorage.removeItem(SESSION_KEY);
          setUser(null);
        }
      } catch {
        // Corrupted storage: force a fresh login.
        await AsyncStorage.removeItem(SESSION_KEY);
        await AsyncStorage.removeItem(PENDING_KEY);
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const finishLogin = async (u: AuthUser) => {
    await chatDb.ensureUser(u.uid, u.phone, u.name);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
  };

  /** Send a real SMS code to the phone number. */
  const startVerification = async (phone: string, name: string) => {
    if (Platform.OS === 'web') throw new Error(SEND_FAILED);
    const clean = phone.replace(/[^\d+]/g, '');
    const pending: PendingVerification = { phone: clean, name };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    confirmRef.current = null;
    try {
      confirmRef.current = await auth().signInWithPhoneNumber(clean);
    } catch (e: any) {
      const code: string = e?.code ?? '';
      if (code === 'auth/invalid-phone-number') throw new Error(SEND_INVALID_NUMBER);
      if (code === 'auth/too-many-requests') throw new Error(SEND_TOO_MANY);
      throw new Error(SEND_FAILED);
    }
  };

  /** Verify the 6-digit SMS code and sign the user in. */
  const confirmCode = async (code: string) => {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) throw new Error(VERIFY_NO_PENDING);
    const pending = JSON.parse(raw) as PendingVerification;
    if (!/^\d{6}$/.test(code)) throw new Error(BAD_CODE_FORMAT);
    const confirmation = confirmRef.current;
    if (!confirmation) throw new Error(VERIFY_NO_PENDING);
    try {
      const cred = await confirmation.confirm(code);
      if (!cred) throw new Error(VERIFY_FAILED);
      const fbUser = cred.user;
      await AsyncStorage.removeItem(PENDING_KEY);
      await finishLogin({
        uid: fbUser.uid,
        phone: pending.phone,
        name: pending.name,
      });
    } catch (e: any) {
      if (e?.message === VERIFY_NO_PENDING || e?.message === BAD_CODE_FORMAT) throw e;
      const errCode: string = e?.code ?? '';
      if (errCode === 'auth/invalid-verification-code') throw new Error(VERIFY_WRONG_CODE);
      if (errCode === 'auth/session-expired' || errCode === 'auth/code-expired') {
        throw new Error(VERIFY_EXPIRED);
      }
      throw new Error(VERIFY_FAILED);
    }
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
    try {
      await auth().signOut();
    } catch {
      /* ignore */
    }
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, startVerification, confirmCode, updateName, logout }}
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
