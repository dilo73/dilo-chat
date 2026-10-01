// ─── Push notifications ───────────────────────────────────────────────────
// • Registers the device for Expo push notifications on login.
// • Saves the push token on the user's Firestore doc.
// • Sends a push via the Expo Push API when a message is sent.
//   (Client-side send: fine for this app's scale; no server needed.)

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { firestoreDb, isConfigured } from './firebase';

// How incoming notifications behave while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Ask permission + get Expo push token. Returns null on failure/emulator. */
export async function registerPushToken(): Promise<string | null> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    return token;
  } catch {
    return null;
  }
}

/** Save the token on the user's doc so senders can reach them. */
export async function savePushToken(uid: string, token: string): Promise<void> {
  if (!isConfigured || !firestoreDb) return;
  try {
    await setDoc(doc(firestoreDb, 'users', uid), { pushToken: token }, { merge: true });
  } catch { /* ignore */ }
}

/** Send a push to Expo push tokens via the Expo Push API (no server needed). */
export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const valid = tokens.filter((t) => t && t.startsWith('ExponentPushToken'));
  if (valid.length === 0) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        valid.map((to) => ({
          to,
          title,
          body: body.length > 120 ? body.slice(0, 117) + '...' : body,
          sound: 'default',
          channelId: 'messages',
          data: data ?? {},
        })),
      ),
    });
  } catch { /* network failed: ignore */ }
}
