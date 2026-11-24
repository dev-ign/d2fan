import type { Attribution } from "../../supabase/shared/contracts";
import {
  boundedAttribution,
  campaignParameters,
} from "../../supabase/shared/validation";
import { releases } from "../data/content";
const key = "jona:attribution:v1";
let memory:
  { first: Attribution; last: Attribution; expires: number } | undefined;
export function attribution() {
  const params = new URLSearchParams(location.search);
  const tags = boundedAttribution(
    Object.fromEntries(
      campaignParameters.map((field) => [field, params.get(field)]),
    ),
  );
  const tagged = Object.keys(tags).length > 0;
  const path = location.pathname.replace(/\/$/, "") || "/";
  const release = releases.find((item) => path === `/music/${item.slug}`);
  const current: Attribution = {
    ...tags,
    ...(release && { release: release.slug }),
    ...(release?.campaignId && { campaign_id: release.campaignId }),
    ...((release || (tagged && path === "/")) && { landing_path: path }),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      saved &&
      typeof saved.expires === "number" &&
      saved.expires <= Date.now() + 30 * 86400000
    )
      memory = {
        first: boundedAttribution(saved.first),
        last: boundedAttribution(saved.last),
        expires: saved.expires,
      };
  } catch {
    /* Storage is optional. */
  }
  if (!memory || memory.expires < Date.now())
    memory = {
      first: current,
      last: current,
      expires: Date.now() + 30 * 86400000,
    };
  if (Object.keys(current).length) {
    if (!Object.keys(memory.first).length) memory.first = current;
    // Untagged navigation can update the conversion release while keeping
    // the most recent tagged landing and campaign intact.
    const last = memory.last;
    memory.last =
      !tagged && release && campaignParameters.some((field) => last[field])
        ? { ...last, release: release.slug }
        : current;
  }
  try {
    localStorage.setItem(key, JSON.stringify(memory));
  } catch {
    /* Retain in memory. */
  }
  return { firstTouch: memory.first, lastTouch: memory.last };
}
