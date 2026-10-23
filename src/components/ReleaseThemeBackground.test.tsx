import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReleaseThemeBackground } from "./ReleaseThemeBackground";
import { resolveReleaseTheme, releaseThemeKey } from "../domain/releaseTheme";
import {
  transitionTheme,
  type ThemeTransition,
} from "./releaseThemeTransition";
import { loadThemeImage } from "./releaseThemeImage";
const theme = (name: string) =>
  resolveReleaseTheme({ coverArt: `/${name}.webp` });
class TestImage {
  static instances: TestImage[] = [];
  src = "";
  naturalWidth = 640;
  onload?: () => void;
  onerror?: () => void;
  decode = vi.fn(async (): Promise<void> => undefined);
  constructor() {
    TestImage.instances.push(this);
  }
}
beforeEach(() => {
  TestImage.instances = [];
  vi.stubGlobal("Image", TestImage);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function loaded(image: TestImage) {
  await act(async () => {
    image.onload?.();
  });
}

describe("decorative theme backgrounds", () => {
  it("waits for readiness, ignores stale loads, caches unchanged selection and hides broken images", async () => {
    const a = theme("initial"),
      b = theme("slow"),
      c = theme("latest");
    const view = render(<ReleaseThemeBackground theme={a} />);
    expect(view.container.querySelectorAll("img")).toHaveLength(0);
    await loaded(TestImage.instances[0]);
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
      a.image,
    );
    view.rerender(<ReleaseThemeBackground theme={{ ...a }} />);
    expect(TestImage.instances).toHaveLength(1);
    view.rerender(<ReleaseThemeBackground theme={b} />);
    view.rerender(<ReleaseThemeBackground theme={c} />);
    await loaded(TestImage.instances[1]);
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
      a.image,
    );
    await loaded(TestImage.instances[2]);
    expect(view.container.querySelectorAll("img").length).toBeLessThanOrEqual(
      2,
    );
    const incoming = view.container.querySelector('[data-layer="incoming"]');
    expect(incoming?.querySelector("img")?.getAttribute("src")).toBe(c.image);
    view.rerender(<ReleaseThemeBackground theme={theme("broken")} />);
    await act(async () => TestImage.instances[3].onerror?.());
    expect(view.container.querySelector('img[src="/broken.webp"]')).toBeNull();
    expect(
      view.container
        .querySelector(".release-theme")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });
  it("does not reveal an image until decoding finishes", async () => {
    const view = render(
      <ReleaseThemeBackground theme={theme("decode-delayed")} />,
    );
    let finish!: () => void;
    TestImage.instances[0].decode.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      TestImage.instances[0].onload?.();
    });
    expect(view.container.querySelectorAll("img")).toHaveLength(0);
    await act(async () => finish());
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
      "/decode-delayed.webp",
    );
  });
  it("keeps the dark fallback when the initial cover fails and retries failures", async () => {
    const url = "/first-failed.webp";
    const view = render(
      <ReleaseThemeBackground theme={resolveReleaseTheme({ coverArt: url })} />,
    );
    await act(async () => TestImage.instances[0].onerror?.());
    expect(view.container.querySelectorAll("img")).toHaveLength(0);
    const retry = loadThemeImage(url);
    expect(TestImage.instances).toHaveLength(2);
    TestImage.instances[1].onload?.();
    await retry;
  });
});

describe("crossfade interruption and cleanup", () => {
  it("reverses an interrupted fade, keeps only the latest pending theme and cleans outgoing layers", () => {
    const a = theme("a"),
      b = theme("b"),
      c = theme("c"),
      d = theme("d");
    let state: ThemeTransition = {
      target: releaseThemeKey(a),
      visible: false,
      reverting: false,
    };
    state = transitionTheme(state, { type: "ready", theme: a });
    state = transitionTheme(state, { type: "target", key: releaseThemeKey(b) });
    state = transitionTheme(state, { type: "ready", theme: b });
    state = transitionTheme(state, { type: "enter", key: releaseThemeKey(b) });
    state = transitionTheme(state, { type: "target", key: releaseThemeKey(c) });
    expect(state.reverting).toBe(true);
    expect(state.visible).toBe(false);
    expect(state.base?.theme).toEqual(a);
    state = transitionTheme(state, { type: "target", key: releaseThemeKey(d) });
    const unchanged = transitionTheme(state, { type: "ready", theme: c });
    expect(unchanged).toBe(state);
    state = transitionTheme(state, { type: "ready", theme: d });
    state = transitionTheme(state, { type: "finish", key: releaseThemeKey(b) });
    expect(state.incoming?.theme).toEqual(d);
    state = transitionTheme(state, { type: "enter", key: releaseThemeKey(d) });
    state = transitionTheme(state, { type: "finish", key: releaseThemeKey(d) });
    expect(state.base?.theme).toEqual(d);
    expect(state.incoming).toBeUndefined();
    expect(state.pending).toBeUndefined();
  });
});
