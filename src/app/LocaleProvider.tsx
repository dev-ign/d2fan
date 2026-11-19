import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { LocaleContext, readLocale, localeStorageKey } from "./localeContext";
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(readLocale);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
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
