import { expect, test } from "./fixtures";
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
  await page.getByRole("button", { name: "Next release" }).click();
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
