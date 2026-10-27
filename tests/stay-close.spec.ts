import { expect, test } from "./fixtures";
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
    name: "You're in La Cultura.",
  });
  await expect(confirmation).toBeVisible();
  await expect(page.locator(".stay-form")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "You're in La Cultura." }),
  ).toBeFocused();
  await expect(confirmation).toContainText("still being prepared");
  await expect(confirmation).toContainText("You didn’t request music updates");
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
    name: "You're in La Cultura.",
  });
  await expect(confirmation).toContainText(
    "separate email confirmation is required",
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
      name: "You're in La Cultura.",
    });
    await expect(confirmation).toContainText("Your contact is saved.");
    await expect(confirmation).toContainText(
      "It isn’t available to download yet.",
    );
    await expect(confirmation).not.toContainText(
      /check your (email|inbox)|email (sent|delivered)/i,
    );
    await expect(confirmation.getByRole("link")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "You're in La Cultura." }),
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
