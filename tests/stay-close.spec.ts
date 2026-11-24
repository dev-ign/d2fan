import { expect, test } from "./fixtures";
import type { Locator } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const output = "artifacts/qa-stay-close";
test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
});
const saved = {
  captureToken: "test-capture",
  eventId: "capture:stay",
  delivery: "queued",
};

test("La Cultura offers two signed wallpapers and keeps marketing optional", async ({
  page,
}) => {
  if (process.env.VITE_LA_CULTURA_WALLPAPERS !== "true") {
    await page.route("**/src/config/runtime.ts", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nruntime.laCulturaWallpapers = true;`,
      });
    });
  }
  const expectPreviews = async (
    section: Locator,
    names: { desktop: string; mobile: string },
  ) => {
    const previews = section.locator(".wallpaper-preview");
    await expect(previews.getByRole("img")).toHaveCount(2);
    for (const [device, width, height] of [
      ["desktop", 320, 180],
      ["mobile", 115, 250],
    ] as const) {
      const image = previews.getByRole("img", {
        name: names[device],
        exact: true,
      });
      await expect(image).toHaveAttribute(
        "src",
        `/assets/la-cultura-${device}-preview-blurred.webp`,
      );
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeInViewport({ ratio: 0.99 });
      await expect(image).toHaveJSProperty("naturalWidth", width);
      await expect(image).toHaveJSProperty("naturalHeight", height);
    }
  };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#stay-close");
  const stay = page.locator("#stay-close");
  await expect(stay.locator(".incentive")).toContainText(
    "Exclusive La Cultura wallpapers, free.",
  );
  await expectPreviews(stay, {
    desktop: "Desktop wallpaper preview with La Cultura graffiti and palm tree",
    mobile: "Mobile wallpaper preview with a black palm tree",
  });
  await stay.screenshot({ path: `${output}/la-cultura-home-en.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("jona:locale", "es"));
  const submitted: unknown[] = [];
  let legacyResponse = false;
  const mobile = "https://storage.example.com/signed-mobile";
  const desktop = "https://storage.example.com/signed-desktop";
  await page.route("**/functions/v1/capture-fan", async (route) => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        success: true,
        data: legacyResponse
          ? { ...saved, magnetUrl: "https://storage.example.com/signed-accion" }
          : {
              ...saved,
              delivery: "disabled",
              rewardId: "la_cultura_wallpapers",
              wallpaperLinks: [
                {
                  device: "mobile",
                  title: "La Cultura mobile wallpaper",
                  url: mobile,
                },
                {
                  device: "desktop",
                  title: "La Cultura desktop wallpaper",
                  url: desktop,
                },
              ],
            },
      },
    });
  });
  await page.goto("/music/sayyouluvme?utm_campaign=sayyouluvme_2026");
  const signup = page.locator("#release-signup");
  await expect(
    page.getByRole("heading", { name: "SayYouLuvMe" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Consigue los wallpapers gratis de La Cultura",
    }),
  ).toHaveAttribute("href", "/music/sayyouluvme#release-signup");
  await expect(signup).toContainText(
    "¿Quieres enterarte de lo próximo de Jona? Llévate los wallpapers gratis de La Cultura y elige si quieres recibir novedades por correo.",
  );
  await expectPreviews(signup, {
    desktop:
      "Vista previa para computadora con el grafiti de La Cultura y una palmera",
    mobile: "Vista previa para celular con una palmera negra",
  });
  await expect(
    signup.getByLabel("Tu correo electrónico", { exact: true }),
  ).toBeVisible();
  await expect(signup.getByRole("checkbox")).not.toBeChecked();
  await page.screenshot({
    path: `${output}/la-cultura-release-es.png`,
    fullPage: true,
  });
  const join = async () => {
    await signup
      .getByLabel("Tu correo electrónico", { exact: true })
      .fill("fan@example.com");
    await signup.getByRole("button", { name: "ÚNETE A LA CULTURA" }).click();
  };
  await join();
  const ready = signup.getByRole("region", {
    name: "¡Tus wallpapers están listos!",
  });
  await expect(
    ready.getByRole("link", { name: "Descargar wallpaper para celular" }),
  ).toHaveAttribute("href", mobile);
  await expect(
    ready.getByRole("link", { name: "Descargar wallpaper para computadora" }),
  ).toHaveAttribute("href", desktop);
  await expect(ready).toContainText("Solo solicitaste los wallpapers.");
  await ready.screenshot({ path: `${output}/la-cultura-downloads-es.png` });
  expect(submitted[0]).toMatchObject({
    rewardId: "la_cultura_wallpapers",
    emailMarketing: false,
    analyticsConsent: false,
    lastTouch: { release: "sayyouluvme", utm_campaign: "sayyouluvme_2026" },
  });

  legacyResponse = true;
  await page.reload();
  await join();
  await expect(
    signup
      .locator(".stay-reward-status")
      .getByText(
        "Los wallpapers de La Cultura no están disponibles por el momento. Inténtalo más tarde.",
        { exact: true },
      ),
  ).toBeVisible();
  await expect(
    signup.locator('a[href="https://storage.example.com/signed-accion"]'),
  ).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`Stage A preserves signup, rewards and consent with commerce disabled at ${width}px`, async ({
    page,
  }) => {
    test.skip(
      process.env.VITE_COMMERCE_ENABLED !== "false" ||
        process.env.VITE_SUPPORT_ENABLED === "true",
      "Run Stage A checks with VITE_COMMERCE_ENABLED=false.",
    );
    await page.setViewportSize({ width, height: 920 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const unexpectedCommerce: string[] = [];
    const actions: string[] = [];
    await page.route("**/functions/v1/**", async (route) => {
      const name = route.request().url().split("/").at(-1);
      if (name === "capture-fan") {
        expect(route.request().postDataJSON().emailMarketing).toBe(true);
        return route.fulfill({
          json: {
            success: true,
            data: {
              ...saved,
              delivery: "disabled",
              magnetUrl: "https://storage.example.com/stage-a-reward",
            },
          },
        });
      }
      if (name === "manage-consent") {
        actions.push(route.request().postDataJSON().action);
        return route.fulfill({
          json: { success: true, data: { message: "updated" } },
        });
      }
      unexpectedCommerce.push(name || "unknown");
      return route.abort();
    });
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "JONA FERREIRA", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".support-header")).toHaveCount(0);
    await expect(page.locator(".vault-card").first()).toBeDisabled();
    if (width === 390) {
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.locator("#site-menu")).toBeVisible();
      await expect(
        page
          .locator("#site-menu")
          .getByRole("button", { name: "SUPPORT THE MUSIC" }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
    await page.goto("/#stay-close");
    await page
      .getByLabel("YOUR EMAIL", { exact: true })
      .fill("fan@example.com");
    await page.locator(".stay-form").getByRole("checkbox").check();
    await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
    const confirmation = page.getByRole("region", {
      name: "Music updates requested.",
    });
    await expect(confirmation).toContainText("saved");
    await expect(confirmation).toContainText("disabled");
    await expect(confirmation.getByRole("link")).toHaveAttribute(
      "href",
      "https://storage.example.com/stage-a-reward",
    );
    await page.screenshot({ path: `${output}/stage-a-${width}.png` });
    for (const [mode, button, feedback] of [
      ["confirm", "CONFIRM MUSIC UPDATES", "Your music updates are confirmed."],
      [
        "unsubscribe",
        "UNSUBSCRIBE",
        "You have unsubscribed from music updates.",
      ],
    ]) {
      await page.goto(`/#${mode}=test-only`);
      await page.reload();
      await page.getByRole("button", { name: button, exact: true }).click();
      await expect(page.getByText(feedback, { exact: true })).toBeVisible();
    }
    expect(actions).toEqual(["confirm", "unsubscribe"]);
    expect(unexpectedCommerce).toEqual([]);
  });
}

test("Stage A hides saved checkout resume and restart actions", async ({
  page,
}) => {
  test.skip(
    process.env.VITE_COMMERCE_ENABLED !== "false" ||
      process.env.VITE_SUPPORT_ENABLED === "true",
    "Run Stage A checks with VITE_COMMERCE_ENABLED=false.",
  );
  await page.route("**/functions/v1/checkout-status", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          status: "expired",
          purpose: "tip",
          amountMinor: 1500,
          currency: "usd",
          delivery: "disabled",
          checkoutUrl: "https://checkout.stripe.com/stale-session",
        },
      },
    }),
  );
  await page.goto("/#status=test-only");
  await expect(
    page.getByRole("dialog", { name: "Your purchase and access" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "START A NEW CHECKOUT" }),
  ).toHaveCount(0);
  await expect(
    page.locator('a[href^="https://checkout.stripe.com"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "OPEN MY DOWNLOAD" }),
  ).toHaveCount(0);
});

test("failed capture retains details, unchecked consent and idempotent retry before replacing the form", async ({
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
                message: "Please try again. Your details are saved here.",
                retryable: true,
              },
            }
          : { success: true, data: saved },
    });
  });
  await page.goto("/#stay-close");
  await page.getByLabel("YOUR EMAIL", { exact: true }).fill("fan@example.com");
  await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
  await expect(
    page.getByText("Please try again. Your details are saved here."),
  ).toBeVisible();
  await expect(page.getByLabel("YOUR EMAIL", { exact: true })).toHaveValue(
    "fan@example.com",
  );
  await expect(
    page.locator(".stay-form").getByRole("checkbox"),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
  const confirmation = page.getByRole("region", {
    name: "Wallpaper request saved.",
  });
  await expect(confirmation).toBeVisible();
  await expect(page.locator(".stay-form")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Wallpaper request saved." }),
  ).toBeFocused();
  await expect(confirmation).toContainText("Your wallpaper email is queued");
  await expect(confirmation).toContainText("You requested the wallpaper only");
  await expect(confirmation.getByRole("link")).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[0].requestId).toBe(requests[1].requestId);
  expect(requests.every((body) => body.emailMarketing === false)).toBe(true);
});

test("available reward uses the backend signed URL, without claiming queued email was sent", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const rewardUrl =
    "https://storage.example.com/signed-wallpaper?token=test-only";
  let downloadRequests = 0;
  await page.route("**/functions/v1/capture-fan", (route) => {
    expect(route.request().postDataJSON().emailMarketing).toBe(true);
    return route.fulfill({
      json: { success: true, data: { ...saved, magnetUrl: rewardUrl } },
    });
  });
  await page.route("https://storage.example.com/**", (route) => {
    downloadRequests++;
    return route.fulfill({
      contentType: "text/plain",
      body: "Test reward response",
    });
  });
  await page.goto("/#stay-close");
  await page.getByLabel("YOUR EMAIL", { exact: true }).fill("fan@example.com");
  await page.locator(".stay-form").getByRole("checkbox").check();
  await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
  const confirmation = page.getByRole("region", {
    name: "Music updates requested.",
  });
  await expect(confirmation).toContainText(
    "Your confirmation email is queued. When it arrives, open it and select Confirm request to subscribe.",
  );
  await expect(confirmation).not.toContainText(
    /email (was |has been )?(sent|delivered)|check your (email|inbox)/i,
  );
  const link = confirmation.getByRole("link", {
    name: "Download Acción wallpaper",
  });
  await expect(link).toHaveAttribute("href", rewardUrl);
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/after-reward-1440.png` });
  await link.click();
  await expect(page.getByText("Test reward response")).toBeVisible();
  expect(downloadRequests).toBe(1);
});

test("saved contact with unavailable email and reward gets an honest responsive confirmation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/functions/v1/capture-fan", (route) =>
    route.fulfill({
      json: { success: true, data: { ...saved, delivery: "not_configured" } },
    }),
  );
  await mkdir(output, { recursive: true });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 920 });
    await page.goto("/#stay-close");
    await page.reload();
    await page
      .getByLabel("YOUR EMAIL", { exact: true })
      .fill("fan@example.com");
    const emailBounds = await page
      .getByLabel("YOUR EMAIL", { exact: true })
      .boundingBox();
    expect(emailBounds!.width).toBeGreaterThanOrEqual(200);
    await page.getByRole("button", { name: "JOIN LA CULTURA" }).click();
    const confirmation = page.getByRole("region", {
      name: "Wallpaper request saved.",
    });
    await expect(confirmation).toContainText(
      "The wallpaper is temporarily unavailable.",
    );
    await expect(confirmation).not.toContainText(
      /check your (email|inbox)|email (sent|delivered)/i,
    );
    await expect(confirmation.getByRole("link")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Wallpaper request saved." }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await page.evaluate(() => {
      const title = document
        .querySelector("#stay-confirmation-title")!
        .getBoundingClientRect();
      const header = document
        .querySelector(".site-header")!
        .getBoundingClientRect();
      const result = document
        .querySelector(".stay-confirmation")!
        .getBoundingClientRect();
      const art = document
        .querySelector(".reward-art")!
        .getBoundingClientRect();
      return {
        titleVisible: title.top >= header.bottom && title.bottom <= innerHeight,
        artworkSeparate: art.left >= result.right || art.top >= result.bottom,
      };
    });
    expect(bounds, `width ${width}`).toEqual({
      titleVisible: true,
      artworkSeparate: true,
    });
    await page.screenshot({ path: `${output}/after-success-${width}.png` });
  }
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`direct Stay Close anchors clear the header with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      await page.goto("/#stay-close");
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const section = document
              .getElementById("stay-close")!
              .getBoundingClientRect();
            const heading = document
              .getElementById("stay-title")!
              .getBoundingClientRect();
            const header = document
              .querySelector(".site-header")!
              .getBoundingClientRect();
            return (
              Math.abs(section.top) <= 1 &&
              heading.top >= header.bottom &&
              heading.bottom <= innerHeight &&
              document.querySelector(".stay-intro > p")!.getBoundingClientRect()
                .top >= header.bottom
            );
          }),
        )
        .toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (reducedMotion === "reduce")
        await page.screenshot({ path: `${output}/after-anchor-${width}.png` });
    }
  });
}

test("navigation clicks and cross-route anchors use the same header offset", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 920 });
    for (const start of ["/", "/music/accion"]) {
      await page.goto(start);
      if (width === 390 || start.startsWith("/music/"))
        await page.getByRole("button", { name: "Open menu" }).click();
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Stay close" })
        .click();
      await expect(page).toHaveURL(/#stay-close$/);
      await expect(page.locator("#stay-close")).toBeAttached();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const target = document.getElementById("stay-title");
            const header = document.querySelector(".site-header");
            return Boolean(
              target &&
              header &&
              target.getBoundingClientRect().top >=
                header.getBoundingClientRect().bottom - 1 &&
              target.getBoundingClientRect().bottom <= innerHeight,
            );
          }),
        )
        .toBe(true);
    }
  }
});

for (const width of [375, 390, 768, 1024, 1440]) {
  test(`fan CTAs lead to one keyboard-reachable signup at ${width}px`, async ({
    page,
  }) => {
    const es = width === 375 || width === 768 || width === 1440;
    await page.setViewportSize({ width, height: width < 768 ? 820 : 920 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (es)
      await page.addInitScript(() => localStorage.setItem("jona:locale", "es"));
    await page.goto("/");
    const homeCta = page.getByRole("link", {
      name: es ? "Entra a la Cultura" : "Join the Culture",
    });
    await expect(homeCta).toBeInViewport();
    await homeCta.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#stay-close")).toBeFocused();
    await expect(
      page.locator(".capture-form").getByRole("checkbox"),
    ).not.toBeChecked();

    const slug = width === 375 ? "cafe" : width === 768 ? "accion" : "shorty";
    await page.goto(`/music/${slug}`);
    const preview = page.locator(".preview-action");
    await expect(preview).toBeVisible();
    await preview.click();
    await expect(preview).toHaveText(es ? "Pausar adelanto" : "Pause preview");
    const releaseCta = page.getByRole("link", {
      name: es
        ? "Consigue el wallpaper gratis de Acción"
        : "Get the free Acción wallpaper",
    });
    await releaseCta.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#release-signup")).toBeFocused();
    await expect(page.locator(".capture-form")).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(page.locator("#release-email")).toBeFocused();
    await expect(preview).toHaveText(es ? "Pausar adelanto" : "Pause preview");
    const checkbox = page.locator(".capture-form").getByRole("checkbox");
    await expect(checkbox).not.toBeChecked();
    await expect(checkbox).toHaveAccessibleDescription(/optional|opcional/);
    await expect(
      page.locator(".capture-form").getByRole("link", {
        name: es ? "Política de privacidad" : "Privacy Policy",
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
