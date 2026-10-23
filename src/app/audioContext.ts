import { createContext } from "react";
import type { MusicRelease } from "../domain/types";

export type AudioStatus = "idle" | "loading" | "playing" | "paused" | "error";
export interface AudioContextValue {
  release: MusicRelease | null;
  status: AudioStatus;
  currentTime: number;
  duration: number;
  error: string | null;
  play: (release: MusicRelease) => Promise<void>;
  toggle: () => Promise<void>;
  seek: (time: number) => void;
}

export const AudioContext = createContext<AudioContextValue | null>(null);
