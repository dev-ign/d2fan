import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { MusicRelease } from "../domain/types";
import { AudioProvider } from "./AudioProvider";
import { useAudio } from "../hooks/useAudio";

const action: MusicRelease = {
  id: "accion",
  artistId: "jona-ferreira",
  slug: "accion",
  title: "Acción",
  releaseDate: "2026-09-25",
  coverArt: "/art.jpg",
  previewUrl: "/accion.m4a",
  featured: true,
  streamingLinks: {},
};
const another: MusicRelease = {
  ...action,
  id: "darte",
  slug: "darte",
  title: "Darte Nota",
  previewUrl: "/darte.m4a",
  featured: false,
};

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  static failNextPlay = false;
  preload = "none";
  currentTime = 0;
  duration = 30;
  paused = true;
  private source = "";
  constructor() {
    super();
    FakeAudio.instances.push(this);
  }
  get src() {
    return this.source;
  }
  set src(value: string) {
    this.source = new URL(value, window.location.href).href;
  }
  async play() {
    if (FakeAudio.failNextPlay) {
      FakeAudio.failNextPlay = false;
      throw new Error("Playback failed");
    }
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
}

function Probe() {
  const audio = useAudio();
  return (
    <>
      <output data-testid="audio-state">
        {audio.release?.id ?? "none"}:{audio.status}:{audio.currentTime}:
        {audio.duration}
      </output>
      <button onClick={() => void audio.play(action)}>play action</button>
      <button onClick={() => void audio.play(another)}>play another</button>
      <button onClick={() => void audio.toggle()}>toggle</button>
      <button onClick={() => audio.seek(15)}>seek</button>
    </>
  );
}

describe("shared audio provider", () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    FakeAudio.failNextPlay = false;
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("synchronizes play, pause, seek, switching tracks, ending and errors", async () => {
    render(
      <AudioProvider>
        <Probe />
      </AudioProvider>,
    );
    expect(screen.getByTestId("audio-state")).toHaveTextContent(
      "none:idle:0:0",
    );
    fireEvent.click(screen.getByText("play action"));
    await waitFor(() =>
      expect(screen.getByTestId("audio-state")).toHaveTextContent(
        "accion:playing:0:0",
      ),
    );
    const element = FakeAudio.instances[0];
    await act(async () => {
      element.currentTime = 12;
      element.dispatchEvent(new Event("timeupdate"));
      element.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(screen.getByTestId("audio-state")).toHaveTextContent(
      "accion:playing:12:30",
    );
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("audio-state")).toHaveTextContent(
      "accion:paused:12:30",
    );
    fireEvent.click(screen.getByText("seek"));
    expect(screen.getByTestId("audio-state")).toHaveTextContent(
      "accion:paused:15:30",
    );
    fireEvent.click(screen.getByText("toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("audio-state")).toHaveTextContent(
        "accion:playing:15:30",
      ),
    );
    fireEvent.click(screen.getByText("play another"));
    await waitFor(() =>
      expect(screen.getByTestId("audio-state")).toHaveTextContent(
        "darte:playing:0:0",
      ),
    );
    await act(async () => element.dispatchEvent(new Event("ended")));
    expect(screen.getByTestId("audio-state")).toHaveTextContent("darte:paused");
    await act(async () => element.dispatchEvent(new Event("error")));
    expect(screen.getByTestId("audio-state")).toHaveTextContent("darte:error");
  });

  it("reports a rejected play attempt and allows retry", async () => {
    FakeAudio.failNextPlay = true;
    render(
      <AudioProvider>
        <Probe />
      </AudioProvider>,
    );
    fireEvent.click(screen.getByText("play action"));
    await waitFor(() =>
      expect(screen.getByTestId("audio-state")).toHaveTextContent(
        "accion:error",
      ),
    );
    fireEvent.click(screen.getByText("play action"));
    await waitFor(() =>
      expect(screen.getByTestId("audio-state")).toHaveTextContent(
        "accion:playing",
      ),
    );
  });
});
