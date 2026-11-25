import { expect, test } from "./fixtures";

test("Artist Studio loads only on its private route and presents scoped owner data", async ({
  page,
}) => {
  const studioAssets: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/features/studio/"))
      studioAssets.push(request.url());
  });
  await page.goto("/music/shorty");
  await expect(
    page.getByRole("heading", { name: "Shorty", exact: true }),
  ).toBeVisible();
  expect(studioAssets).toHaveLength(0);

  const user = {
    id: "f8f5f4e0-8792-4a61-b1a0-72f8f4e48ed2",
    email: "studio-owner@example.test",
    aud: "authenticated",
  };
  await page.route("**/auth/v1/token?grant_type=password", (route) =>
    route.fulfill({
      json: {
        user,
        access_token: "synthetic-access-token",
        refresh_token: "synthetic-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
      },
    }),
  );
  let permission = false;
  await page.route("**/functions/v1/artist-studio", (route) => {
    expect(route.request().headers().authorization).toBe(
      "Bearer synthetic-access-token",
    );
    const body = route.request().postDataJSON();
    if (!permission)
      return route.fulfill({ status: 403, json: { code: "forbidden" } });
    if (body.view === "session")
      return route.fulfill({
        json: {
          supportEnabled: false,
          vaultEnabled: false,
          rewardEmailEnabled: false,
          marketingEmailEnabled: false,
        },
      });
    if (body.view === "fans")
      return route.fulfill({
        json: {
          total: body.search ? 1 : 26,
          items: [
            {
              id: "fixture",
              email:
                body.page === 1
                  ? "second-page@example.test"
                  : "fan@example.test",
              consent: "confirmed",
              language: "es",
              created_at: "2026-11-01T12:00:00Z",
              updated_at: "2026-11-20T12:00:00Z",
              email_verified_at: "2026-11-02T12:00:00Z",
            },
          ],
        },
      });
    return route.fulfill({
      json: {
        as_of: "2026-11-24T12:00:00Z",
        totals: { captured_contacts: 26, confirmed_marketing_subscribers: 13 },
        last_30_days: { new_contacts: 8, first_confirmations: 3 },
        daily_eastern: [
          { day: "2026-11-24", new_contacts: 8, first_confirmations: 3 },
        ],
        campaign: "sayyouluvme_2026",
        campaign_totals: {
          requests: 8,
          contacts: 5,
          contacts_with_confirmed_request: 3,
        },
        campaign_breakdown: [],
        live_revenue_by_currency: [],
        operations: { reward_email_accepted: 0, reward_email_failed: 0 },
      },
    });
  });
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Artist Studio navigation" }),
  ).toHaveCount(0);

  permission = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.getByRole("link", { name: "Fans", exact: true }).click();
  await expect(
    page.getByText("fan@example.test", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("second-page@example.test")).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Email address" })
    .fill("fan@example.test");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
  await page.getByRole("link", { name: "Campaigns", exact: true }).click();
  await page.getByLabel("Creative").fill("studio_session_01");
  await expect(page.getByLabel("Campaign URL")).toHaveValue(
    /utm_content=studio_session_01$/,
  );
  await expect(
    page.getByRole("heading", { name: "Campaign performance" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("link", { name: "Readiness", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
