import { expect, test } from "vitest";
import { artist, releases } from "./content";
import { localContentRepository } from "../repositories/localContentRepository";
import type { MusicRelease } from "../domain/types";

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

test("the featured release is Shorty with the supplied cover and no local preview", () => {
  expect(releases[0]).toMatchObject({
    id: artist.featuredReleaseId,
    slug: "shorty",
    releaseDate: "2026-10-30",
    artistCredit: "Jona Ferreira & Sbfaraon",
    coverArt: "/assets/cover-shorty.webp",
  });
  expect(releases[0].previewUrl).toBeUndefined();
  expect(releases.slice(1).every((release) => release.previewUrl)).toBe(true);
});

test("the catalog serves unique release-specific HTTPS links across both lookups", async () => {
  const catalog = await localContentRepository.listReleases(artist.id);
  expect(catalog).toEqual(releases);
  expect(new Set(catalog.map(({ slug }) => slug)).size).toBe(catalog.length);

  const links = new Set<string>();
  for (const release of catalog) {
    expect(
      await localContentRepository.getReleaseBySlug(artist.id, release.slug),
    ).toBe(release);
    for (const platform of Object.keys(
      destinationPatterns,
    ) as (keyof typeof destinationPatterns)[]) {
      const url = release.streamingLinks[platform] ?? "";
      expect(url).toMatch(destinationPatterns[platform]);
      expect(links.has(url)).toBe(false);
      links.add(url);
    }
  }
});
