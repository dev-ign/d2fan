import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.beforeAll(async () => {
  await mkdir("artifacts/qa-premium/browser", { recursive: true });
});

test("hero invitation, integrated socials and floating navigation fit the two priority viewports", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [1366, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".hero-bio-secondary")).toHaveCount(0);
    await expect(page.locator(".hero .social-strip")).toHaveCount(1);
    await expect(page.locator(".featured-card")).toContainText(
      "LATEST RELEASE",
    );
    const heroFits = await page.evaluate(() => {
      const socials = document
        .querySelector(".hero .social-strip")!
        .getBoundingClientRect();
      const card = document
        .querySelector(".featured-card")!
        .getBoundingClientRect();
      const bio = document.querySelector(".hero-bio")!.getBoundingClientRect();
      return (
        socials.bottom <= innerHeight + 1 &&
        card.bottom <= socials.top &&
        bio.bottom <= card.top
      );
    });
    expect(heroFits).toBe(true);
    await page.screenshot({
      path: `artifacts/qa-premium/browser/hero-${width}.png`,
    });
    const biography = page.getByRole("button", {
      name: "Read artist biography",
    });
    await biography.click();
    await expect(page.getByRole("dialog")).toContainText(
      "reggaeton, dancehall",
    );
    await page.keyboard.press("Escape");
    await expect(biography).toBeFocused();
    const header = page.locator(".site-header");
    await expect(header).toHaveAttribute("data-scrolled", "false");
    const before = await page.locator(".header-inner").boundingBox();
    await page
      .locator("#music")
      .evaluate((element) => element.scrollIntoView({ behavior: "instant" }));
    await expect(header).toHaveAttribute("data-scrolled", "true");
    const after = await page.locator(".header-inner").boundingBox();
    expect(after!.height).toBe(before!.height);
    expect(after!.x).toBeGreaterThan(0);
    expect(after!.x + after!.width).toBeLessThan(width);
    await page.screenshot({
      path: `artifacts/qa-premium/browser/glass-${width}.png`,
    });
  }
});

test("primary scene content fits desktop heights without hiding controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [1440, 900],
    [1440, 800],
    [1366, 768],
    [1280, 800],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    for (const [id, content] of [
      ["music", ".release-tabs"],
      ["vault", ".vault-tail"],
      ["stay-close", ".capture-form"],
    ]) {
      await page
        .locator(`#${id}`)
        .evaluate((element) => element.scrollIntoView({ behavior: "instant" }));
      const bounds = await page.locator(`#${id} ${content}`).boundingBox();
      expect(
        bounds!.y,
        `${id} top at ${width}×${height}`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        bounds!.y + bounds!.height,
        `${id} bottom at ${width}×${height}`,
      ).toBeLessThanOrEqual(height);
      const section = await page.locator(`#${id}`).boundingBox();
      expect(
        section!.height,
        `${id} section at ${width}×${height}`,
      ).toBeLessThanOrEqual(height + 1);
    }
    const group = page.locator(".capture-input-group");
    expect(
      await group.evaluate(
        (element) => getComputedStyle(element).flexDirection,
      ),
    ).toBe("row");
  }
});

test("release navigation traps and restores focus, hides player chrome and preserves shared playback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#music");
  await page.getByRole("button", { name: "Play Acción preview" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Acción preview" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Release page", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause preview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open audio player" }),
  ).toHaveCount(0);
  await expect(page.locator(".back-link")).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/qa-premium/browser/release-desktop.png",
  });
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "Site navigation" });
  await page.screenshot({
    path: "artifacts/qa-premium/browser/release-menu.png",
  });
  await expect(menu.getByRole("button", { name: "Close menu" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    menu.getByRole("button", { name: "SUPPORT THE JOURNEY" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("button", { name: "Close menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("link", { name: "Music", exact: true }).click();
  await expect(page).toHaveURL(/\/#music$/);
  await page.getByRole("button", { name: "Open audio player" }).click();
  await expect(page.locator(".player-track strong")).toHaveText("Acción");
  await expect(
    page.getByRole("button", { name: "Pause preview", exact: true }),
  ).toBeVisible();
});

test("release capture keeps listening open, preserves first touch and retries without marketing opt in", async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/capture-fan", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      json:
        requests.length === 1
          ? {
              success: false,
              error: {
                code: "network",
                message: "Try again safely.",
                retryable: true,
              },
            }
          : {
              success: true,
              data: {
                captureToken: "test",
                eventId: "capture:release",
                delivery: "not_configured",
              },
            },
    });
  });
  await page.goto("/?utm_source=instagram&utm_campaign=first-touch");
  await page.locator(".hero").waitFor();
  await page.goto("/music/cafe?utm_source=youtube&utm_campaign=latest");
  const listening = page.getByRole("link", { name: "Apple Music" });
  await expect(listening).toBeVisible();
  await expect(listening).toHaveAttribute("href", /music.apple.com/);
  await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByLabel("YOUR EMAIL", { exact: true }).fill("FAN@example.com");
  await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
  await expect(page.getByText("Try again safely.")).toBeVisible();
  await expect(page.getByLabel("YOUR EMAIL", { exact: true })).toHaveValue(
    "FAN@example.com",
  );
  await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
  const confirmation = page.getByRole("region", {
    name: "You're in La Cultura.",
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("heading")).toBeFocused();
  await expect(confirmation).toContainText("You didn’t request music updates");
  await expect(confirmation).not.toContainText(
    /exclusive|email (sent|delivered)|check your inbox/i,
  );
  await expect(listening).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0].requestId).toBe(requests[1].requestId);
  expect(requests[1]).toMatchObject({
    email: "fan@example.com",
    source: "stay_close",
    emailMarketing: false,
    analyticsConsent: false,
    firstTouch: { utm_source: "instagram", utm_campaign: "first-touch" },
    lastTouch: {
      utm_source: "youtube",
      utm_campaign: "latest",
      release: "cafe",
    },
  });
});

test("release capture preserves language, consent confirmation and backend signed rewards", async ({
  page,
}) => {
  const reward = "https://storage.example.com/signed-existing-wallpaper";
  await page.route("**/functions/v1/capture-fan", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      language: "es",
      emailMarketing: true,
      lastTouch: { release: "darte-nota" },
    });
    await route.fulfill({
      json: {
        success: true,
        data: {
          captureToken: "test",
          eventId: "capture:release-es",
          delivery: "queued",
          magnetUrl: reward,
        },
      },
    });
  });
  await page.goto("/music/darte-nota");
  await page.getByLabel("Language", { exact: true }).selectOption("es");
  await page.getByLabel("TU CORREO").fill("fan@example.com");
  await page.locator(".capture-form").getByRole("checkbox").check();
  await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
  const confirmation = page.getByRole("region", {
    name: "Ya eres parte de La Cultura.",
  });
  await expect(confirmation).toContainText(
    "Se requiere una confirmación por correo",
  );
  await expect(
    confirmation.getByRole("link", { name: "Descargar wallpaper de Acción" }),
  ).toHaveAttribute("href", reward);
  await expect(confirmation).not.toContainText(/enviado|entregado/i);
});

test("mobile release pages put listening in view and keep forms reachable on short and landscape screens", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [320, 568],
    [375, 812],
    [390, 844],
    [430, 932],
    [844, 390],
    [640, 450],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/music/accion");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".release-artwork img")).toBeVisible();
    const listen = await page
      .getByRole("link", { name: "Apple Music" })
      .boundingBox();
    if (width < 480)
      expect(listen!.y + listen!.height).toBeLessThanOrEqual(height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const email = page.getByLabel("YOUR EMAIL", { exact: true });
    await email.scrollIntoViewIfNeeded();
    await email.fill("fan@example.com");
    await expect(email).toBeFocused();
    const emailBounds = await email.boundingBox();
    expect(emailBounds!.width).toBeGreaterThanOrEqual(200);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Stay close" })
      .click();
    await expect(page).toHaveURL(/#stay-close$/);
    await expect(page.locator("#stay-title")).toBeInViewport();
  }
});

test("proximity snapping respects reduced motion, short windows, forms and the utility footer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).scrollSnapType,
      ),
    )
    // CSSOM may omit the default "proximity" keyword; mandatory remains excluded.
    .toMatch(/^y(?: proximity)?$/);
  await page
    .getByRole("button", { name: "Already purchased? Recover access" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Recover your Vault access" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollSnapType,
    ),
  ).toBe("none");
  await page.keyboard.press("Escape");
  await page.getByLabel("YOUR EMAIL", { exact: true }).focus();
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollSnapType,
    ),
  ).toBe("none");
  await page.getByLabel("YOUR EMAIL", { exact: true }).blur();
  await page.setViewportSize({ width: 1366, height: 768 });
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollSnapType,
    ),
  ).toBe("none");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollSnapType,
    ),
  ).toBe("none");
});
