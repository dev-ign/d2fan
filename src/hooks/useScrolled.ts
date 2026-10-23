import { useCallback, useSyncExternalStore } from "react";

export function useScrolled(threshold = 40) {
  const snapshot = useCallback(() => window.scrollY > threshold, [threshold]);
  const subscribe = useCallback(
    (notify: () => void) => {
      let previous = window.scrollY > threshold;
      const update = () => {
        const next = window.scrollY > threshold;
        if (next !== previous) {
          previous = next;
          notify();
        }
      };
      window.addEventListener("scroll", update, { passive: true });
      return () => window.removeEventListener("scroll", update);
    },
    [threshold],
  );
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
