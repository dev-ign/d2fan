import { useEffect, useState } from "react";
import type { MusicRelease } from "../../domain/types";
import { getStreamingLinks } from "../../config/streaming";
import { text, useLocale } from "../../hooks/useLocale";
import { analytics } from "../../services/analytics";

export function StreamingLink({
  link,
  release,
  onSelect,
  tooltip,
}: {
  link: ReturnType<typeof getStreamingLinks>[number];
  release: MusicRelease;
  onSelect?: () => void;
  tooltip?: { visible: boolean; show: () => void; dismiss: () => void };
}) {
  const { t, locale } = useLocale();
  return (
    <a
      className="stream-link"
      role={onSelect ? "menuitem" : undefined}
      tabIndex={onSelect ? -1 : undefined}
      aria-label={
        onSelect
          ? undefined
          : text(t.release.listenOn, {
              title: release.title,
              service: link.name,
            })
      }
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      onPointerEnter={
        tooltip &&
        ((event) => {
          if (event.pointerType === "mouse") tooltip.show();
        })
      }
      onPointerLeave={
        tooltip &&
        ((event) => {
          if (!event.currentTarget.matches(":focus-visible")) tooltip.dismiss();
        })
      }
      onFocus={
        tooltip &&
        ((event) => {
          if (event.currentTarget.matches(":focus-visible")) tooltip.show();
        })
      }
      onBlur={tooltip?.dismiss}
      onAuxClick={tooltip?.dismiss}
      onClick={() => {
        tooltip?.dismiss();
        onSelect?.();
        analytics.track("DSPClick", {
          release_slug: release.slug,
          platform: link.platform,
          placement: onSelect ? "home" : "release_page",
          language: locale,
        });
      }}
    >
      <img
        className="stream-logo"
        src={link.icon}
        alt=""
        width="22"
        height="22"
      />
      {onSelect && (
        <>
          <span>{link.name}</span>
          <img src="/assets/external.svg" alt="" width="12" height="12" />
        </>
      )}
      {tooltip && (
        <span
          className="stream-tooltip"
          data-visible={tooltip.visible}
          aria-hidden="true"
        >
          {link.name}
        </span>
      )}
    </a>
  );
}

export function StreamingLinks({ release }: { release: MusicRelease }) {
  const { t } = useLocale();
  const links = getStreamingLinks(release);
  const [activeTooltip, setActiveTooltip] = useState<
    keyof MusicRelease["streamingLinks"] | null
  >(null);

  useEffect(() => {
    if (!activeTooltip) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveTooltip(null);
    };
    document.addEventListener("keydown", dismissOnEscape);
    return () => document.removeEventListener("keydown", dismissOnEscape);
  }, [activeTooltip]);

  if (!links.length) return null;
  return (
    <div className="stream-links" role="group" aria-label={t.release.listen}>
      {links.map((link) => (
        <StreamingLink
          key={link.platform}
          link={link}
          release={release}
          tooltip={{
            visible: activeTooltip === link.platform,
            show: () => setActiveTooltip(link.platform),
            dismiss: () =>
              setActiveTooltip((active) =>
                active === link.platform ? null : active,
              ),
          }}
        />
      ))}
    </div>
  );
}
