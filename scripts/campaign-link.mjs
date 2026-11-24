import { releases } from "../src/data/content.ts";
import { getReleaseUrl } from "../src/data/releaseMetadata.ts";
import { boundedAttribution } from "../supabase/shared/validation.ts";

const [slug, source, medium, content, term, ...extra] = process.argv.slice(2);
const release = releases.find((item) => item.slug === slug);
const tags = {
  utm_source: source,
  utm_medium: medium,
  utm_campaign: release?.campaignId ?? slug,
  ...(content !== undefined && { utm_content: content }),
  ...(term !== undefined && { utm_term: term }),
};
const validated = boundedAttribution(tags);

if (
  !release ||
  extra.length ||
  Object.keys(validated).length !== Object.keys(tags).length
) {
  console.error(
    "Usage: node scripts/campaign-link.mjs <release-slug> <utm_source> <utm_medium> [utm_content] [utm_term]\nUse a catalog release and campaign labels without contact details or URLs.",
  );
  process.exitCode = 1;
} else {
  const url = new URL(getReleaseUrl(release.slug));
  url.search = new URLSearchParams(validated).toString();
  console.log(url.href);
}
