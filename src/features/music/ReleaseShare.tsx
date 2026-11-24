import { useState } from "react";
import { Share2 } from "lucide-react";
import { getReleaseUrl } from "../../data/releaseMetadata";
import { useLocale } from "../../hooks/useLocale";

export function ReleaseShare({
  slug,
  title,
  credit,
  campaignId,
}: {
  slug: string;
  title: string;
  credit: string;
  campaignId: string;
}) {
  const { t } = useLocale();
  const [feedback, setFeedback] = useState<"copied" | "manual">();
  const shareUrl = new URL(getReleaseUrl(slug));
  shareUrl.search = new URLSearchParams({
    utm_source: "fan_share",
    utm_medium: "referral",
    utm_campaign: campaignId,
  }).toString();
  const url = shareUrl.href;

  async function share() {
    setFeedback(undefined);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} — ${credit}`, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setFeedback("copied");
    } catch {
      setFeedback("manual");
    }
  }

  return (
    <div className="release-share">
      <button
        className="button button--outline"
        type="button"
        onClick={() => void share()}
      >
        <Share2 size={16} aria-hidden="true" />
        {t.release.share}
      </button>
      <p className="release-share-status" role="status">
        {feedback === "copied" && t.release.shareCopied}
        {feedback === "manual" && t.release.shareManually}
      </p>
      {feedback === "manual" && (
        <input
          className="release-share-url"
          aria-label={t.release.shareLink}
          type="url"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
