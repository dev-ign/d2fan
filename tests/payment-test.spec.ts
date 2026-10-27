import { test, expect } from "./fixtures";
import { mkdir } from "node:fs/promises";
const access = {
  itemSlug: "accion-wallpaper",
  priceMinor: 500,
  currency: "usd",
};

test("public and rejected operator keep coming soon; valid operator uses original purchase form", async ({
  page,
}) => {
  let authorized = false;
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  await page.route("**/functions/v1/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    const body = route.request().postDataJSON();
    calls.push({ name, body });
    if (name === "payment-test-access")
      return route.fulfill({
        json: authorized
          ? { success: true, data: access }
          : {
              success: false,
              error: {
                code: "unauthorized",
                message: "Invalid operator token",
                retryable: false,
              },
            },
      });
    return route.fulfill({
      json: {
        success: true,
        data:
          name === "capture-fan"
            ? {
                captureToken: "capture",
                eventId: "capture:test",
                delivery: "not_configured",
              }
            : {
                url: "https://checkout.stripe.com/test",
                statusToken: "status",
                attemptId: "attempt",
                eventId: "checkout:test",
              },
      },
    });
  });
  const open = async () => {
    await page.locator("#vault").scrollIntoViewIfNeeded();
    await page
      .getByRole("button", { name: /Acción — hi-res artwork & wallpapers,/ })
      .click();
    return page.getByRole("dialog");
  };
  await page.goto("/");
  let dialog = await open();
  await expect(dialog.getByText(/Paid access is not open yet/)).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.keyboard.press("Escape");
  await page.goto("/#vault-test=forged");
  dialog = await open();
  await expect(dialog.getByText(/Paid access is not open yet/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "CONTINUE" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  authorized = true;
  await page.goto("/#vault-test=scoped-operator");
  // Real navigation replaces the URL fragment before opening the modal.
  await page.reload();
  await expect(page).toHaveURL("/");
  await page.goto("/#vault");
  dialog = await open();
  await expect(
    dialog.getByText("Stripe test mode · authorized operator · no real charge"),
  ).toBeVisible();
  await expect(dialog.getByText("$5.00 USD", { exact: true })).toBeVisible();
  await expect(page).toHaveURL("/#vault");
  await expect(dialog.locator("select")).toHaveCount(0);
  await dialog.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await dialog.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await expect(dialog.getByText("Enter a valid email address.")).toBeVisible();
  await dialog
    .getByLabel("Your email", { exact: true })
    .fill("qa+accion-test@example.com");
  await dialog.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await expect(
    dialog.getByRole("link", { name: "CONTINUE TO STRIPE" }),
  ).toHaveAttribute("href", "https://checkout.stripe.com/test");
  expect(calls.find((c) => c.name === "capture-fan")?.body).toMatchObject({
    source: "support_modal",
    emailMarketing: false,
    analyticsConsent: false,
    operatorTestToken: "scoped-operator",
    firstTouch: { utm_source: "accion-operator-test" },
  });
  expect(calls.find((c) => c.name === "create-checkout")?.body).toMatchObject({
    itemSlug: "accion-wallpaper",
    amountMinor: 500,
    operatorTestToken: "scoped-operator",
  });
  await mkdir("artifacts/qa-payment-test", { recursive: true });
  await page.screenshot({
    path: "artifacts/qa-payment-test/authorized-purchase.png",
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /CAFÉ — IN THE STUDIO,/ }).click();
  await expect(
    page.getByRole("dialog").getByText(/Paid access is not open yet/),
  ).toBeVisible();
});

test("return waits for server confirmation and refreshes authorization before signed download", async ({
  page,
}) => {
  let completed = false,
    statuses = 0;
  await page.route("**/functions/v1/**", (route) => {
    const name = route.request().url().split("/").pop();
    if (name === "checkout-status") {
      statuses++;
      return route.fulfill({
        json: {
          success: true,
          data: {
            status: completed ? "completed" : "pending_payment",
            amountMinor: 500,
            currency: "usd",
            purpose: "vault_unlock",
            itemSlug: "accion-wallpaper",
            delivery: "pending",
            ...(completed
              ? { accessToken: "access", eventId: "purchase:test" }
              : {}),
          },
        },
      });
    }
    expect(name).toBe("redeem-vault");
    expect(route.request().postDataJSON().token).toBe("access");
    return route.fulfill({
      json: {
        success: true,
        data: {
          links: [
            {
              title: "Acción wallpaper pack",
              url: "https://storage.example.com/authorized-zip",
            },
          ],
        },
      },
    });
  });
  await page.goto("/?checkout=return#status=scoped-status");
  await expect(page.getByText(/Waiting for verified payment/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "OPEN MY DOWNLOAD" }),
  ).toHaveCount(0);
  completed = true;
  await page.getByRole("button", { name: "CHECK PAYMENT AGAIN" }).click();
  await expect(page.getByText(/Payment confirmed/)).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Acción — hi-res artwork & wallpapers"),
  ).toBeVisible();
  await page.getByRole("button", { name: "OPEN MY DOWNLOAD" }).click();
  await expect(
    page.getByRole("link", { name: "Download Acción wallpaper pack" }),
  ).toHaveAttribute("href", "https://storage.example.com/authorized-zip");
  expect(statuses).toBeGreaterThanOrEqual(3);
});

test("cancellation and failed payment never expose a download", async ({
  page,
}) => {
  let status = "pending_payment";
  await page.route("**/functions/v1/checkout-status", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          status,
          amountMinor: 500,
          currency: "usd",
          purpose: "vault_unlock",
          checkoutUrl:
            status === "pending_payment"
              ? "https://checkout.stripe.com/test"
              : undefined,
        },
      },
    }),
  );
  await page.goto("/?checkout=cancel#status=cancel-status");
  await expect(page.getByText(/Checkout was canceled/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "RESUME SECURE PAYMENT" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "OPEN MY DOWNLOAD" }),
  ).toHaveCount(0);
  status = "failed";
  await page.reload();
  await expect(page.getByText(/Payment could not be completed/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "OPEN MY DOWNLOAD" }),
  ).toHaveCount(0);
});
