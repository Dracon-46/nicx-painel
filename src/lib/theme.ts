import { create } from 'zustand';

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'nicx-painel-theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function resolve(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return media().matches ? 'dark' : 'light';
}

function apply(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
}

interface ThemeState {
  choice: ThemeChoice;
  resolved: 'light' | 'dark';
  cycle: () => void;
}

/** Tema do painel: segue o sistema até a pessoa escolher claro ou escuro. */
export const useTheme = create<ThemeState>((set, get) => {
  const choice = readChoice();
  media().addEventListener('change', () => {
    if (get().choice !== 'system') return;
    const resolved = resolve('system');
    apply(resolved);
    set({ resolved });
  });
  return {
    choice,
    resolved: resolve(choice),
    cycle: () => {
      const order: ThemeChoice[] = ['system', 'light', 'dark'];
      const next = order[(order.indexOf(get().choice) + 1) % order.length];
      try {
        if (next === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, next);
      } catch {
        // Lembrar o tema é só conveniência.
      }
      const resolved = resolve(next);
      apply(resolved);
      set({ choice: next, resolved });
    },
  };
});
