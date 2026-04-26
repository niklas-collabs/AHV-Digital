import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode } from '@ahv/shared';

interface ThemeStore {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggle: () => void;
}

/**
 * Theme-Store mit localStorage-Persistenz. Default ist 'dark' — passt zur
 * SHK-Baustellen-UI (kontraststark im Hellen wie im Dunklen).
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggle: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
    }),
    { name: 'ahv-theme' },
  ),
);

/**
 * Synchronisiert den Theme-Store mit der `dark`-Klasse auf <html>.
 * Wird einmal in App.tsx aufgerufen.
 */
export function applyThemeToDocument(theme: ThemeMode): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
