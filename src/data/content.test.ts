import { expect, test } from "vitest";
import { artist, releases } from "./content";
import { localContentRepository } from "../repositories/localContentRepository";
import type { MusicRelease } from "../domain/types";
import { getStreamingLinks } from "../config/streaming";
import {
  getReleaseMetadata,
  resolveReleasePublication,
} from "./releaseMetadata";
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

test("SayYouLuvMe is featured with verified metadata and unavailable for listening before activation", () => {
  const release = releases[0];
  expect(release).toMatchObject({
    id: artist.featuredReleaseId,
    slug: "sayyouluvme",
    title: "SayYouLuvMe",
    releaseDate: "2026-11-27",
    publishAt: "2026-11-27T05:00:00Z",
    artistCredit: "Jona Ferreira & SBFaraon",
    coverArt: "/assets/sayyouloveme-cover2.jpg",
    campaignId: "sayyouluvme_2026",
    upc: "708208533336",
    catalogNumber: "CAT2529872",
    distributionStatus: "approved",
  });
  expect(["upcoming", "released"]).toContain(release.publicationStatus);
  if (release.publicationStatus === "upcoming") {
    expect(release.previewUrl).toBeUndefined();
    expect(release.streamingLinks).toEqual({});
  }
  const upcoming = { ...release, publicationStatus: "upcoming" as const };
  const midnightEastern = Date.parse("2026-11-27T05:00:00Z");
  expect(resolveReleasePublication(upcoming)).toBe(upcoming);
  expect(resolveReleasePublication(upcoming, midnightEastern - 1)).toBe(
    upcoming,
  );
  expect(
    resolveReleasePublication(upcoming, midnightEastern).publicationStatus,
  ).toBe("released");
  const streamingLinks = {
    spotify: "https://open.spotify.com/track/2x1GqWEEuPrYxcUsyBayhl",
  };
  expect(getStreamingLinks({ ...upcoming, streamingLinks })).toEqual([]);
  expect(
    getStreamingLinks({
      ...release,
      streamingLinks,
      publicationStatus: "released",
    }),
  ).toMatchObject([{ platform: "spotify", href: streamingLinks.spotify }]);
  expect(getReleaseMetadata(upcoming, "en").description).toContain(
    "November 27, 2026",
  );
  expect(getReleaseMetadata(upcoming, "es").description).toContain(
    "27 de noviembre de 2026",
  );
  expect(
    getReleaseMetadata({ ...release, publicationStatus: "released" }, "es")
      .description,
  ).toMatch(/^Escucha SayYouLuvMe/);
});

test("the catalog serves unique release-specific HTTPS links across both lookups", async () => {
  const catalog = await localContentRepository.listReleases(artist.id);
  expect(catalog).toEqual(releases);
  expect(catalog.map(({ slug }) => slug)).toEqual([
    "sayyouluvme",
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
    expect(existsSync(`public${release.coverArt}`)).toBe(true);
    expect(
      await localContentRepository.getReleaseBySlug(artist.id, release.slug),
    ).toBe(release);
    if (release.publicationStatus === "upcoming") continue;
    if (release.previewUrl || !release.publicationStatus) {
      expect(release.previewUrl).toBe(`/assets/preview-${release.slug}.m4a`);
      expect(existsSync(`public${release.previewUrl}`)).toBe(true);
    }
    const destinations = getStreamingLinks(release);
    expect(destinations).toHaveLength(
      Object.keys(release.streamingLinks).length,
    );
    for (const { platform, href } of destinations) {
      expect(href).toMatch(destinationPatterns[platform]);
      expect(links.has(href)).toBe(false);
      links.add(href);
    }
    if (!release.publicationStatus)
      expect(destinations.length).toBeGreaterThanOrEqual(4);
  }
});

test("streaming links reject wrong origins and credentials", () => {
  expect(
    getStreamingLinks({
      ...releases.find((release) => release.slug === "shorty")!,
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
