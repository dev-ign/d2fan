import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Dialog } from "./Dialog";

import { navigation } from "../config/navigation";

export function NavigationMenu({
  onClose,
  onSupport,
}: {
  onClose: () => void;
  onSupport: () => void;
}) {
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
      title="Site navigation"
      id="site-menu"
      closeLabel="Close menu"
      onClose={() => setClosing(true)}
      className={`navigation-menu${closing ? " navigation-menu--closing" : ""}`}
    >
      <p className="eyebrow">JONA FERREIRA</p>
      <nav aria-label="Main navigation">
        {navigation.map(({ label, id }, index) => (
          <Link key={id} to={`/#${id}`} onClick={onClose}>
            <span className="menu-index" aria-hidden="true">
              0{index + 1}
            </span>
            <span>{label}</span>
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
          SUPPORT THE JOURNEY
        </button>
      </nav>
      <p className="menu-note">Independent music. Direct to you.</p>
    </Dialog>
  );
}
