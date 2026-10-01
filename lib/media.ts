export interface PickedMedia { uri: string; }
export async function pickImage(): Promise<PickedMedia | null> { return null; }
export async function pickVideo(): Promise<PickedMedia | null> { return null; }
export async function takePhoto(): Promise<PickedMedia | null> { return null; }
export async function pickDocument(): Promise<PickedMedia | null> { return null; }
export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> { return null; }
export async function uploadMedia(folder: string, localUri: string, fileName?: string): Promise<string | null> { return localUri; }
export async function translateText(text: string, targetLang: string): Promise<string | null> { return null; }
