// ─── Push notifications (DISABLED) ─────────────────────────────────────────
// expo-notifications caused a native crash on launch/login because FCM is not
// configured for this build. All functions are safe no-ops until a proper
// FCM setup (google-services.json) is added. The app works fully without it.

/** Ask permission + get Expo push token. Disabled: always returns null. */
export async function registerPushToken(): Promise<string | null> {
  return null;
}

/** Save the token on the user's doc. Disabled: no-op. */
export async function savePushToken(_uid: string, _token: string): Promise<void> {
  return;
}

/** Send a push via the Expo Push API. Disabled: no-op. */
export async function sendPush(
  _tokens: string[],
  _title: string,
  _body: string,
  _data?: Record<string, string>,
): Promise<void> {
  return;
}
