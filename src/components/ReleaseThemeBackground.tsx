import { useEffect, useReducer, useRef, type CSSProperties } from "react";
import {
  RELEASE_THEME_DURATION_MS,
  releaseThemeKey,
  type ResolvedReleaseTheme,
} from "../domain/releaseTheme";
import { transitionTheme, type ThemeLayer } from "./releaseThemeTransition";
import { loadThemeImage } from "./releaseThemeImage";

export function ReleaseThemeBackground({
  theme,
  className = "",
  priority = false,
}: {
  theme: ResolvedReleaseTheme;
  className?: string;
  priority?: boolean;
}) {
  const key = releaseThemeKey(theme);
  const [state, dispatch] = useReducer(transitionTheme, {
    target: key,
    visible: false,
    reverting: false,
  });
  const background = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    dispatch({ type: "target", key });
    const load = () => {
      if (theme.image)
        void loadThemeImage(theme.image, priority).then(
          () => {
            if (live) dispatch({ type: "ready", theme });
          },
          () => {
            /* Keep the decoded background, or the dark fallback on first load. */
          },
        );
    };
    let observer: IntersectionObserver | undefined;
    if (priority || !("IntersectionObserver" in window)) load();
    else if (background.current) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            load();
            observer?.disconnect();
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(background.current);
    }
    return () => {
      live = false;
      observer?.disconnect();
    };
    // The value key includes every presentation field; object identity is irrelevant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, priority]);
  const incomingKey = state.incoming?.key;
  useEffect(() => {
    if (!incomingKey || state.reverting) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        dispatch({ type: "enter", key: incomingKey }),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [incomingKey, state.reverting]);
  useEffect(() => {
    if (!incomingKey || (!state.visible && !state.reverting)) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = setTimeout(
      () => dispatch({ type: "finish", key: incomingKey }),
      reduced ? 0 : RELEASE_THEME_DURATION_MS + 50,
    );
    return () => clearTimeout(timeout);
  }, [incomingKey, state.visible, state.reverting]);
  function layer(value: ThemeLayer, entering = false) {
    return (
      <div
        key={value.key}
        className="release-theme__layer"
        data-theme-image={value.theme.image}
        data-layer={entering ? "incoming" : "base"}
        style={{ opacity: entering ? Number(state.visible) : 1 }}
        onTransitionEnd={
          entering
            ? (event) => {
                if (
                  event.target === event.currentTarget &&
                  event.propertyName === "opacity"
                )
                  dispatch({ type: "finish", key: value.key });
              }
            : undefined
        }
      >
        <img
          src={value.theme.image}
          alt=""
          decoding="async"
          fetchPriority={priority ? "high" : "low"}
          style={{ objectPosition: value.theme.backgroundPosition }}
        />
        <span
          className="release-theme__overlay"
          style={{
            backgroundColor: value.theme.overlayColor,
            opacity: value.theme.overlayOpacity,
          }}
        />
      </div>
    );
  }
  return (
    <div
      ref={background}
      className={`release-theme ${className}`}
      aria-hidden="true"
      data-target-image={theme.image}
      data-current-image={state.base?.theme.image}
      data-transitioning={Boolean(state.incoming)}
      style={
        {
          "--release-theme-duration": `${RELEASE_THEME_DURATION_MS}ms`,
        } as CSSProperties
      }
    >
      {state.base && layer(state.base)}
      {state.incoming && layer(state.incoming, true)}
    </div>
  );
}
