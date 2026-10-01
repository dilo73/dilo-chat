// ─── Media helpers (TEMPORARILY DISABLED native pickers) ────────────────────
// expo-image-picker, expo-document-picker, expo-location broke the Android
// build. Media picking is stubbed to safe no-ops until stable versions are
// integrated. Upload and translate still work.
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, isConfigured } from './firebase';

export interface PickedMedia {
  uri: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
}

export async function pickImage(): Promise<PickedMedia | null> {
  return null; // disabled: native picker broke build
}

export async function pickVideo(): Promise<PickedMedia | null> {
  return null; // disabled: native picker broke build
}

export async function takePhoto(): Promise<PickedMedia | null> {
  return null; // disabled: native picker broke build
}

export async function pickDocument(): Promise<PickedMedia | null> {
  return null; // disabled: native picker broke build
}

export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  return null; // disabled: native module broke build
}

/** Upload any local file to Firebase Storage. Returns download URL or local uri in demo. */
export async function uploadMedia(folder: string, localUri: string, fileName?: string): Promise<string | null> {
  if (!isConfigured || !storage) return localUri;
  try {
    const res = await fetch(localUri);
    const blob = await res.blob();
    const name = fileName || `file_${Date.now()}`;
    const path = `${folder}/${Date.now()}_${name}`;
    await uploadBytes(ref(storage, path), blob);
    return await getDownloadURL(ref(storage, path));
  } catch {
    return null;
  }
}

/** Free translation via MyMemory API (no key needed, rate-limited). */
export async function translateText(text: string, targetLang: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;
    const res = await fetch(url);
    const data = await res.json();
    return data?.responseData?.translatedText ?? null;
  } catch {
    return null;
  }
}
