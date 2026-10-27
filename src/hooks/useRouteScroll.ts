import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const anchors = new Set(["#top", "#music", "#vault", "#stay-close"]);

/** One owner for route scrolling; playback and modal renders never reset it. */
export function useRouteScroll() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, { top: number; hash: string }>());

  useLayoutEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.experience = location.pathname === "/" ? "home" : "release";
    html.dataset.scrollReady = "false";
    const previousPosition =
      navigationType === "POP"
        ? positions.current.get(location.key)
        : undefined;
    // A native hash navigation can reuse a history key. A new explicit target
    // must not inherit that key's old section position.
    const saved =
      previousPosition?.hash === location.hash
        ? previousPosition.top
        : undefined;
    const anchor = anchors.has(location.hash)
      ? location.hash.slice(1)
      : undefined;
    let live = true;
    let frame = 0;
    let settling = false;
    const entries = positions.current;
    const remember = () => {
      // Ignore scroll clamping while the outgoing route's DOM is removed.
      if (window.location.pathname !== location.pathname) return;
      if (
        location.pathname === "/" &&
        !document.querySelector(".home-experience")
      )
        return;
      if (document.querySelector('main[aria-busy="true"]')) return;
      entries.set(location.key, { top: window.scrollY, hash: location.hash });
    };
    window.addEventListener("scroll", remember, { passive: true });
    // Record the departure position before a Link changes the route's DOM.
    document.addEventListener("click", remember, true);
    if (saved === undefined && !anchor)
      window.scrollTo({ top: 0, behavior: "instant" });

    const settle = () => {
      if (settling || !live) return;
      if (document.querySelector('main[aria-busy="true"]')) return;
      if (
        location.pathname === "/" &&
        !document.querySelector(".home-experience")
      )
        return;
      if (anchor && !document.getElementById(anchor)) return;
      settling = true;
      observer.disconnect();
      // Wait only for the actual route's DOM and fonts, never a guessed delay.
      void document.fonts.ready.then(() => {
        if (!live) return;
        frame = requestAnimationFrame(() => {
          if (saved !== undefined)
            window.scrollTo({ top: saved, behavior: "instant" });
          else if (anchor)
            document
              .getElementById(anchor)
              ?.scrollIntoView({ block: "start", behavior: "instant" });
          else window.scrollTo({ top: 0, behavior: "instant" });
          html.dataset.scrollReady = "true";
        });
      });
    };
    const observer = new MutationObserver(settle);
    observer.observe(document.getElementById("root")!, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-busy"],
    });
    settle();
    return () => {
      live = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", remember);
      document.removeEventListener("click", remember, true);
    };
  }, [location.key, location.pathname, location.hash, navigationType]);
}
