import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const output = "artifacts/qa-bilingual";
async function switchLocale(page: Page, locale: "es" | "en") {
  await page.locator(".language-trigger").click();
  await page
    .getByRole("menuitemradio", { name: new RegExp(locale.toUpperCase()) })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}
test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
});

test("Spanish first, neutral globe, accessible selection, persistence and metadata across routes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator(".site-nav")).toContainText("Música");
  await expect(page.locator(".hero-bio")).toContainText(
    "dominicano-estadounidense",
  );
  const trigger = page.locator(".language-trigger");
  const color = await trigger.evaluate((e) => getComputedStyle(e).color);
  await expect(trigger).toHaveAccessibleName("Cambiar idioma");
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: /ES/ })).toBeFocused();
  await expect(page.getByRole("menuitemradio", { name: /ES/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitemradio", { name: /EN/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await trigger.evaluate((e) => getComputedStyle(e).color)).toBe(color);
  await expect(trigger).not.toContainText(/ES|EN/);
  await expect(page).toHaveTitle("Jona Ferreira — Music for Every Mood");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /music for every mood/,
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.locator(".featured-card").click();
  await expect(page.locator(".preview-action")).toContainText("Play preview");
  await switchLocale(page, "es");
  await expect(page.locator(".preview-action")).toContainText(
    "Reproducir adelanto",
  );
  await expect(page).toHaveURL("/music/accion");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator("#release-title").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("jona:locale", "bad-value"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.evaluate(() => localStorage.removeItem("jona:locale"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

test("gallery preserves two original views and appends all three portraits with dynamic count and input methods", async ({
  page,
}) => {
  const photos: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/photoss/")) photos.push(r.url());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Leer biografía del artista" })
    .click();
  const dialog = page.getByRole("dialog");
  const gallery = dialog.locator(".bio-photo");
  await expect(gallery.getByRole("status")).toHaveText("01 / 05");
  expect(photos).toHaveLength(0);
  await expect(gallery.locator(".bio-photo-current")).toHaveAttribute(
    "src",
    "/assets/raw-hero-1.webp",
  );
  await gallery.getByRole("button", { name: "Siguiente retrato" }).click();
  await expect(gallery.getByRole("status")).toHaveText("02 / 05");
  await expect(gallery.locator(".bio-photo-current")).toHaveAttribute(
    "src",
    "/assets/raw-hero-1.webp",
  );
  for (const [index, name] of ["jona1", "jona2", "jona7"].entries()) {
    await gallery.getByRole("button", { name: "Siguiente retrato" }).click();
    await expect(gallery.getByRole("status")).toHaveText(`0${index + 3} / 05`);
    await expect(gallery.locator(".bio-photo-current")).toHaveAttribute(
      "src",
      `/assets/photoss/${name}.webp`,
    );
    await expect(gallery.locator(".bio-photo-current")).toHaveCSS(
      "opacity",
      "1",
    );
    await page.screenshot({ path: `${output}/gallery-es-${name}.png` });
  }
  await gallery.focus();
  await page.keyboard.press("ArrowRight");
  await expect(gallery.getByRole("status")).toHaveText("01 / 05");
  await page.keyboard.press("ArrowLeft");
  await expect(gallery.getByRole("status")).toHaveText("05 / 05");
  await gallery.dispatchEvent("pointerdown", {
    pointerType: "touch",
    clientX: 250,
    clientY: 150,
  });
  await gallery.dispatchEvent("pointerup", {
    pointerType: "touch",
    clientX: 100,
    clientY: 155,
  });
  await expect(gallery.getByRole("status")).toHaveText("01 / 05");
  expect(photos.every((url) => url.endsWith(".webp"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Leer biografía del artista" }),
  ).toBeFocused();
});

test("language changes preserve playback, release selection, scroll context and fan form drafts", async ({
  page,
}) => {
  let payload: Record<string, unknown> | undefined;
  await page.route("**/functions/v1/capture-fan", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      json: {
        success: true,
        data: {
          captureToken: "test",
          eventId: "locale:capture",
          delivery: "queued",
          magnetUrl: "https://storage.example.com/signed-wallpaper",
        },
      },
    });
  });
  await page.goto("/#music");
  await page
    .getByRole("button", { name: "Reproducir adelanto de Acción", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Pausar adelanto de Acción",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Contenta", exact: true }).click();
  await switchLocale(page, "en");
  await expect(page.locator('.release-tabs [aria-current="true"]')).toHaveText(
    "Contenta",
  );
  await expect(page).toHaveURL("/#music");
  await page.getByRole("button", { name: "Open audio player" }).click();
  await expect(page.locator(".player-track strong")).toHaveText("Acción");
  await expect(
    page.getByRole("button", { name: "Pause preview", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".player-popover")).not.toContainText(
    "GLOBAL PLAYER",
  );
  await page.getByRole("button", { name: "Open audio player" }).click();
  await page.locator("#stay-close").scrollIntoViewIfNeeded();
  const form = page.locator("#stay-close .capture-form");
  await form.getByLabel("YOUR EMAIL").fill("listener@example.com");
  await form.getByRole("checkbox").check();
  await switchLocale(page, "es");
  await expect(form.getByLabel("TU CORREO")).toHaveValue(
    "listener@example.com",
  );
  await expect(form.getByRole("checkbox")).toBeChecked();
  await form.getByRole("button", { name: "ÚNETE A LA CULTURA" }).click();
  await expect(
    page.getByRole("heading", { name: "Ya eres parte de La Cultura." }),
  ).toBeVisible();
  expect(payload).toMatchObject({
    language: "es",
    email: "listener@example.com",
    emailMarketing: true,
  });
  await switchLocale(page, "en");
  await expect(
    page.getByRole("heading", { name: "You're in La Cultura." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download Acción wallpaper" }),
  ).toHaveAttribute("href", "https://storage.example.com/signed-wallpaper");
});

test("both languages fit all nine widths and simplified controls retain accessible layouts", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const measurements = [];
  await page.goto("/");
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
    await page.setViewportSize({ width, height });
    for (const locale of ["es", "en"] as const) {
      await page.evaluate(
        (locale) => localStorage.setItem("jona:locale", locale),
        locale,
      );
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute(
        "data-scroll-ready",
        "true",
      );
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("#hero-title")).toHaveText("JONA FERREIRA");
      await expect(page.locator("#hero-title span")).toHaveCount(0);
      await expect(page.locator("select")).toHaveCount(0);
      expect(await page.locator(".language-trigger:visible").count()).toBe(1);
      const bounds = await page.locator(".header-inner").boundingBox();
      const actions = await page.locator(".header-actions").boundingBox();
      expect(actions!.x + actions!.width).toBeLessThanOrEqual(width);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `${output}/hero-${locale}-${width}.png` });
      if (width <= 960) {
        await page
          .getByRole("button", {
            name: locale === "es" ? "Abrir menú" : "Open menu",
          })
          .click();
        await expect(
          page.getByRole("dialog").getByRole("button", {
            name: locale === "es" ? "APOYA EL CAMINO" : "SUPPORT THE JOURNEY",
          }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
      }
      if (width === 1440 || width === 390) {
        await page.locator(".language-trigger").click();
        await page.screenshot({
          path: `${output}/language-${locale}-${width}.png`,
        });
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", {
            name:
              locale === "es"
                ? "Leer biografía del artista"
                : "Read artist biography",
          })
          .click();
        await page
          .getByRole("button", {
            name: locale === "es" ? "Siguiente retrato" : "Next portrait view",
          })
          .click();
        await page
          .getByRole("button", {
            name: locale === "es" ? "Siguiente retrato" : "Next portrait view",
          })
          .click();
        await expect(page.locator('.bio-photo [role="status"]')).toHaveText(
          "03 / 05",
        );
        await expect(page.getByRole("dialog")).not.toContainText("THE ARTIST");
        await page.screenshot({
          path: `${output}/biography-${locale}-${width}.png`,
        });
        await page.keyboard.press("Escape");
        await page.locator("#music").scrollIntoViewIfNeeded();
        await expect(page.locator("#music")).not.toContainText(
          "Preview the full discography",
        );
        await page
          .getByRole("button", {
            name: locale === "es" ? "Escuchar en" : "Listen on",
            exact: true,
          })
          .click();
        await expect(page.locator(".stream-menu")).not.toContainText(
          "OPEN ACCIÓN IN",
        );
        await page.screenshot({
          path: `${output}/music-${locale}-${width}.png`,
        });
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", {
            name:
              locale === "es"
                ? "Reproducir adelanto de Acción"
                : "Play Acción preview",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", {
            name:
              locale === "es"
                ? "Abrir reproductor de audio"
                : "Open audio player",
          })
          .click();
        await page.screenshot({
          path: `${output}/player-${locale}-${width}.png`,
        });
        await page
          .getByRole("button", {
            name:
              locale === "es"
                ? "Abrir reproductor de audio"
                : "Open audio player",
          })
          .click();
      }
      if (width > 960) await page.locator(".support-header").click();
      else {
        await page
          .getByRole("button", {
            name: locale === "es" ? "Abrir menú" : "Open menu",
          })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("button", {
            name: locale === "es" ? "APOYA EL CAMINO" : "SUPPORT THE JOURNEY",
          })
          .click();
      }
      const dialog = page.getByRole("dialog");
      const geometry = await dialog.locator("h2").evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(element).lineHeight),
        overflow: element.scrollWidth > element.clientWidth,
      }));
      expect(geometry.overflow).toBe(false);
      expect(geometry.height).toBeLessThanOrEqual(geometry.line * 1.4);
      await expect(dialog).not.toContainText(/DIRECT ARTIST SUPPORT|1 \/ 3/);
      await expect(dialog.locator("select")).toHaveCount(0);
      await page.screenshot({
        path: `${output}/support-${locale}-${width}.png`,
      });
      measurements.push({ width, height, locale, heading: geometry });
      await page.keyboard.press("Escape");
    }
  }
  await writeFile(
    `${output}/responsive.json`,
    JSON.stringify(measurements, null, 2),
  );
});

test("validation and failed requests translate without clearing drafts or reusing an edited request", async ({
  page,
}) => {
  const calls: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/capture-fan", async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({
      json:
        calls.length === 1
          ? {
              success: false,
              error: {
                code: "network",
                message: "Temporary delivery problem.",
                retryable: true,
              },
            }
          : {
              success: true,
              data: {
                captureToken: "saved",
                eventId: "capture:locale-retry",
                delivery: "queued",
              },
            },
    });
  });
  await page.goto("/#stay-close");
  const form = page.locator("#stay-close .capture-form");
  await form.getByLabel("TU CORREO").fill("invalid");
  await form.getByRole("button", { name: "ÚNETE A LA CULTURA" }).click();
  await expect(form.getByRole("status")).toHaveText(
    "Introduce un correo válido.",
  );
  await switchLocale(page, "en");
  await expect(form.getByRole("status")).toHaveText(
    "Enter a valid email address.",
  );
  await expect(form.getByLabel("YOUR EMAIL")).toHaveValue("invalid");
  await form.getByLabel("YOUR EMAIL").fill("listener@example.com");
  await form.getByRole("button", { name: "JOIN LA CULTURA" }).click();
  await expect(form.getByRole("status")).toHaveText(
    "Temporary delivery problem.",
  );
  await switchLocale(page, "es");
  await expect(form.getByRole("status")).toHaveText(
    "No se pudo completar. Tus datos siguen aquí; inténtalo otra vez.",
  );
  await expect(form.getByLabel("TU CORREO")).toHaveValue(
    "listener@example.com",
  );
  await form.getByRole("button", { name: "ÚNETE A LA CULTURA" }).click();
  await expect(
    page.getByRole("heading", { name: "Ya eres parte de La Cultura." }),
  ).toBeVisible();
  expect(calls.map((c) => c.language)).toEqual(["en", "es"]);
  expect(calls[0].requestId).not.toBe(calls[1].requestId);
});

test("new portraits retain their full gallery frame on compact mobile and portrait tablet", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Leer biografía del artista" })
      .click();
    const gallery = page.locator(".bio-photo");
    await gallery.getByRole("button", { name: "Siguiente retrato" }).click();
    await expect(gallery.getByRole("status")).toHaveText("02 / 05");
    for (const [i, name] of ["jona1", "jona2", "jona7"].entries()) {
      await gallery.getByRole("button", { name: "Siguiente retrato" }).click();
      await expect(gallery.getByRole("status")).toHaveText(`0${i + 3} / 05`);
      await expect(gallery.locator(".bio-photo-current")).toHaveAttribute(
        "src",
        `/assets/photoss/${name}.webp`,
      );
      const frame = await gallery.boundingBox();
      expect(frame!.width).toBeLessThan(width);
      expect(
        await page
          .getByRole("dialog")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: `${output}/gallery-es-${name}-${width}.png`,
      });
    }
    await page.keyboard.press("Escape");
  }
});
