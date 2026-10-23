import { test, expect } from "@playwright/test";
import { expectResponsiveLayout } from "./helpers/responsive-layout";

const widths = [
  320, 375, 390, 479, 480, 481, 640, 759, 760, 761, 768, 820, 1024, 1099, 1100,
  1101, 1440,
];

test("mobile floating shell accommodates a wide system-font fallback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator(".wordmark").waitFor();
  // Linux has no Impact; force its wider fallback even on Macs that have it.
  await page.addStyleTag({
    content: ".wordmark { font-family: Arial, sans-serif !important; }",
  });
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 568 });
    await expectResponsiveLayout(page);
    const fits = await page.evaluate(() => {
      const shell = document
        .querySelector(".header-inner")!
        .getBoundingClientRect();
      const brand = document
        .querySelector(".wordmark")!
        .getBoundingClientRect();
      const actions = document
        .querySelector(".header-actions")!
        .getBoundingClientRect();
      return (
        brand.left >= shell.left &&
        brand.right <= actions.left &&
        brand.bottom <= shell.bottom &&
        actions.right <= shell.right
      );
    });
    expect(fits, `header shell at ${width}px`).toBe(true);
  }
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`responsive bounds before and after delayed fonts (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    let releaseFonts!: () => void;
    const fontsReady = new Promise<void>((resolve) => {
      releaseFonts = resolve;
    });
    let fontRequests = 0;
    await page.route(/\.(woff2?|ttf)(\?.*)?$/, async (route) => {
      fontRequests++;
      await fontsReady;
      await route.continue();
    });
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator(".stay-intro h2")).toBeAttached();
      await expect.poll(() => fontRequests).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.fonts.status)).toBe("loading");
      for (const width of widths) {
        await page.setViewportSize({ width, height: 920 });
        await expectResponsiveLayout(page);
      }
      releaseFonts();
      await page.evaluate(() => document.fonts.ready);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 920 });
        await expectResponsiveLayout(page);
      }
    } finally {
      releaseFonts();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}
