import { beforeEach, expect, test, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
  vi.resetModules();
});

test("release capture retains the current campaign after the URL query is consumed", async () => {
  const { attribution } = await import("./attribution");
  history.replaceState(null, "", "/?utm_source=instagram&utm_campaign=first");
  attribution();
  history.replaceState(
    null,
    "",
    "/music/cafe?utm_source=youtube&utm_campaign=latest",
  );
  const landing = attribution();
  history.replaceState(null, "", "/music/cafe");
  expect(attribution()).toEqual(landing);
  expect(landing).toMatchObject({
    firstTouch: {
      utm_source: "instagram",
      utm_campaign: "first",
      landing_path: "/",
    },
    lastTouch: {
      utm_source: "youtube",
      utm_campaign: "latest",
      release: "cafe",
      landing_path: "/music/cafe",
    },
  });
});

test("release context follows navigation while explicit new campaigns replace last touch", async () => {
  const { attribution } = await import("./attribution");
  history.replaceState(
    null,
    "",
    "/music/sayyouluvme?utm_source=instagram&utm_campaign=sayyouluvme_2026",
  );
  const first = attribution().firstTouch;
  expect(first).toMatchObject({
    campaign_id: "sayyouluvme_2026",
    landing_path: "/music/sayyouluvme",
  });
  history.replaceState(null, "", "/music/darte-nota");
  expect(attribution()).toEqual({
    firstTouch: first,
    lastTouch: { ...first, release: "darte-nota" },
  });
  history.replaceState(null, "", "/music/accion?utm_source=tiktok");
  expect(attribution()).toEqual({
    firstTouch: first,
    lastTouch: {
      utm_source: "tiktok",
      release: "accion",
      landing_path: "/music/accion",
    },
  });
});

test("known untagged releases capture a catalog campaign without accepting URL metadata overrides", async () => {
  const { attribution } = await import("./attribution");
  history.replaceState(null, "", "/");
  expect(attribution()).toEqual({ firstTouch: {}, lastTouch: {} });
  history.replaceState(
    null,
    "",
    "/music/sayyouluvme/?campaign_id=spoof&landing_path=/music/cafe&release=cafe&utm_term=617-555-0100",
  );
  const touch = {
    release: "sayyouluvme",
    campaign_id: "sayyouluvme_2026",
    landing_path: "/music/sayyouluvme",
  };
  expect(attribution()).toEqual({ firstTouch: touch, lastTouch: touch });
  history.replaceState(null, "", "/music/cafe");
  expect(attribution()).toEqual({
    firstTouch: touch,
    lastTouch: { release: "cafe", landing_path: "/music/cafe" },
  });
});
