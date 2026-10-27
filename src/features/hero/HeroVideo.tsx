import { useEffect, useRef, useState } from "react";

const media = "/assets/hero/bts-";
const portraitMedia =
  "(max-width: 760px), (max-width: 960px) and (orientation: portrait)";

/** Decorative media stays independent of the shared music player. */
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  // React creates <img> before attaching its <picture> parent. Matching the
  // fallback up front avoids an eager desktop-poster request on mobile.
  const [poster] = useState(
    () =>
      `${media}${matchMedia(portraitMedia).matches ? "mobile" : "desktop"}.webp`,
  );
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let failed = false;
    let disposed = false;

    const syncPlayback = () => {
      if (disposed) return;
      if (reducedMotion.matches || document.hidden || !visible || failed) {
        video.pause();
        if (reducedMotion.matches || failed) video.dataset.playing = "false";
        if (reducedMotion.matches && video.hasAttribute("src")) {
          video.removeAttribute("src");
          video.load();
        }
        return;
      }
      if (!video.hasAttribute("src")) {
        // Select once; mobile browser chrome/resize never reloads the source.
        const format = matchMedia(portraitMedia).matches ? "mobile" : "desktop";
        video.dataset.format = format;
        video.poster = `${media}${format}.webp`;
        video.src = `${media}${format}.mp4`;
      }
      void video.play().catch(() => {
        if (!disposed && video.paused) video.dataset.playing = "false";
      });
    };
    const playing = () => {
      if (!disposed && !reducedMotion.matches && visible && !document.hidden) {
        video.dataset.playing = "true";
      } else video.pause();
    };
    const error = () => {
      failed = true;
      syncPlayback();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.05;
        syncPlayback();
      },
      { threshold: [0, 0.05] },
    );
    observer.observe(video.parentElement!);
    reducedMotion.addEventListener("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    video.addEventListener("playing", playing);
    video.addEventListener("error", error);
    return () => {
      disposed = true;
      observer.disconnect();
      reducedMotion.removeEventListener("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      video.removeEventListener("playing", playing);
      video.removeEventListener("error", error);
      video.pause();
    };
  }, []);
  return (
    <div className="hero-media" aria-hidden="true">
      <picture>
        <source media={portraitMedia} srcSet={`${media}mobile.webp`} />
        <source srcSet={`${media}desktop.webp`} />
        <img
          className="hero-poster"
          src={poster}
          alt=""
          width="1920"
          height="1080"
          fetchPriority="high"
        />
      </picture>
      <video
        ref={videoRef}
        className="hero-video"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        tabIndex={-1}
      />
    </div>
  );
}
