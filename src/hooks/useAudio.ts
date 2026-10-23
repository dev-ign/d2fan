import { useContext } from "react";
import { AudioContext } from "../app/audioContext";

export function useAudio() {
  const value = useContext(AudioContext);
  if (!value) throw new Error("useAudio must be used within AudioProvider");
  return value;
}
