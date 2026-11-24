import { useEffect, useState } from "react";
import { releases } from "../data/content";

const publicationTimes = releases
  .flatMap((release) =>
    release.publicationStatus === "upcoming" && release.publishAt
      ? [Date.parse(release.publishAt)]
      : [],
  )
  .filter(Number.isFinite)
  .sort((a, b) => a - b);

export function useReleaseClock() {
  const [serverTime, setServerTime] = useState<number>();
  useEffect(() => {
    if (!publicationTimes.length) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let checking = false;
    let complete = false;

    async function refresh() {
      if (checking || complete || controller.signal.aborted) return;
      checking = true;
      window.clearTimeout(timer);
      let wait = 30_000;
      try {
        const response = await fetch("/api/release-clock", {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(5_000),
          ]),
        });
        if (!response.ok) throw new Error("Release clock unavailable");
        const { now } = await response.json();
        if (!Number.isSafeInteger(now) || now <= 0)
          throw new Error("Invalid server time");
        if (controller.signal.aborted) return;
        setServerTime((previous) => Math.max(previous ?? 0, now));
        const next = publicationTimes.find((time) => time > now);
        complete = next === undefined;
        if (next !== undefined) wait = Math.min(next - now, 86_400_000);
      } catch {
        // Keep the last confirmed state until the server is reachable.
      } finally {
        checking = false;
        if (!complete && !controller.signal.aborted)
          timer = window.setTimeout(() => void refresh(), wait);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void refresh();
    }
    timer = window.setTimeout(() => void refresh(), 0);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  return serverTime;
}
