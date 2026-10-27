import { useEffect, useId, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import { useLocale } from "../hooks/useLocale";
const languages = [
  { locale: "en", code: "EN", name: "English", flag: "🇺🇸" },
  { locale: "es", code: "ES", name: "Español", flag: "🇪🇸" },
] as const;
export function LanguageMenu() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  function close(restore = false) {
    setOpen(false);
    if (restore) trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    items.current[
      languages.findIndex((language) => language.locale === locale)
    ]?.focus();
    const outside = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, locale]);
  return (
    <div className="language-anchor" ref={anchor}>
      <button
        ref={trigger}
        className="language-trigger icon-button"
        type="button"
        aria-label={t.nav.changeLanguage}
        title={t.nav.changeLanguage}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Globe size={21} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          className="language-menu"
          role="menu"
          aria-label={t.nav.changeLanguage}
          onKeyDown={(event) => {
            const current = items.current.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const index =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? languages.length - 1
                    : (current +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        languages.length) %
                      languages.length;
              items.current[index]?.focus();
            } else if (event.key === "Escape") {
              event.stopPropagation();
              event.preventDefault();
              close(true);
            } else if (event.key === "Tab") close(true);
          }}
        >
          {languages.map((language, index) => (
            <button
              key={language.locale}
              ref={(node) => {
                items.current[index] = node;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={locale === language.locale}
              lang={language.locale}
              onClick={() => {
                setLocale(language.locale);
                close(true);
              }}
            >
              <span aria-hidden="true">{language.flag}</span>
              <strong>{language.code}</strong>
              <span>{language.name}</span>
              {locale === language.locale && (
                <Check size={16} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
