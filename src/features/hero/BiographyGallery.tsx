import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLocale, text } from "../../hooks/useLocale";

export function BiographyGallery({ portrait }: { portrait: string }) {
  const { t } = useLocale();
  const photos = useMemo(
    () => [
      { src: portrait, position: "center 32%" },
      { src: portrait, position: "center 64%" },
      { src: "/assets/photoss/jona1.webp", position: "center top" },
      { src: "/assets/photoss/jona2.webp", position: "center top" },
      { src: "/assets/photoss/jona7.webp", position: "center top" },
    ],
    [portrait],
  );
  const [index, setIndex] = useState(0);
  const [frame, setFrame] = useState<{
    current: number;
    previous: number | null;
  }>({ current: 0, previous: null });
  const touch = useRef<{ x: number; y: number } | null>(null);
  const move = (delta: number) =>
    setIndex((value) => (value + delta + photos.length) % photos.length);
  useEffect(() => {
    let live = true;
    const image = new Image();
    image.src = photos[index].src;
    void image
      .decode()
      .then(() => {
        if (!live) return;
        setFrame((previous) =>
          previous.current === index
            ? previous
            : {
                current: index,
                previous: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? null
                  : previous.current,
              },
        );
        const neighbor = new Image();
        neighbor.src = photos[(index + 1) % photos.length].src;
      })
      .catch(() => {
        /* A failed request retains the last decoded photograph. */
      });
    return () => {
      live = false;
    };
  }, [index, photos]);
  return (
    <div
      className="bio-photo"
      role="group"
      aria-roledescription={t.bio.carousel}
      aria-label={t.bio.gallery}
      aria-busy={frame.current !== index}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse")
          touch.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerCancel={() => {
        touch.current = null;
      }}
      onPointerUp={(event) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2)
          move(dx < 0 ? 1 : -1);
      }}
    >
      {frame.previous !== null && (
        <img
          className="bio-photo-previous"
          src={photos[frame.previous].src}
          alt=""
          aria-hidden="true"
          style={{ objectPosition: photos[frame.previous].position }}
          width="1024"
          height="1536"
        />
      )}
      <img
        key={frame.current}
        className="bio-photo-current"
        src={photos[frame.current].src}
        alt={t.bio.portrait}
        style={{ objectPosition: photos[frame.current].position }}
        width="1024"
        height="1536"
        draggable={false}
        decoding="async"
        onAnimationEnd={() =>
          setFrame((value) => ({ ...value, previous: null }))
        }
      />
      <div className="bio-photo-controls">
        <button
          className="icon-button"
          type="button"
          aria-label={t.bio.previous}
          onClick={() => move(-1)}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <span
          role="status"
          aria-live="polite"
          aria-label={text(t.bio.slide, {
            current: frame.current + 1,
            total: photos.length,
          })}
        >
          {String(frame.current + 1).padStart(2, "0")} /{" "}
          {String(photos.length).padStart(2, "0")}
        </span>
        <button
          className="icon-button"
          type="button"
          aria-label={t.bio.next}
          onClick={() => move(1)}
        >
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
