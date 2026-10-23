import { describe, expect, it } from "vitest";
import { resolveReleaseTheme, themeContrast } from "./releaseTheme";
import { localContentRepository } from "../repositories/localContentRepository";
import { catalog } from "../config/runtime";

describe("release theme resolution", () => {
  it("automatically uses optimized cover art and accessible defaults", async () => {
    const releases = await localContentRepository.listReleases(
      catalog.artistId,
    );
    for (const release of releases) {
      const theme = resolveReleaseTheme(release);
      expect(theme.image).toBe(release.coverArt);
      expect(theme.image).toMatch(/\.webp$/);
      expect(
        themeContrast(theme.overlayColor, theme.overlayOpacity),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        (
          await localContentRepository.getReleaseBySlug(
            catalog.artistId,
            release.slug,
          )
        )?.coverArt,
      ).toBe(release.coverArt);
    }
    expect(resolveReleaseTheme({ coverArt: "/new-release.webp" }).image).toBe(
      "/new-release.webp",
    );
  });
  it("applies optional composition settings without a release mapping", () => {
    expect(
      resolveReleaseTheme({
        coverArt: "/cover.webp",
        theme: {
          backgroundImage: "/composed.webp",
          overlayColor: "#210c15",
          overlayOpacity: 0.9,
          backgroundPosition: "65% 40%",
        },
      }),
    ).toEqual({
      image: "/composed.webp",
      overlayColor: "#210c15",
      overlayOpacity: 0.9,
      backgroundPosition: "65% 40%",
    });
  });
  it("handles missing art and invalid or unsafe overlay configuration", () => {
    expect(
      resolveReleaseTheme({ coverArt: "", theme: { backgroundImage: " " } })
        .image,
    ).toBeUndefined();
    for (const overlayColor of ["#ffffff", "not-a-color", "#000000"]) {
      const theme = resolveReleaseTheme({
        coverArt: "/white.webp",
        theme: { overlayColor, overlayOpacity: 0.01 },
      });
      expect(
        themeContrast(theme.overlayColor, theme.overlayOpacity),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      resolveReleaseTheme({
        coverArt: "/cover.webp",
        theme: { overlayOpacity: Number.NaN },
      }).overlayOpacity,
    ).toBe(0.8);
  });
});
