import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { LocaleContext, readLocale, localeStorageKey } from "./localeContext";
import { messages } from "../config/messages";
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(readLocale);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.title = messages[locale].meta.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", messages[locale].meta.description);
    try {
      localStorage.setItem(localeStorageKey, locale);
    } catch {
      /* In-memory selection remains usable. */
    }
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
