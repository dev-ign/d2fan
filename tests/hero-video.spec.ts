import { test, expect } from "./fixtures";
import { mkdir, writeFile } from "node:fs/promises";

const output = "artifacts/qa-hero-v2/browser";
test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
});

test("responsive hero uses one silent video variant and preserves composition at nine widths", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const metrics = { cls: 0, posterVisibleMs: 0 };
    const poster = () => {
      const image = document.querySelector<HTMLImageElement>(".hero-poster");
      if (image?.complete && image.naturalWidth)
        metrics.posterVisibleMs = performance.now();
      else requestAnimationFrame(poster);
    };
    requestAnimationFrame(poster);
    Object.assign(window, { heroMetrics: metrics });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (!shift.hadRecentInput) metrics.cls += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/hero/"))
      requests.push(new URL(request.url()).pathname);
  });
  const samples = [];
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1280, 800],
    [1024, 768],
    [768, 1024],
    [430, 932],
    [390, 844],
    [375, 812],
    [320, 740],
  ]) {
    await page.goto("about:blank");
    await page.setViewportSize({ width, height });
    requests.length = 0;
    await page.goto("/");
    const video = page.locator(".hero-video");
    await expect(video).toHaveAttribute("data-playing", "true");
    await expect(page.locator("html")).toHaveAttribute(
      "data-scroll-ready",
      "true",
    );
    await expect(page.locator(".hero .social-strip")).toHaveCSS(
      "transform",
      "none",
    );
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    const format =
      width <= 760 || (width <= 960 && height >= width) ? "mobile" : "desktop";
    await expect(video).toHaveAttribute("data-format", format);
    const initial = await video.evaluate((element: HTMLVideoElement) => ({
      muted: element.muted,
      loop: element.loop,
      inline: element.playsInline,
      controls: element.controls,
      currentSrc: new URL(element.currentSrc).pathname,
      videoWidth: element.videoWidth,
      videoHeight: element.videoHeight,
      duration: element.duration,
    }));
    expect(initial).toMatchObject({
      muted: true,
      loop: true,
      inline: true,
      controls: false,
      currentSrc: `/assets/hero/bts-${format}.mp4`,
    });
    expect(initial.duration).toBeCloseTo(1774 / 30, 2);
    await video.evaluate((element: HTMLVideoElement) => {
      element.pause();
      element.currentTime = 3.5;
    });
    await expect
      .poll(() =>
        video.evaluate((element: HTMLVideoElement) => element.seeking),
      )
      .toBe(false);
    const geometry = await page.evaluate(() => {
      const hero = document.querySelector(".hero")!.getBoundingClientRect();
      const video = document
        .querySelector(".hero-video")!
        .getBoundingClientRect();
      const socials = document
        .querySelector(".hero .social-strip")!
        .getBoundingClientRect();
      const copy = document
        .querySelector(".hero-content")!
        .getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        height: hero.height,
        fullBleed:
          Math.abs(hero.width - video.width) < 1 &&
          Math.abs(hero.height - video.height) < 1,
        copyInHero: copy.top >= 0 && copy.bottom <= hero.bottom,
        socialsInHero: socials.bottom <= hero.bottom + 1,
        cls: (
          window as Window & {
            heroMetrics: { cls: number; posterVisibleMs: number };
          }
        ).heroMetrics.cls,
        posterVisibleMs: (
          window as Window & { heroMetrics: { posterVisibleMs: number } }
        ).heroMetrics.posterVisibleMs,
      };
    });
    expect(geometry).toMatchObject({
      overflow: false,
      fullBleed: true,
      copyInHero: true,
      socialsInHero: true,
    });
    expect(geometry.cls).toBeLessThan(0.02);
    expect(
      requests
        .filter((path) => path.endsWith(".mp4"))
        .every((path) => path.includes(`bts-${format}.mp4`)),
    ).toBe(true);
    expect(
      requests
        .filter((path) => path.endsWith(".webp"))
        .every((path) => path.includes(`bts-${format}.webp`)),
      `width=${width} hero requests=${JSON.stringify(requests)}`,
    ).toBe(true);
    await page.screenshot({ path: `${output}/hero-${width}.png` });
    samples.push({
      width,
      height,
      format,
      ...initial,
      ...geometry,
      requestedAssets: [...new Set(requests)],
    });
    if (width === 1440 || width === 390) {
      for (const time of [
        0.05, 4.5, 4.7, 8, 14.78, 19, 24.3, 24.5, 29.57, 38, 44.35, 46.5, 48.5,
        49.5, 51, 58.95,
      ]) {
        await video.evaluate((element: HTMLVideoElement, time) => {
          element.currentTime = time;
        }, time);
        await expect
          .poll(() =>
            video.evaluate((element: HTMLVideoElement) => element.seeking),
          )
          .toBe(false);
        await page.screenshot({
          path: `${output}/hero-${width}-frame-${time}.png`,
        });
      }
    }
  }
  await writeFile(
    `${output}/responsive-metrics.json`,
    JSON.stringify(samples, null, 2),
  );
});

test("reduced motion is poster only and media failure retains the hero content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".mp4")) requests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-ready",
    "true",
  );
  expect(await page.locator(".hero-video").getAttribute("src")).toBeNull();
  expect(requests).toHaveLength(0);
  expect(
    await page
      .locator(".hero-poster")
      .evaluate(
        (image: HTMLImageElement) => new URL(image.currentSrc).pathname,
      ),
  ).toBe("/assets/hero/bts-mobile.webp");
  await expect(page.locator(".hero-poster")).toBeVisible();
  await page.screenshot({ path: `${output}/reduced-motion-mobile.png` });
  await page.route("**/assets/hero/*.mp4", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(() =>
      page
        .locator(".hero-video")
        .evaluate((video: HTMLVideoElement) => video.error !== null),
    )
    .toBe(true);
  await expect(page.locator(".hero-video")).toHaveCSS("opacity", "0");
  await expect(
    page.getByRole("button", { name: "Read artist biography" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Latest release: Acción" }),
  ).toBeVisible();
  await page.screenshot({ path: `${output}/failed-video-mobile.png` });
});

test("autoplay rejection leaves the matching poster visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "src",
    )!;
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      ...descriptor,
      set(value) {
        this.autoplay = false;
        descriptor.set!.call(this, value);
      },
    });
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(new DOMException("Playback blocked", "NotAllowedError"));
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-ready",
    "true",
  );
  await expect(page.locator(".hero-video")).toHaveAttribute(
    "data-playing",
    "false",
  );
  await expect(page.locator(".hero-video")).toHaveCSS("opacity", "0");
  await expect(page.locator(".hero-poster")).toBeVisible();
});

test("native loop, offscreen pause, return resume and stable source on resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const video = page.locator(".hero-video");
  await expect(video).toHaveAttribute("data-playing", "true");
  const src = await video.getAttribute("src");
  await video.evaluate((video: HTMLVideoElement) => {
    video.currentTime = video.duration - 0.12;
  });
  await expect
    .poll(() => video.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeLessThan(1);
  await page.locator("#vault").scrollIntoViewIfNeeded();
  await expect
    .poll(() => video.evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(true);
  await page.locator(".wordmark").click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect
    .poll(() => video.evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(false);
  await page.setViewportSize({ width: 430, height: 932 });
  await expect(video).toHaveAttribute("src", src!);
});

test("fresh and refreshed home start at the hero; history and explicit anchors are preserved", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-ready",
    "true",
  );
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.locator("#music").scrollIntoViewIfNeeded();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-ready",
    "true",
  );
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole("link", { name: "Music", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-ready",
    "true",
  );
  await expect(page.locator("#music-title")).toBeInViewport();
  await page.evaluate(() =>
    document.addEventListener(
      "click",
      () => {
        Object.assign(window, { heroDeparture: scrollY });
      },
      { capture: true, once: true },
    ),
  );
  await page.getByRole("link", { name: "Release page", exact: true }).click();
  const saved = await page.evaluate(
    () => (window as Window & { heroDeparture: number }).heroDeparture,
  );
  await expect(page).toHaveURL(/\/music\/accion$/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-ready",
    "true",
  );
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(/#music$/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-ready",
    "true",
  );
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(saved, 0);
  await page.goForward();
  await expect(page).toHaveURL(/\/music\/accion$/);
  await page.locator(".wordmark").click();
  await expect(page).toHaveURL("/");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.goto("/#vault");
  await expect(page.locator("#vault-title")).toBeInViewport();
});

test("poster stays visible while video delivery is constrained, then playback introduces no layout movement", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/hero/*.mp4", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const poster = page.locator(".hero-poster");
  await expect
    .poll(() =>
      poster.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await expect(page.locator(".hero-video")).toHaveCSS("opacity", "0");
  const before = await page.locator(".hero").boundingBox();
  await page.screenshot({ path: `${output}/waiting-for-video-mobile.png` });
  release();
  await expect(page.locator(".hero-video")).toHaveAttribute(
    "data-playing",
    "true",
  );
  const after = await page.locator(".hero").boundingBox();
  expect(after).toEqual(before);
});

test("camera master cannot be fetched from the development server", async ({
  request,
}) => {
  for (const name of ["d2c-hero-video", "new-hero-video"]) {
    const response = await request.get(`/source-media/${name}.mp4`, {
      headers: { Range: "bytes=0-3" },
    });
    expect(response.status()).toBe(403);
  }
});

test("viewport owns navigation through logo, manual scrolling, hashes, history and resizing", async ({
  page,
}) => {
  await page.goto("/");
  const active = page.locator('.site-nav [aria-current="location"]');
  await expect(page.locator("html")).toHaveAttribute(
    "data-scroll-ready",
    "true",
  );
  await expect(active).toHaveCount(0);
  for (const id of ["music", "vault", "stay-close"]) {
    await page.locator(`.site-nav a[href="/#${id}"]`).click();
    await expect(active).toHaveAttribute("href", `/#${id}`);
  }
  await page.locator(".wordmark").click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(active).toHaveCount(0);
  // These moves intentionally do not change the hash or dispatch a nav click.
  await page.locator("#stay-close").scrollIntoViewIfNeeded();
  await expect(active).toHaveAttribute("href", "/#stay-close");
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -12000);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(active).toHaveCount(0);
  for (const id of ["music", "vault", "stay-close"]) {
    await page.goto(`/#${id}`);
    await expect(active).toHaveAttribute("href", `/#${id}`);
    await page.reload();
    await expect(active).toHaveAttribute("href", `/#${id}`);
  }
  await page.locator('.site-nav a[href="/#music"]').click();
  await expect(active).toHaveAttribute("href", "/#music");
  await page.goBack();
  await expect(active).toHaveAttribute("href", "/#stay-close");
  await page.goForward();
  await expect(active).toHaveAttribute("href", "/#music");
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(active).toHaveAttribute("href", "/#music");
  await page.locator(".wordmark").click();
  await expect(active).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.locator('.site-nav a[href="/#music"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(active).toHaveAttribute("href", "/#music");
});

test("mobile menu shares viewport selection and reduced-motion changes stop delivery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const video = page.locator(".hero-video");
  await expect(video).toHaveAttribute("data-playing", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(video).not.toHaveAttribute("src");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Site navigation" });
  await expect(menu.locator('[aria-current="location"]')).toHaveCount(0);
  await menu.getByRole("link", { name: /The Vault/ }).click();
  await expect(menu).not.toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(menu.locator('[aria-current="location"]')).toHaveAttribute(
    "href",
    "/#vault",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

test("hidden document pauses video and a visible document resumes it", async ({
  page,
}) => {
  await page.goto("/");
  const video = page.locator(".hero-video");
  await expect(video).toHaveAttribute("data-playing", "true");
  // Exercise the browser visibility handler deterministically; headless tabs
  // do not consistently receive visibility changes when another tab is opened.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
});
