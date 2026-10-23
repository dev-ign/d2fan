import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const outputDir = "artifacts/qa-phase1";
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 920 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.locator(".hero-content").waitFor();
for (const [name, id] of [
  ["hero", "top"],
  ["music", "music"],
  ["vault", "vault"],
  ["stay", "stay-close"],
]) {
  await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  await page.evaluate(
    (id) => document.getElementById(id)?.scrollIntoView(),
    id,
  );
  await page.waitForTimeout(850);
  await page.screenshot({ path: `${outputDir}/${name}-viewport.png` });
  await page.locator(`#${id}`).screenshot({ path: `${outputDir}/${name}.png` });
}
await page
  .locator(".social-strip")
  .screenshot({ path: `${outputDir}/social-strip.png` });
await page.getByRole("button", { name: "READ MORE" }).click();
await page.screenshot({ path: `${outputDir}/biography-dialog.png` });
await page.keyboard.press("Escape");
await page.locator("#music").scrollIntoViewIfNeeded();
await page.getByRole("button", { name: "Listen on" }).click();
await page.screenshot({ path: `${outputDir}/streaming-menu.png` });
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Play Acción preview" }).click();
await page.getByRole("button", { name: "Pause Acción preview" }).waitFor();
await page.getByRole("button", { name: "Open audio player" }).click();
await page.screenshot({ path: `${outputDir}/audio-player.png` });
await page.getByRole("button", { name: "Open audio player" }).click();
await page.getByRole("button", { name: "SUPPORT THE JOURNEY" }).click();
await page.screenshot({ path: `${outputDir}/support-dialog.png` });
await page.keyboard.press("Escape");
await page.locator("#stay-close").scrollIntoViewIfNeeded();
await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
await page
  .locator("#stay-close")
  .screenshot({ path: `${outputDir}/newsletter-error.png` });
const result = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  viewportWidth: window.innerWidth,
  images: [...document.images].map((image) => ({
    src: image.src,
    loaded: image.complete && image.naturalWidth > 0,
    width: image.naturalWidth,
    height: image.naturalHeight,
  })),
  sections: [...document.querySelectorAll("main > section, main > aside")].map(
    (node) => ({
      id: node.id,
      top: node.getBoundingClientRect().top + window.scrollY,
      height: node.getBoundingClientRect().height,
    }),
  ),
}));
const viewports = [];
await page.emulateMedia({ reducedMotion: "reduce" });
for (const width of [1440, 1024, 950, 850, 768, 390, 320]) {
  await page.setViewportSize({ width, height: 920 });
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  const measured = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  for (const id of ["stay-close", "vault", "music", "top"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(250);
  await page.screenshot({
    path: `${outputDir}/viewport-${width}.png`,
    fullPage: true,
  });
  viewports.push({ width, ...measured });
}
const report = { errors, ...result, viewports };
await writeFile(`${outputDir}/results.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
