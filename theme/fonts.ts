// ─── Stylish font options (loaded from expo-google-fonts) ─────────────────
// `family` is the loaded font name; undefined = system default font.

export interface FontOption {
  id: string;
  label: string;
  family?: string;
}

export const fontOptions: FontOption[] = [
  { id: 'system', label: 'System Default' },
  { id: 'poppins', label: 'Poppins', family: 'Poppins_400Regular' },
  { id: 'playfair', label: 'Playfair Display', family: 'PlayfairDisplay_500Medium' },
  { id: 'lobster', label: 'Lobster', family: 'Lobster_400Regular' },
  { id: 'orbitron', label: 'Orbitron', family: 'Orbitron_500Medium' },
  { id: 'caveat', label: 'Caveat', family: 'Caveat_500Medium' },
];

export const defaultFontId = 'poppins';

export function getFont(id?: string | null): FontOption {
  return fontOptions.find((f) => f.id === id) ?? fontOptions[0];
}
