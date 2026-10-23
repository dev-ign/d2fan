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
    firstTouch: { utm_source: "instagram", utm_campaign: "first" },
    lastTouch: {
      utm_source: "youtube",
      utm_campaign: "latest",
      release: "cafe",
    },
  });
});

test("release context follows navigation while explicit new campaigns replace last touch", async () => {
  const { attribution } = await import("./attribution");
  history.replaceState(
    null,
    "",
    "/music/cafe?utm_source=instagram&utm_campaign=first",
  );
  const first = attribution().firstTouch;
  history.replaceState(null, "", "/music/darte-nota");
  expect(attribution()).toEqual({
    firstTouch: first,
    lastTouch: { ...first, release: "darte-nota" },
  });
  history.replaceState(null, "", "/music/accion?utm_source=tiktok");
  expect(attribution()).toEqual({
    firstTouch: first,
    lastTouch: { utm_source: "tiktok", release: "accion" },
  });
});
