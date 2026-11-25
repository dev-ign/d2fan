import { campaignLink } from "../src/data/campaignLink.ts";

const [slug, source, medium, content, term, ...extra] = process.argv.slice(2);
const url = campaignLink(slug, source, medium, content, term);

if (!url || extra.length) {
  console.error(
    "Usage: node scripts/campaign-link.mjs <release-slug> <utm_source> <utm_medium> [utm_content] [utm_term]\nUse a catalog release and campaign labels without contact details or URLs.",
  );
  process.exitCode = 1;
} else {
  console.log(url);
}
