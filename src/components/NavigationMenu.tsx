import { useLocale } from "../hooks/useLocale";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Dialog } from "./Dialog";

import { navigation } from "../config/navigation";

export function NavigationMenu({
  activeSection,
  onClose,
  onSupport,
}: {
  activeSection: string;
  onClose: () => void;
  onSupport: () => void;
}) {
  const { t } = useLocale();
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!closing) return;
    const timeout = setTimeout(
      onClose,
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160,
    );
    return () => clearTimeout(timeout);
  }, [closing, onClose]);
  return (
    <Dialog
      title={t.nav.site}
      id="site-menu"
      closeLabel={t.nav.closeMenu}
      onClose={() => setClosing(true)}
      className={`navigation-menu${closing ? " navigation-menu--closing" : ""}`}
    >
      <p className="eyebrow">JONA FERREIRA</p>
      <nav aria-label={t.nav.main}>
        {navigation.map(({ id }, index) => (
          <Link
            key={id}
            to={`/#${id}`}
            onClick={onClose}
            aria-current={activeSection === id ? "location" : undefined}
          >
            <span className="menu-index" aria-hidden="true">
              0{index + 1}
            </span>
            <span>{t.nav.sections[id]}</span>
            <ArrowUpRight size={22} aria-hidden="true" />
          </Link>
        ))}
        <button
          className="button button--lime"
          type="button"
          onClick={() => {
            onClose();
            onSupport();
          }}
        >
          {t.nav.support}
        </button>
      </nav>
      <p className="menu-note">{t.nav.note}</p>
    </Dialog>
  );
}
