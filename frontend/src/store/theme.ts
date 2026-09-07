import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

export const useTheme = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    set({ theme });
  },
  toggleTheme: () => {
    set((state) => {
      const next = state.theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      return { theme: next };
    });
  },
}));
