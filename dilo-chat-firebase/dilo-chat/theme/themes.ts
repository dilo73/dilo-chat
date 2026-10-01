// ─── VIP theme definitions ────────────────────────────────────────────────
// Each theme re-skins the whole app: chat background, bubbles, accents, etc.

export interface ThemeColors {
  background: string;   // app background
  surface: string;      // headers, cards, input bars
  chatBg: string;       // conversation screen background
  bubbleIn: string;     // incoming message bubble
  bubbleOut: string;    // outgoing message bubble
  text: string;         // primary text
  textDim: string;      // secondary / muted text
  textOnAccent: string; // text drawn on top of accent color
  accent: string;       // primary accent (buttons, highlights)
  inputBg: string;      // message composer background
  divider: string;      // hairline dividers
  badge: string;        // unread badge background
  tickRead: string;     // blue "read" tick color
  danger: string;       // destructive actions
}

export interface Theme {
  id: string;
  name: string;
  tagline: string;
  colors: ThemeColors;
}

export const themes: Theme[] = [
  {
    id: 'dilo-dark',
    name: 'Dilo Dark',
    tagline: 'Classic VIP look',
    colors: {
      background: '#0b141a', surface: '#1f2c34', chatBg: '#0b141a',
      bubbleIn: '#1f2c34', bubbleOut: '#005c4b',
      text: '#e9edef', textDim: '#8696a0', textOnAccent: '#ffffff',
      accent: '#00a884', inputBg: '#1f2c34', divider: '#2a3942',
      badge: '#00a884', tickRead: '#53bdeb', danger: '#f15c6d',
    },
  },
  {
    id: 'midnight-gold',
    name: 'Midnight Gold',
    tagline: 'Luxury black & gold',
    colors: {
      background: '#0c0c0e', surface: '#17171c', chatBg: '#0c0c0e',
      bubbleIn: '#1d1d24', bubbleOut: '#7a5f16',
      text: '#f5f0e1', textDim: '#a09a86', textOnAccent: '#ffffff',
      accent: '#d4af37', inputBg: '#17171c', divider: '#2a2a32',
      badge: '#d4af37', tickRead: '#7dd3fc', danger: '#f87171',
    },
  },
  {
    id: 'royal-purple',
    name: 'Royal Purple',
    tagline: 'Regal & bold',
    colors: {
      background: '#100722', surface: '#1d1033', chatBg: '#100722',
      bubbleIn: '#241543', bubbleOut: '#5b2a86',
      text: '#f1eafe', textDim: '#b3a1d1', textOnAccent: '#ffffff',
      accent: '#a855f7', inputBg: '#1d1033', divider: '#33245c',
      badge: '#a855f7', tickRead: '#7dd3fc', danger: '#fb7185',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    tagline: 'Deep & calm',
    colors: {
      background: '#04121f', surface: '#0a1e30', chatBg: '#04121f',
      bubbleIn: '#0f2940', bubbleOut: '#075985',
      text: '#e8f4fd', textDim: '#8fb3cc', textOnAccent: '#ffffff',
      accent: '#38bdf8', inputBg: '#0a1e30', divider: '#1c3a52',
      badge: '#38bdf8', tickRead: '#7dd3fc', danger: '#f87171',
    },
  },
  {
    id: 'crimson',
    name: 'Crimson',
    tagline: 'Fiery & fearless',
    colors: {
      background: '#150708', surface: '#221014', chatBg: '#150708',
      bubbleIn: '#2c161b', bubbleOut: '#7f1d1d',
      text: '#fdeaea', textDim: '#c99a9a', textOnAccent: '#ffffff',
      accent: '#f87171', inputBg: '#221014', divider: '#3d2126',
      badge: '#f87171', tickRead: '#7dd3fc', danger: '#fb7185',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    tagline: 'Fresh & rich',
    colors: {
      background: '#04170f', surface: '#0a2418', chatBg: '#04170f',
      bubbleIn: '#0f3323', bubbleOut: '#047857',
      text: '#e6f7ef', textDim: '#8fc3a8', textOnAccent: '#ffffff',
      accent: '#34d399', inputBg: '#0a2418', divider: '#1d4430',
      badge: '#34d399', tickRead: '#7dd3fc', danger: '#f87171',
    },
  },
];

export const defaultThemeId = 'dilo-dark';

export function getTheme(id?: string | null): Theme {
  return themes.find((t) => t.id === id) ?? themes[0];
}
