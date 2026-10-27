import { createContext } from "react";
export type Locale = "es" | "en";
export const localeStorageKey = "jona:locale";
export const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
} | null>(null);
export function readLocale(): Locale {
  try {
    return localStorage.getItem(localeStorageKey) === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}
