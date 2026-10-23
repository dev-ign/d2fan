import { test, expect } from "@playwright/test";
import { expectResponsiveLayout } from "./helpers/responsive-layout";

const widths = [
  320, 375, 390, 479, 480, 481, 640, 759, 760, 761, 768, 820, 1024, 1099, 1100,
  1101, 1440,
];

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
