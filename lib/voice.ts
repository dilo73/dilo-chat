// ─── Voice messages (TEMPORARILY DISABLED) ──────────────────────────────────
// expo-av caused native crashes on some devices at startup. Voice recording
// and playback are stubbed to safe no-ops until a stable audio library is
// integrated. The app works fully without it.

export interface Recording {
  stop: () => Promise<{ uri: string; duration: number } | null>;
  cancel: () => Promise<void>;
}

/** Start recording. Disabled: always returns null. */
export async function startRecording(): Promise<Recording | null> {
  return null;
}

/** Upload a voice file. Disabled: always returns null. */
export async function uploadVoice(_chatId: string, _localUri: string): Promise<string | null> {
  return null;
}

/** Voice message player. Disabled: all methods are safe no-ops. */
export class VoicePlayer {
  async play(_uri: string, _rate: number = 1) { /* disabled */ }
  async pause() { /* disabled */ }
  async stop() { /* disabled */ }
  async setSpeed(_rate: number) { /* disabled */ }
  setOnUpdate(_cb: (pos: number, dur: number, playing: boolean) => void) { /* disabled */ }
  onProgress(_cb: (pos: number, dur: number) => void) { /* disabled */ }
}
