import { create } from "zustand";
import i18n from "../i18n";

interface LanguageState {
  language: "es" | "en";
  setLanguage: (lang: "es" | "en") => void;
  toggleLanguage: () => void;
}

export const useLanguage = create<LanguageState>((set) => ({
  language: (localStorage.getItem("language") as "es" | "en") || "es",
  setLanguage: (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("language", lang);
    set({ language: lang });
  },
  toggleLanguage: () => {
    const next = i18n.language === "es" ? "en" : "es";
    i18n.changeLanguage(next);
    localStorage.setItem("language", next);
    set({ language: next });
  },
}));
