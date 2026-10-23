import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { MusicRelease } from "../domain/types";
import { AudioContext } from "./audioContext";
import type { AudioStatus } from "./audioContext";

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playRequestRef = useRef(0);
  const [release, setRelease] = useState<MusicRelease | null>(null);
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () =>
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => setStatus("paused");
    const onError = () => {
      setError("This preview could not be played.");
      setStatus("error");
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audioRef.current = null;
    };
  }, []);

  const play = useCallback(async (next: MusicRelease) => {
    const request = ++playRequestRef.current;
    const audio = audioRef.current;
    if (!audio || !next.previewUrl) {
      setError("A preview is not available for this release.");
      setStatus("error");
      return;
    }
    if (audio.src !== new URL(next.previewUrl, window.location.href).href) {
      audio.pause();
      audio.src = next.previewUrl;
      audio.currentTime = 0;
      setCurrentTime(0);
      setDuration(0);
    }
    setRelease(next);
    setError(null);
    setStatus("loading");
    try {
      await audio.play();
      if (request === playRequestRef.current) setStatus("playing");
    } catch {
      if (request === playRequestRef.current) {
        setError(
          "Playback was blocked or the preview is unavailable. Try again.",
        );
        setStatus("error");
      }
    }
  }, []);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !release) return;
    if (!audio.paused) {
      playRequestRef.current += 1;
      audio.pause();
      setStatus("paused");
    } else {
      await play(release);
    }
  }, [play, release]);

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (audio && Number.isFinite(time)) {
        audio.currentTime = Math.min(Math.max(time, 0), duration || 0);
        setCurrentTime(audio.currentTime);
      }
    },
    [duration],
  );

  return (
    <AudioContext.Provider
      value={{
        release,
        status,
        currentTime,
        duration,
        error,
        play,
        toggle,
        seek,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}
