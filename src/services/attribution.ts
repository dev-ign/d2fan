import type { Attribution } from "../../supabase/shared/contracts";
import { boundedAttribution } from "../../supabase/shared/validation";
const key = "jona:attribution:v1";
let memory:
  { first: Attribution; last: Attribution; expires: number } | undefined;
export function attribution() {
  const current = boundedAttribution(
    Object.fromEntries(new URLSearchParams(location.search)),
  );
  const release = location.pathname.match(/^\/music\/([a-z0-9-]+)$/)?.[1];
  if (release) current.release = release;
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
    // Reading the same release after its query was consumed must not erase
    // that visit's campaign. A new explicit campaign still replaces last touch.
    memory.last = Object.keys(current).some((field) => field !== "release")
      ? current
      : { ...memory.last, ...current };
  }
  try {
    localStorage.setItem(key, JSON.stringify(memory));
  } catch {
    /* Retain in memory. */
  }
  return { firstTouch: memory.first, lastTouch: memory.last };
}
