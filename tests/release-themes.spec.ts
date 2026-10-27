import { test, expect, type Page } from "./fixtures";
import { mkdir } from "node:fs/promises";
const output = "artifacts/qa-release-themes";
const covers = {
  accion: "/assets/raw-music-1.webp",
  "darte-nota": "/assets/raw-music-4.webp",
  cafe: "/assets/raw-vault-1.webp",
  caramelo: "/assets/raw-music-3.webp",
};
test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
});
async function stable(page: Page, image: string, host = "#music") {
  const background = page.locator(`${host} .release-theme`);
  await expect(background).toHaveAttribute("data-current-image", image);
  await expect(background).toHaveAttribute("data-transitioning", "false");
  await expect(background.locator("img")).toHaveCount(1);
  return background;
}

test("themes follow arrows, cover selection and keyboard tabs without altering shared playback", async ({
  page,
}) => {
  await page.goto("/#music");
  await page.evaluate(() => document.fonts.ready);
  const initial = await stable(page, covers.accion);
  await expect(initial).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("button", { name: "Play Acción preview" }).click();
  await page.getByRole("button", { name: "Open audio player" }).click();
  await expect(page.locator(".player-track strong")).toHaveText("Acción");
  await page.getByRole("button", { name: "Open audio player" }).click();
  const next = page.getByRole("button", { name: "Next release" });
  await next.click();
  await stable(page, covers["darte-nota"]);
  await expect(next).toBeFocused();
  await expect(page.locator(".wave-button .waveform--active")).toBeVisible();
  await page.getByRole("button", { name: "Open audio player" }).click();
  await expect(page.locator(".player-track strong")).toHaveText("Acción");
  await expect(
    page.getByRole("button", { name: "Pause preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open audio player" }).click();
  const cafe = page.getByRole("button", { name: "Café", exact: true });
  await cafe.focus();
  await page.keyboard.press("Enter");
  await stable(page, covers.cafe);
  await expect(cafe).toBeFocused();
  await page.getByRole("button", { name: "Select Caramelo" }).click();
  await stable(page, covers.caramelo);
});

test("normal motion crossfades decoded layers without a blank frame or layout change", async ({
  page,
}) => {
  await page.goto("/#music");
  await stable(page, covers.accion);
  const sectionHeight = await page
    .locator("#music")
    .evaluate((node) => node.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Darte Nota", exact: true }).click();
  await page.waitForFunction(() => {
    const incoming = document.querySelector('#music [data-layer="incoming"]');
    if (!incoming) return false;
    const opacity = Number(getComputedStyle(incoming).opacity);
    return opacity > 0 && opacity < 1;
  });
  const snapshot = await page
    .locator("#music .release-theme")
    .evaluate((node) => ({
      baseOpacity: getComputedStyle(node.querySelector('[data-layer="base"]')!)
        .opacity,
      decoded: [...node.querySelectorAll("img")].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
      duration: getComputedStyle(node.querySelector('[data-layer="incoming"]')!)
        .transitionDuration,
    }));
  expect(snapshot).toEqual({
    baseOpacity: "1",
    decoded: true,
    duration: "0.6s",
  });
  await stable(page, covers["darte-nota"]);
  expect(
    await page
      .locator("#music")
      .evaluate((node) => node.getBoundingClientRect().height),
  ).toBe(sectionHeight);
});

test("rapid selection cancels stale loads and interrupted fades with a bounded layer count", async ({
  page,
}) => {
  await page.route("**/assets/raw-vault-1.webp", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.goto("/#music");
  await stable(page, covers.accion);
  await page.getByRole("button", { name: "Darte Nota", exact: true }).click();
  await expect(page.locator('#music [data-layer="incoming"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Café", exact: true }).click();
  await page.getByRole("button", { name: "Caramelo", exact: true }).click();
  for (let step = 0; step < 8; step++) {
    expect(
      await page.locator("#music .release-theme img").count(),
    ).toBeLessThanOrEqual(2);
    await page.waitForTimeout(150);
  }
  await stable(page, covers.caramelo);
  await page.waitForTimeout(1000);
  await stable(page, covers.caramelo);
  await expect(page.locator(".release-head h3")).toHaveText("Caramelo");
});

test("direct landing pages, refresh and SPA route changes resolve their own theme", async ({
  page,
}) => {
  await page.goto("/music/cafe");
  await stable(page, covers.cafe, ".release-page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Café");
  await page.reload();
  await stable(page, covers.cafe, ".release-page");
  await page.evaluate(() => {
    history.pushState(null, "", "/music/darte-nota");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Darte Nota",
  );
  await stable(page, covers["darte-nota"], ".release-page");
  await page.goto("/music/does-not-exist");
  await expect(page.getByText("RELEASE NOT FOUND")).toBeVisible();
  await expect(page.locator(".release-theme")).toHaveCount(0);
});

test("failed background loads keep a decoded theme and initial failures keep a dark fallback", async ({
  page,
}) => {
  await page.route("**/assets/raw-vault-1.webp", (route) => route.abort());
  await page.goto("/#music");
  await stable(page, covers.accion);
  await page.getByRole("button", { name: "Café", exact: true }).click();
  await expect(page.locator(".release-head h3")).toHaveText("Café");
  await page.waitForTimeout(200);
  await stable(page, covers.accion);
  await expect(page.locator("#music .release-theme img")).toHaveCount(1);
  await page.goto("/music/cafe");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Café");
  await expect(page.locator(".release-theme img")).toHaveCount(0);
  expect(
    await page
      .locator(".release-theme")
      .evaluate((node) => getComputedStyle(node).backgroundImage),
  ).not.toBe("none");
});

test("reduced motion, responsive themes and scoped surfaces remain stable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 920 });
    await page.goto("/#music");
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    const otherSurfaces = await page
      .locator(".hero, .vault-section, .stay-section, .site-header")
      .evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).backgroundImage),
      );
    for (const [slug, title] of [
      ["accion", "Acción"],
      ["darte-nota", "Darte Nota"],
      ["cafe", "Café"],
    ] as const) {
      await page.getByRole("button", { name: title, exact: true }).click();
      await stable(page, covers[slug]);
      expect(
        await page
          .locator(".release-theme__layer")
          .evaluate((node) => getComputedStyle(node).transitionDuration),
      ).toBe("0s");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if ([1440, 390].includes(width)) {
        await page.locator("#music").scrollIntoViewIfNeeded();
        await page
          .locator("#music")
          .screenshot({ path: `${output}/music-${slug}-${width}.png` });
      }
    }
    expect(
      await page
        .locator(".hero, .vault-section, .stay-section, .site-header")
        .evaluateAll((nodes) =>
          nodes.map((node) => getComputedStyle(node).backgroundImage),
        ),
    ).toEqual(otherSurfaces);
    await page.goto("/music/cafe");
    await stable(page, covers.cafe, ".release-page");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if ([1440, 390].includes(width))
      await page.screenshot({
        path: `${output}/release-cafe-${width}.png`,
        fullPage: true,
      });
  }
});
