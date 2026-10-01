// ─── App-wide settings: theme, font, privacy toggles (persisted) ─────────
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import {
  Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import {
  PlayfairDisplay_500Medium, PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { Lobster_400Regular } from '@expo-google-fonts/lobster';
import { Orbitron_500Medium, Orbitron_700Bold } from '@expo-google-fonts/orbitron';
import { Caveat_500Medium, Caveat_700Bold } from '@expo-google-fonts/caveat';
import { Theme, getTheme, defaultThemeId } from './themes';
import { FontOption, getFont, defaultFontId } from './fonts';

const KEYS = {
  theme: 'dilochat_theme',
  font: 'dilochat_font',
  singleTick: 'dilochat_single_tick',
  appOff: 'dilochat_app_off',
};

interface SettingsValue {
  theme: Theme;
  themeId: string;
  setThemeId: (id: string) => void;
  font: FontOption;
  fontId: string;
  setFontId: (id: string) => void;
  /** When true, your own messages always show a single tick (GBWhatsApp-style privacy). */
  singleTick: boolean;
  setSingleTick: (v: boolean) => void;
  /** When true, the app stops syncing ("App Off" mode). */
  appOffline: boolean;
  setAppOffline: (v: boolean) => void;
  /** True once fonts + saved prefs are loaded. */
  ready: boolean;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold,
    PlayfairDisplay_500Medium, PlayfairDisplay_700Bold,
    Lobster_400Regular,
    Orbitron_500Medium, Orbitron_700Bold,
    Caveat_500Medium, Caveat_700Bold,
  });

  const [themeId, setThemeIdState] = useState(defaultThemeId);
  const [fontId, setFontIdState] = useState(defaultFontId);
  const [singleTick, setSingleTickState] = useState(false);
  const [appOffline, setAppOfflineState] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  // Safety: never trap the user on the splash screen — if fonts hang
  // (slow/no network), fall back to system fonts after 6 seconds.
  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), 6000);
    return () => clearTimeout(t);
  }, []);

  const fontsReady = fontsLoaded || !!fontError || fontTimeout;

  useEffect(() => {
    (async () => {
      try {
        const [t, f, st, ao] = await Promise.all([
          AsyncStorage.getItem(KEYS.theme),
          AsyncStorage.getItem(KEYS.font),
          AsyncStorage.getItem(KEYS.singleTick),
          AsyncStorage.getItem(KEYS.appOff),
        ]);
        if (t) setThemeIdState(t);
        if (f) setFontIdState(f);
        setSingleTickState(st === '1');
        setAppOfflineState(ao === '1');
      } catch { /* ignore */ }
      setPrefsLoaded(true);
    })();
  }, []);

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id);
    AsyncStorage.setItem(KEYS.theme, id).catch(() => {});
  }, []);
  const setFontId = useCallback((id: string) => {
    setFontIdState(id);
    AsyncStorage.setItem(KEYS.font, id).catch(() => {});
  }, []);
  const setSingleTick = useCallback((v: boolean) => {
    setSingleTickState(v);
    AsyncStorage.setItem(KEYS.singleTick, v ? '1' : '0').catch(() => {});
  }, []);
  const setAppOffline = useCallback((v: boolean) => {
    setAppOfflineState(v);
    AsyncStorage.setItem(KEYS.appOff, v ? '1' : '0').catch(() => {});
  }, []);

  const value: SettingsValue = {
    theme: getTheme(themeId),
    themeId,
    setThemeId,
    font: getFont(fontId),
    fontId,
    setFontId,
    singleTick,
    setSingleTick,
    appOffline,
    setAppOffline,
    ready: fontsReady && prefsLoaded,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
