import { test, expect } from "./fixtures";
import { mkdir } from "node:fs/promises";
import { expectResponsiveLayout } from "./helpers/responsive-layout";
const capture = {
  captureToken: "scoped-capture",
  eventId: "capture:test",
  delivery: "queued",
  magnetUrl: "https://storage.example.com/signed-free-reward",
};
const checkout = {
  attemptId: "test-attempt",
  statusToken: "scoped-status",
  url: "https://checkout.stripe.com/c/pay/test",
  eventId: "checkout:test",
};
test("contact precedes payment, first-touch retained, retry does not recapture, back keeps input", async ({
  page,
}) => {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let attempts = 0;
  await page.route("**/functions/v1/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    const body = route.request().postDataJSON();
    calls.push({ name, body });
    if (name === "create-checkout" && attempts++ === 0)
      return route.fulfill({
        status: 503,
        json: {
          success: false,
          error: {
            code: "network",
            message: "Please try again.",
            retryable: true,
          },
        },
      });
    return route.fulfill({
      json: {
        success: true,
        data: name === "capture-fan" ? capture : checkout,
      },
    });
  });
  await page.goto(
    "/?utm_source=instagram&utm_medium=reel&utm_campaign=accion&utm_content=creative_a",
  );
  const trigger = page.getByRole("button", { name: "SUPPORT THE JOURNEY" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "$15", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByLabel("Custom amount (USD)").fill("4.99");
  await expect(dialog.getByRole("button", { name: "CONTINUE" })).toBeDisabled();
  await dialog.getByLabel("Custom amount (USD)").fill("15.25");
  await dialog.getByRole("button", { name: "CONTINUE" }).click();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog
    .getByLabel("Your email", { exact: true })
    .fill("fan@example.com");
  await dialog.getByRole("button", { name: "BACK", exact: true }).click();
  await expect(dialog.getByLabel("Custom amount (USD)")).toHaveValue("15.25");
  await dialog.getByRole("button", { name: "CONTINUE" }).click();
  await expect(dialog.getByLabel("Your email", { exact: true })).toHaveValue(
    "fan@example.com",
  );
  await dialog.getByRole("button", { name: "CONTINUE" }).click();
  await expect(dialog.getByText("Please try again.")).toBeVisible();
  await dialog.getByRole("button", { name: "CONTINUE" }).click();
  await expect(
    dialog.getByRole("link", { name: "CONTINUE TO STRIPE" }),
  ).toHaveAttribute("href", checkout.url);
  expect(calls.filter((c) => c.name === "capture-fan")).toHaveLength(1);
  expect(calls.map((c) => c.name)).toEqual([
    "capture-fan",
    "create-checkout",
    "create-checkout",
  ]);
  expect(calls[0].body).toMatchObject({
    emailMarketing: false,
    firstTouch: { utm_source: "instagram", utm_content: "creative_a" },
  });
  expect(calls[1].body.amountMinor).toBe(1525);
  expect(calls[1].body.requestId).toBe(calls[2].body.requestId);
  await mkdir("artifacts/qa-phase1", { recursive: true });
  await page.screenshot({ path: "artifacts/qa-phase1/support-payment.png" });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
test("capture loading and accepted mocked response, language, opt in and disabled WhatsApp", async ({
  page,
}) => {
  await page.route("**/functions/v1/capture-fan", async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    expect(route.request().postDataJSON()).toMatchObject({
      language: "es",
      emailMarketing: true,
      source: "stay_close",
    });
    await route.fulfill({ json: { success: true, data: capture } });
  });
  await page.goto("/");
  await page.locator("#stay-close").scrollIntoViewIfNeeded();
  const form = page.locator(".stay-form");
  await expect(form.getByRole("radio", { name: /WhatsApp/ })).toBeDisabled();
  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("menuitemradio", { name: /ES/ }).click();
  await form.getByLabel("TU CORREO").fill("fan@example.com");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "ÚNETE A LA CULTURA" }).click();
  await expect(form.getByRole("button", { name: "GUARDANDO…" })).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Descargar wallpaper de Acción" }),
  ).toHaveAttribute("href", capture.magnetUrl);
  await mkdir("artifacts/qa-stay-close", { recursive: true });
  await page.screenshot({
    path: "artifacts/qa-stay-close/capture-success-es.png",
  });
});
test("verified return grants access, survives reload and never trusts session ID alone", async ({
  page,
}) => {
  await page.route("**/functions/v1/**", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: route.request().url().endsWith("checkout-status")
          ? {
              status: "completed",
              amountMinor: 500,
              currency: "usd",
              purpose: "vault_unlock",
              delivery: "pending",
              accessToken: "scoped-access",
              eventId: "purchase:test",
            }
          : {
              links: [
                {
                  title: "Acción wallpaper pack",
                  url: "https://storage.example.com/private-signed-download",
                },
              ],
            },
      },
    }),
  );
  await page.goto("/?checkout=return#status=scoped-status");
  await expect(
    page.getByText("Payment confirmed. Thank you for supporting Jona."),
  ).toBeVisible();
  await expect(page).toHaveURL("/");
  await page.reload();
  await expect(
    page.getByText("Payment confirmed. Thank you for supporting Jona."),
  ).toBeVisible();
  await page.getByRole("button", { name: "OPEN MY DOWNLOAD" }).click();
  await expect(
    page.getByRole("link", { name: "Download Acción wallpaper pack" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/qa-phase1/vault-unlocked-mock.png",
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/?session_id=cs_test");
  await expect(page.getByRole("dialog")).toBeHidden();
});
test("network failure keeps input and expired/invalid recovery is honest", async ({
  page,
}) => {
  await page.route("**/functions/v1/**", (route) =>
    route.fulfill({
      status: 401,
      json: {
        success: false,
        error: {
          code: "unauthorized",
          message:
            "This link has expired or is invalid. Request a new access email.",
          retryable: false,
        },
      },
    }),
  );
  await page.goto("/#access=bad");
  await page.getByRole("button", { name: "OPEN MY DOWNLOAD" }).click();
  await expect(page.getByText(/This link has expired/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Already purchased? Recover access" })
    .click();
  await page.getByLabel("Purchase email").fill("fan@example.com");
  await page.getByRole("button", { name: "REQUEST ACCESS LINKS" }).click();
  await expect(page.getByLabel("Purchase email")).toHaveValue(
    "fan@example.com",
  );
});
test("consent links require explicit action and show localized invalid-link outcomes", async ({
  page,
}) => {
  const requests: { action: string; token: string }[] = [];
  await page.addInitScript(() => {
    const locale = new URL(location.href).searchParams.get("consent-locale");
    if (locale === "en" || locale === "es")
      localStorage.setItem("jona:locale", locale);
  });
  await page.route("**/functions/v1/manage-consent", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return route.fulfill(
      body.token === "fresh-confirmation"
        ? {
            json: { success: true, data: { message: "Confirmed" } },
          }
        : {
            status: 401,
            json: {
              success: false,
              error: {
                code: "unauthorized",
                message:
                  "This link has expired or is invalid. Request a new access email.",
                retryable: false,
              },
            },
          },
    );
  });
  for (const locale of ["en", "es"] as const) {
    const copy =
      locale === "en"
        ? {
            confirm: "CONFIRM MUSIC UPDATES",
            unsubscribe: "UNSUBSCRIBE",
            confirmationInvalid:
              "This confirmation link is no longer valid. To request music updates, sign up again and choose email updates.",
            unsubscribeInvalid:
              "This unsubscribe link has expired or is invalid. Your preferences have not changed.",
            confirmed: "Your music updates are confirmed.",
          }
        : {
            confirm: "CONFIRMAR NOVEDADES MUSICALES",
            unsubscribe: "CANCELAR SUSCRIPCIÓN",
            confirmationInvalid:
              "Este enlace de confirmación ya no es válido. Para pedir novedades musicales, vuelve a registrarte y elige recibir novedades por correo.",
            unsubscribeInvalid:
              "Este enlace para cancelar la suscripción caducó o no es válido. Tus preferencias no han cambiado.",
            confirmed: "Confirmaste las novedades musicales.",
          };
    for (const action of ["confirm", "unsubscribe"] as const) {
      const before = requests.length;
      await page.goto(
        `/?consent-locale=${locale}&case=${action}#${action}=legacy-link`,
      );
      const button = page.getByRole("button", {
        name: copy[action],
        exact: true,
      });
      await expect(button).toBeVisible();
      expect(requests).toHaveLength(before);
      await button.click();
      await expect(page.getByRole("dialog").getByRole("status")).toHaveText(
        action === "confirm"
          ? copy.confirmationInvalid
          : copy.unsubscribeInvalid,
      );
      expect(requests.at(-1)).toEqual({ action, token: "legacy-link" });
      await expect(page.getByRole("dialog")).not.toContainText(copy.confirmed);
    }
    await page.goto(
      `/?consent-locale=${locale}&case=fresh#confirm=fresh-confirmation`,
    );
    await page.getByRole("button", { name: copy.confirm, exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("status")).toHaveText(
      copy.confirmed,
    );
  }
});
test("email delivery states stay distinct while paid download access remains available", async ({
  page,
}) => {
  let delivery = "disabled";
  await page.route("**/functions/v1/**", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          status: "completed",
          amountMinor: 500,
          currency: "usd",
          purpose: "vault_unlock",
          delivery,
          accessToken: "scoped-access",
        },
      },
    }),
  );
  for (const [state, message] of [
    ["disabled", "Email delivery is currently disabled."],
    ["queued", "Your receipt/access email is queued."],
    ["sent", "The provider accepted your access email."],
    ["failed", "Your receipt/access email failed."],
    ["quarantined", "Your receipt/access email is on hold"],
    ["skipped", "Your receipt/access email was not sent."],
    ["unknown", "Email delivery status is unavailable."],
    ["pending", "Email delivery status is unavailable."],
  ]) {
    delivery = state;
    await page.goto(`/?delivery-test=${state}#status=scoped-status`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(message);
    await expect(
      dialog.getByRole("button", { name: "OPEN MY DOWNLOAD" }),
    ).toBeEnabled();
    if (state !== "sent")
      await expect(dialog).not.toContainText("The provider accepted");
    if (state !== "queued")
      await expect(dialog).not.toContainText("email is queued");
  }
});

test("disabled capture and recovery are truthful in English and Spanish without hiding the free reward", async ({
  page,
}) => {
  await page.route("**/functions/v1/**", (route) => {
    const name = route.request().url().split("/").pop();
    expect(["capture-fan", "recover-access"]).toContain(name);
    return route.fulfill({
      json: {
        success: true,
        data:
          name === "capture-fan"
            ? { ...capture, delivery: "disabled" }
            : {
                delivery: "disabled",
                message: "Email recovery is currently disabled.",
              },
      },
    });
  });
  for (const locale of ["en", "es"] as const) {
    await page.goto("/");
    await page.evaluate(
      (value) => localStorage.setItem("jona:locale", value),
      locale,
    );
    await page.reload();
    const copy =
      locale === "en"
        ? {
            disabled: "Email delivery is currently disabled",
            reward: "Download Acción wallpaper",
            recovery: "Email recovery is currently disabled",
          }
        : {
            disabled: "El envío de correo está desactivado",
            reward: "Descargar wallpaper de Acción",
            recovery: "La recuperación por correo está desactivada",
          };
    const form = page.locator(".stay-form");
    await form.getByRole("textbox").fill("fan@example.com");
    await form.getByRole("checkbox").check();
    await form.getByRole("button").click();
    await expect(page.locator(".stay-confirmation-consent")).toContainText(
      copy.disabled,
    );
    await expect(page.getByRole("link", { name: copy.reward })).toHaveAttribute(
      "href",
      capture.magnetUrl,
    );
    await page.locator(".recover-access").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("fan@example.com");
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog).toContainText(copy.recovery);
  }
});
test("responsive header bounds, modal keyboard trap and no horizontal overflow", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  for (const width of [
    320, 390, 480, 640, 768, 820, 900, 950, 1024, 1200, 1440,
  ]) {
    await page.setViewportSize({ width, height: 920 });
    await expectResponsiveLayout(page);
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "SUPPORT THE JOURNEY" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "CONTINUE" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.screenshot({ path: "artifacts/qa-phase1/support-320.png" });
});

test("expired support resumes with the saved amount as a new attempt", async ({
  page,
}) => {
  await page.route("**/functions/v1/checkout-status", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          status: "expired",
          amountMinor: 3000,
          currency: "usd",
          purpose: "tip",
          delivery: "pending",
        },
      },
    }),
  );
  await page.goto("/#status=expired-scoped-status");
  await page.getByRole("button", { name: "START A NEW CHECKOUT" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Support the journey" })
      .getByRole("button", { name: "$30", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
