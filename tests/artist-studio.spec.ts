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
        reward_requests_30_days: 8,
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

test("a private owner link only permits password setup after server authorization", async ({
  page,
}) => {
  const user = {
    id: "f8f5f4e0-8792-4a61-b1a0-72f8f4e48ed2",
    email: "studio-owner@example.test",
    aud: "authenticated",
  };
  const token = "synthetic-access-token";
  const fixtureLink = "f".repeat(64);
  let owner = false;
  await page.route("**/auth/v1/verify", (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      type: owner ? "recovery" : "invite",
      token_hash: fixtureLink,
    });
    return route.fulfill({
      json: {
        user,
        access_token: token,
        refresh_token: "synthetic-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
      },
    });
  });
  await page.route("**/functions/v1/artist-studio", (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    return owner
      ? route.fulfill({ json: { supportEnabled: false } })
      : route.fulfill({ status: 403, json: { code: "forbidden" } });
  });
  let updated = false;
  await page.route("**/auth/v1/user", (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON().password).toBe(
      "suite-only-new-password",
    );
    updated = true;
    return route.fulfill({ json: user });
  });
  await page.route("**/auth/v1/logout?scope=global", (route) =>
    route.fulfill({ status: 204 }),
  );

  await page.goto(`/studio#owner_invite=${fixtureLink}`);
  await expect(
    page.getByRole("heading", { name: "Set up your owner account" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/studio$/);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("could not authorize");
  await expect(page.getByLabel("New password")).toHaveCount(0);
  expect(updated).toBe(false);

  owner = true;
  await page.goto(`/studio#owner_recovery=${fixtureLink}`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reset your owner password" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("New password").fill("suite-only-new-password");
  await page.getByLabel("Confirm password").fill("suite-only-new-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(updated).toBe(true);
});

test("Content Studio reviews copy before saving and links verified Instagram fixtures", async ({
  page,
}) => {
  const user = {
    id: "f8f5f4e0-8792-4a61-b1a0-72f8f4e48ed2",
    email: "artist@example.test",
    aud: "authenticated",
  };
  const record = {
    id: "d1510fee-ccab-44f6-859b-63651decb701",
    revision: 1,
    title: "Recorded Instagram teaser",
    release_slug: "sayyouluvme",
    pillar: "Performance",
    language: "es",
    hook: "",
    caption: "",
    cta: "",
    format: "ig_reel",
    status: "published",
    planned_on: null,
    published_on: "2026-11-25",
    media_url: null,
    post_url: "https://www.instagram.com/reel/fixture/",
  };
  const state = "01234567-0123-4123-8123-012345678901".repeat(2);
  let connected = false;
  let linked = false;
  let providerFailure = false;
  let saved:
    | {
        title: string;
        caption: string;
        format: string;
        status: string;
        release_slug: string;
      }
    | undefined;
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
  await page.route("**/functions/v1/artist-studio", (route) => {
    const body = route.request().postDataJSON();
    const reply = (json: object, status = 200) =>
      route.fulfill({ json, status });
    switch (body.view) {
      case "session":
        return reply({});
      case "content":
        return reply({
          items: body.status === "published" ? [record] : [],
          has_more: false,
          week_count: 0,
          queue: { idea: 0, draft: 0, ready: 0, published: 1, overdue: 0 },
        });
      case "creative_status":
        return reply({ enabled: true });
      case "creative_generate":
        return providerFailure
          ? reply({ code: "creative_unavailable" }, 503)
          : reply({
              copy: {
                hook: "Una toma",
                caption: "Una versión para tus audífonos.",
                cta: "Escucha el adelanto.",
              },
              used: 1,
              limit: 100,
            });
      case "content_save":
        saved = body.fields;
        return reply({ fields: body.fields, revision: 1 });
      case "content_acquisition":
        return reply({ requests: 0, contacts: 0 });
      case "instagram_status":
        return reply(
          connected
            ? {
                status: "connected",
                profile: {
                  id: "1234",
                  username: "fixture_artist",
                  avatar: null,
                },
                syncedAt: null,
              }
            : { status: "setup_required", profile: null, syncedAt: null },
        );
      case "instagram_finish":
        expect(body).toMatchObject({ state, code: "synthetic-oauth-code" });
        connected = true;
        return reply({ connected });
      case "instagram_media":
        return reply({
          items: [
            {
              id: "22",
              permalink: record.post_url,
              caption: "Una toma para tus audífonos",
              format: "REELS",
              timestamp: "2026-11-25T16:00:00Z",
              thumbnail: null,
              ...(linked && { placementId: record.id }),
            },
          ],
          next: null,
        });
      case "instagram_associate":
        expect(body).toMatchObject({
          placementId: record.id,
          mediaId: "22",
          after: null,
        });
        linked = true;
        return reply({ linked });
      case "instagram_disconnect":
        connected = false;
        return reply({ disconnected: true });
      default:
        return reply({});
    }
  });
  await page.goto("/studio/content");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-studio-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  const workspace = page.getByRole("group", { name: "Content workspace" });
  await workspace.getByRole("button", { name: "Creative Assistant" }).click();
  await page
    .getByRole("button", { name: /Introduce the release in a Story/ })
    .click();
  const caption = page.getByLabel("Caption", { exact: true });
  await caption.fill("Keep my original draft.");
  await page.getByText("Creative Assistant", { exact: true }).click();
  await page.getByRole("button", { name: "Generate AI copy" }).click();
  await expect(page.getByLabel("Candidate caption")).toHaveValue(
    "Una versión para tus audífonos.",
  );
  await expect(caption).toHaveValue("Keep my original draft.");
  providerFailure = true;
  await page
    .getByRole("button", { name: "Generate another AI candidate" })
    .click();
  await expect(page.getByText(/Your draft is intact/)).toBeVisible();
  await expect(caption).toHaveValue("Keep my original draft.");
  await page.getByLabel("Candidate caption").fill("Reviewed caption.");
  if (process.env.STUDIO_PHASE2B_SCREENSHOTS)
    await page.screenshot({
      path: `${process.env.STUDIO_PHASE2B_SCREENSHOTS}/creative-review.png`,
      fullPage: true,
    });
  await page.getByRole("button", { name: "Apply to draft" }).click();
  await expect(caption).toHaveValue("Reviewed caption.");
  expect(saved).toBeUndefined();
  await page.getByRole("button", { name: "Save content" }).click();
  await expect(page.getByText("Content saved.", { exact: true })).toBeVisible();
  expect(saved).toMatchObject({
    caption: "Reviewed caption.",
    format: "ig_story",
    status: "draft",
    release_slug: "sayyouluvme",
  });
  await page.getByRole("button", { name: "Back to planner" }).click();
  await workspace.getByRole("button", { name: "Accounts" }).click();
  await expect(page.getByText("Setup required")).toBeVisible();
  await page.goto(`/studio/content?code=synthetic-oauth-code&state=${state}`);
  await expect(page.getByText("@fixture_artist")).toBeVisible();
  await expect(page).toHaveURL(/\/studio\/content$/);
  if (process.env.STUDIO_PHASE2B_SCREENSHOTS)
    await page.screenshot({
      path: `${process.env.STUDIO_PHASE2B_SCREENSHOTS}/accounts.png`,
      fullPage: true,
    });
  await workspace.getByRole("button", { name: "Published" }).click();
  await page.getByRole("button", { name: "Refresh Instagram media" }).click();
  await page
    .getByRole("button", { name: "Link to Recorded Instagram teaser" })
    .click();
  await expect(page.getByText(/Linked to Studio · SayYouLuvMe/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (process.env.STUDIO_PHASE2B_SCREENSHOTS)
    await page.screenshot({
      path: `${process.env.STUDIO_PHASE2B_SCREENSHOTS}/published-mobile.png`,
      fullPage: true,
    });
  await workspace.getByRole("button", { name: "Accounts" }).click();
  await page.getByRole("button", { name: "Disconnect from Studio" }).click();
  await expect(page.getByText(/Disconnected from Studio/)).toBeVisible();
});
