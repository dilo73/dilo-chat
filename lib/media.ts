// ─── Media helpers: pick + upload to Firebase Storage ──────────────────────
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
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
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  });
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, fileName: a.fileName ?? undefined, fileSize: a.fileSize ?? undefined, width: a.width, height: a.height };
}

export async function pickVideo(): Promise<PickedMedia | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    quality: 0.7,
  });
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, fileName: a.fileName ?? undefined, fileSize: a.fileSize ?? undefined };
}

export async function takePhoto(): Promise<PickedMedia | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;
  const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

export async function pickDocument(): Promise<PickedMedia | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, fileName: a.name, fileSize: a.size ?? undefined };
}

export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const pos = await Location.getCurrentPositionAsync({});
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
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
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`
    );
    const json = await res.json();
    const translated = json?.responseData?.translatedText as string | undefined;
    if (translated && translated !== text) return translated;
    return null;
  } catch {
    return null;
  }
}
