import { releases } from "./content.ts";
import { getReleaseUrl } from "./releaseMetadata.ts";
import { boundedAttribution } from "../../supabase/shared/validation.ts";

export function campaignLink(
  slug: string,
  source: string,
  medium: string,
  content?: string,
  term?: string,
): string | null {
  const release = releases.find((item) => item.slug === slug);
  if (!release) return null;
  const tags = {
    utm_source: source,
    utm_medium: medium,
    utm_campaign: release.campaignId ?? release.slug,
    ...(content && { utm_content: content }),
    ...(term && { utm_term: term }),
  };
  const allowed = boundedAttribution(tags);
  if (Object.keys(allowed).length !== Object.keys(tags).length) return null;
  const url = new URL(getReleaseUrl(release.slug));
  url.search = new URLSearchParams(allowed).toString();
  return url.href;
}
