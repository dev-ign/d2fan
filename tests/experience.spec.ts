import { expect, test } from "./fixtures";
import { platformNames, streamingPlatforms } from "../src/config/streaming";
import { releases } from "../src/data/content";
test.beforeEach(async ({ page }) => {
  await page.route("**/functions/v1/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: {
          code: "not_configured",
          message: "This connection is not ready yet. Please try again later.",
          retryable: true,
        },
      }),
    }),
  );
});

test("biography, carousel, release route, and shared audio", async ({
  page,
}) => {
  await page.goto("/");
  const readMore = page.getByRole("button", { name: "Read artist biography" });
  await readMore.click();
  await expect(
    page.getByRole("dialog", { name: "About Jona Ferreira" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next portrait view" }).click();
  await expect(page.getByText("02 / 05")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "About Jona Ferreira" }),
  ).toBeHidden();
  await expect(readMore).toBeFocused();

  await page.locator("#music").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Darte Nota", exact: true }).click();
  await expect(page.locator(".release-head h3")).toHaveText("Darte Nota");
  await page.getByRole("button", { name: "Play Darte Nota preview" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Darte Nota preview" }),
  ).toBeVisible();
  await expect(page.locator(".wave-button .waveform--active")).toBeVisible();
  await page.getByRole("button", { name: "Open audio player" }).click();
  await expect(page.locator(".player-track strong")).toHaveText("Darte Nota");
  await page.getByRole("button", { name: "Pause preview" }).click();
  const progress = page.getByRole("slider", { name: "Playback position" });
  await progress.focus();
  await progress.press("ArrowRight");
  expect(Number(await progress.inputValue())).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Open audio player" }).click();
  await page.getByRole("button", { name: "Contenta", exact: true }).click();
  await page.getByRole("button", { name: "Play Contenta preview" }).click();
  await page.getByRole("button", { name: "Open audio player" }).click();
  await expect(page.locator(".player-track strong")).toHaveText("Contenta");
  await page.getByRole("button", { name: "Open audio player" }).click();
  await page.getByRole("button", { name: "Listen on" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Apple Music" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("menuitem", { name: "Apple Music" }),
  ).toBeHidden();
  await page.getByRole("link", { name: "Release page" }).click();
  await expect(page).toHaveURL(/\/music\/contenta$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contenta");
});

test("support and newsletter report unavailable integrations honestly", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "SUPPORT THE JOURNEY" }).click();
  await expect(
    page.getByRole("dialog", { name: "Support the journey" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "$30" }).click();
  await expect(page.getByRole("button", { name: "$30" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "CONTINUE" }).click();
  await page.getByLabel("Your email", { exact: true }).fill("fan@example.com");
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await expect(
    page.getByText("This connection is not ready yet. Please try again later."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("#stay-close").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await page.getByLabel("YOUR EMAIL").fill("fan@example.com");
  await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
  await expect(
    page.getByText("This connection is not ready yet. Please try again later."),
  ).toBeVisible();
});

test("small screens have reachable navigation and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Music" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Music" })
    .click();
  await expect(page).toHaveURL(/#music$/);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "SUPPORT THE JOURNEY" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Support the journey" }),
  ).toBeVisible();
});

test("direct release routes resolve and unknown slugs are handled", async ({
  page,
}) => {
  await page.goto("/music/accion");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Acción");
  await page.goto("/music/not-a-release");
  await expect(page.getByText("RELEASE NOT FOUND")).toBeVisible();
  await page.getByRole("link", { name: "Back to music" }).click();
  await expect(page).toHaveURL("/");
});

test("the featured catalog and every release page share the same streaming destinations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#music");
  await expect(page.locator(".release-head h3")).toHaveText("Shorty");
  await expect(
    page.getByRole("link", { name: "Latest release: Shorty" }),
  ).toHaveAttribute("href", "/music/shorty");
  await expect(page.locator(".round-play")).toHaveCount(0);
  await expect(page.locator(".active-art img")).toHaveJSProperty(
    "naturalWidth",
    2000,
  );

  async function checkDestinations(release: (typeof releases)[number]) {
    const menu = page.getByRole("menu", { name: "Listen on" });
    const platforms = streamingPlatforms.filter(
      (platform) => release.streamingLinks[platform],
    );
    await expect(menu.getByRole("menuitem")).toHaveText(
      platforms.map((platform) => platformNames[platform]),
    );
    await expect(menu.getByRole("menuitem").first()).toBeInViewport();
    for (const platform of platforms) {
      const item = menu.getByRole("menuitem", {
        name: platformNames[platform],
      });
      await expect(item).toHaveAttribute(
        "href",
        release.streamingLinks[platform]!,
      );
      await expect(item).toHaveAttribute("target", "_blank");
      await expect(item).toHaveAttribute("rel", "noopener noreferrer");
    }
  }

  const listen = page.getByRole("button", { name: "Listen on" });
  for (const release of releases) {
    await page
      .getByRole("button", { name: release.title, exact: true })
      .click();
    await listen.click();
    await checkDestinations(release);
    await page.keyboard.press("Escape");
    await expect(listen).toBeFocused();
  }
  for (const release of releases) {
    await page.goto(`/music/${release.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      release.title,
    );
    await listen.click();
    await checkDestinations(release);
  }
});

test("Shorty listening fits a small Spanish viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("jona:locale", "es"));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const listen = page.getByRole("button", { name: "Escuchar en" });
  const menu = page.getByRole("menu", { name: "Escuchar en" });
  for (const path of ["/#music", "/music/shorty"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await listen.press("ArrowDown");
    const spotify = menu.getByRole("menuitem", { name: "Spotify" });
    await expect(spotify).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      menu.getByRole("menuitem", { name: "Apple Music" }),
    ).toBeFocused();
    await page.keyboard.press("End");
    const tidal = menu.getByRole("menuitem", { name: "TIDAL" });
    await expect(tidal).toBeFocused();
    await expect(tidal).toBeInViewport();
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    await page.keyboard.press("Escape");
    await expect(listen).toBeFocused();
    await listen.click();
    await expect(menu).toBeVisible();
    const button = (await listen.boundingBox())!;
    await page.mouse.click(1, button.y + button.height / 2);
    await expect(menu).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    if (process.env.VITE_COMMERCE_ENABLED === "false") {
      await expect(
        page.getByRole("button", { name: "APOYA EL CAMINO" }),
      ).toHaveCount(0);
    }
  }
  await expect(page).toHaveTitle("Shorty — Jona Ferreira & Sbfaraon");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://jonaferreira.com/music/shorty",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://jonaferreira.com/assets/cover-shorty.webp",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /^Escucha Shorty/,
  );
  await expect(page.locator(".preview-action")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Vault states and reduced motion remain accessible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#vault")).toBeVisible();
  const scrollBehavior = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollBehavior,
  );
  expect(scrollBehavior).toBe("auto");
  await page.getByRole("button", { name: /UNTITLED DEMO, UNRELEASED/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Support the journey" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "See the rest of the vault." })
    .click();
  await expect(
    page.getByRole("dialog", { name: "The Vault archive" }),
  ).toBeVisible();
});
