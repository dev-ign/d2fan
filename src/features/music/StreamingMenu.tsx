import { useId, useLayoutEffect, useRef, useState } from "react";
import { getStreamingLinks } from "../../config/streaming";
import type { MusicRelease } from "../../domain/types";
import { useLocale } from "../../hooks/useLocale";
import { StreamingLink } from "./StreamingLinks";

export function StreamingMenu({ release }: { release: MusicRelease }) {
  const { t } = useLocale();
  const [openAt, setOpenAt] = useState<"first" | "last" | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const links = getStreamingLinks(release);

  function close() {
    setOpenAt(null);
    trigger.current?.focus();
  }

  useLayoutEffect(() => {
    const panel = menu.current;
    const button = trigger.current;
    if (!openAt || !panel || !button) return;

    const reposition = () => {
      const bounds = button.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const section = panel.closest(".music-section")?.getBoundingClientRect();
      const above = bounds.top - Math.max(0, section?.top ?? 0);
      const below =
        Math.min(viewportHeight, section?.bottom ?? viewportHeight) -
        bounds.bottom;
      const gap = 12;
      const opensAbove = below < panel.scrollHeight + gap + 2 && above > below;
      const available = opensAbove ? above : below;
      panel.classList.toggle("stream-menu--above", opensAbove);
      panel.style.setProperty(
        "--stream-room",
        `${Math.max(56, available - gap)}px`,
      );
    };
    reposition();

    const items = panel.querySelectorAll("a");
    if (items.length) items[openAt === "first" ? 0 : items.length - 1].focus();
    function outside(event: PointerEvent) {
      if (!anchor.current?.contains(event.target as Node)) setOpenAt(null);
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
    };
  }, [openAt]);

  if (!links.length) return null;

  return (
    <div
      className="stream-anchor"
      ref={anchor}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenAt(null);
      }}
    >
      <button
        ref={trigger}
        className="button button--outline"
        type="button"
        aria-expanded={Boolean(openAt)}
        aria-haspopup="menu"
        aria-controls={openAt ? id : undefined}
        onClick={() => setOpenAt((current) => (current ? null : "first"))}
        onKeyDown={(event) => {
          if (event.key === "Escape" && openAt) {
            event.stopPropagation();
            close();
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpenAt(event.key === "ArrowDown" ? "first" : "last");
          }
        }}
      >
        {t.music.listen}
        <img src="/assets/down.svg" alt="" width="12" height="12" />
      </button>
      {openAt && (
        <div
          ref={menu}
          id={id}
          className="stream-menu"
          role="menu"
          aria-label={t.music.listen}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            } else if (event.key === "Tab" && event.shiftKey) {
              event.preventDefault();
              close();
            }
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const items = Array.from(
                event.currentTarget.querySelectorAll("a"),
              );
              const index = items.indexOf(
                document.activeElement as HTMLAnchorElement,
              );
              const offset = event.key === "ArrowDown" ? 1 : -1;
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index + offset + items.length) % items.length;
              items[next]?.focus();
            }
          }}
        >
          {links.map((link) => (
            <StreamingLink
              key={link.platform}
              link={link}
              release={release}
              onSelect={close}
            />
          ))}
        </div>
      )}
    </div>
  );
}
