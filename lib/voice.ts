// ─── Voice messages: record with expo-av, store in Firebase Storage ────────
import { Audio } from 'expo-av';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, isConfigured } from './firebase';

export interface Recording {
  stop: () => Promise<{ uri: string; duration: number } | null>;
  cancel: () => Promise<void>;
}

/** Start recording. Returns a handle to stop/cancel. */
export async function startRecording(): Promise<Recording | null> {
  try {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') return null;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();
    let done = false;
    return {
      stop: async () => {
        if (done) return null;
        done = true;
        try {
          await recording.stopAndUnloadAsync();
          const uri = recording.getURI();
          const status = await recording.getStatusAsync();
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
          if (!uri) return null;
          const duration = Math.max(1, Math.round((status.durationMillis ?? 1000) / 1000));
          return { uri, duration };
        } catch {
          return null;
        }
      },
      cancel: async () => {
        if (done) return;
        done = true;
        try {
          await recording.stopAndUnloadAsync();
        } catch { /* ignore */ }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      },
    };
  } catch {
    return null;
  }
}

/** Upload a recorded file to Firebase Storage. Returns the download URL. */
export async function uploadVoice(chatId: string, localUri: string): Promise<string | null> {
  if (!isConfigured || !storage) return localUri; // demo: keep local uri
  try {
    const res = await fetch(localUri);
    const blob = await res.blob();
    const path = `voice/${chatId}/${Date.now()}.m4a`;
    await uploadBytes(ref(storage, path), blob);
    return await getDownloadURL(ref(storage, path));
  } catch {
    return null;
  }
}

/** Small sound player for voice bubbles. */
export class VoicePlayer {
  private sound: Audio.Sound | null = null;
  private onUpdate: ((pos: number, dur: number, playing: boolean) => void) | null = null;

  setOnUpdate(cb: (pos: number, dur: number, playing: boolean) => void) {
    this.onUpdate = cb;
  }

  async play(uri: string) {
    await this.stop();
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true },
      (st) => {
        if (!st.isLoaded) return;
        this.onUpdate?.(st.positionMillis ?? 0, st.durationMillis ?? 1, st.isPlaying ?? false);
        if (st.didJustFinish) {
          this.onUpdate?.(0, st.durationMillis ?? 1, false);
        }
      },
    );
    this.sound = sound;
  }

  async pause() {
    await this.sound?.pauseAsync().catch(() => {});
  }

  async stop() {
    await this.sound?.unloadAsync().catch(() => {});
    this.sound = null;
  }
}
