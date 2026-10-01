// ─── Connectivity helpers ─────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useSettings } from '../theme/SettingsContext';

/** Device internet status (null = not checked yet). */
export function useIsConnected(): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setConnected(s.isConnected ?? true));
    NetInfo.fetch().then((s) => setConnected(s.isConnected ?? true)).catch(() => setConnected(true));
    return unsub;
  }, []);
  return connected;
}

/**
 * The app is effectively offline when the user toggled "App Off"
 * OR the device has no internet. Listeners pause and sends get queued.
 */
export function useEffectiveOffline(): boolean {
  const { appOffline } = useSettings();
  const connected = useIsConnected();
  return appOffline || connected === false;
}
