import type { MusicRelease } from "../../domain/types";
import { getStreamingLinks } from "../../config/streaming";
import { text, useLocale } from "../../hooks/useLocale";
import { analytics } from "../../services/analytics";

export function StreamingLink({
  link,
  release,
  onSelect,
}: {
  link: ReturnType<typeof getStreamingLinks>[number];
  release: MusicRelease;
  onSelect?: () => void;
}) {
  const { t } = useLocale();
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
      onClick={() => {
        onSelect?.();
        analytics.track("DSPClick", {
          release_slug: release.slug,
          platform: link.platform,
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
    </a>
  );
}

export function StreamingLinks({ release }: { release: MusicRelease }) {
  const { t } = useLocale();
  const links = getStreamingLinks(release);
  if (!links.length) return null;
  return (
    <div className="stream-links" role="group" aria-label={t.release.listen}>
      {links.map((link) => (
        <StreamingLink key={link.platform} link={link} release={release} />
      ))}
    </div>
  );
}
