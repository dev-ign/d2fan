import { expect, test } from "vitest";
import { artist, releases } from "./content";
import { localContentRepository } from "../repositories/localContentRepository";
import type { MusicRelease } from "../domain/types";
import { getStreamingLinks } from "../config/streaming";
import { existsSync } from "node:fs";

const destinationPatterns: Record<
  keyof MusicRelease["streamingLinks"],
  RegExp
> = {
  spotify: /^https:\/\/open\.spotify\.com\/(album|track)\/[\da-zA-Z]{22}$/,
  appleMusic: /^https:\/\/music\.apple\.com\/us\/album\/[^/?]+\/\d+\?i=\d+$/,
  youtube: /^https:\/\/music\.youtube\.com\/watch\?v=[\w-]{11}$/,
  amazonMusic:
    /^https:\/\/music\.amazon\.com\/albums\/[\dA-Z]{10}\?trackAsin=[\dA-Z]{10}$/,
  tidal: /^https:\/\/tidal\.com\/track\/\d+$/,
};

test("the featured release is Shorty with the supplied cover and its own preview", () => {
  expect(releases[0]).toMatchObject({
    id: artist.featuredReleaseId,
    slug: "shorty",
    releaseDate: "2026-10-30",
    artistCredit: "Jona Ferreira & Sbfaraon",
    coverArt: "/assets/cover-shorty.webp",
    previewUrl: "/assets/preview-shorty.m4a",
  });
});

test("the catalog serves unique release-specific HTTPS links across both lookups", async () => {
  const catalog = await localContentRepository.listReleases(artist.id);
  expect(catalog).toEqual(releases);
  expect(catalog.map(({ slug }) => slug)).toEqual([
    "shorty",
    "accion",
    "darte-nota",
    "contenta",
    "cafe",
    "caramelo",
    "viaje-astral",
    "lalo",
    "sunday",
    "fria",
    "me-avisas",
    "12-uvas",
  ]);
  expect(new Set(catalog.map(({ id }) => id)).size).toBe(catalog.length);
  expect(new Set(catalog.map(({ slug }) => slug)).size).toBe(catalog.length);

  const links = new Set<string>();
  for (const release of catalog) {
    expect(release.previewUrl).toBe(`/assets/preview-${release.slug}.m4a`);
    expect(existsSync(`public${release.previewUrl}`)).toBe(true);
    expect(existsSync(`public${release.coverArt}`)).toBe(true);
    expect(
      await localContentRepository.getReleaseBySlug(artist.id, release.slug),
    ).toBe(release);
    const destinations = getStreamingLinks(release);
    expect(destinations).toHaveLength(
      Object.keys(release.streamingLinks).length,
    );
    for (const { platform, href } of destinations) {
      expect(href).toMatch(destinationPatterns[platform]);
      expect(links.has(href)).toBe(false);
      links.add(href);
    }
    expect(destinations.length).toBeGreaterThanOrEqual(4);
  }
});

test("streaming links reject wrong origins and credentials", () => {
  expect(
    getStreamingLinks({
      ...releases[0],
      streamingLinks: {
        spotify: "https://open.spotify.com.example.org/album/example",
        appleMusic: "https://login@music.apple.com/us/album/example",
        youtube: "javascript:alert(1)",
        amazonMusic: "http://music.amazon.com/albums/example",
        tidal: "https://tidal.com/track/567981978",
      },
    }).map(({ platform }) => platform),
  ).toEqual(["tidal"]);
});
