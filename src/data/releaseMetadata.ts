import type { Locale } from "../app/localeContext";
import type { MusicRelease } from "../domain/types";
import { artist } from "./content.ts";

const siteUrl = "https://jonaferreira.com";

export const getReleaseUrl = (slug: string) => `${siteUrl}/music/${slug}`;

export function resolveReleasePublication(
  release: MusicRelease,
  serverTime?: number,
): MusicRelease {
  if (
    release.publishAt &&
    release.publicationStatus === "upcoming" &&
    serverTime !== undefined &&
    serverTime >= Date.parse(release.publishAt)
  ) {
    return { ...release, publicationStatus: "released" };
  }
  return release;
}

export function formatReleaseDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "es" ? "es" : "en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

export function getReleaseMetadata(release: MusicRelease, locale: Locale) {
  const credit = release.artistCredit ?? artist.displayName;
  const title = `${release.title} — ${credit}`;
  let description =
    locale === "es"
      ? `Escucha ${release.title}, un sencillo de ${credit}.`
      : `Listen to ${release.title}, a single by ${credit}.`;
  if (release.publicationStatus === "upcoming") {
    const date = formatReleaseDate(release.releaseDate, locale);
    description =
      locale === "es"
        ? `${release.title}, un sencillo de ${credit}. ${date}.`
        : `${release.title}, a single by ${credit}. ${date}.`;
  }
  const url = getReleaseUrl(release.slug);
  const image = `${siteUrl}${release.coverArt}`;
  const tags: { tag: "link" | "meta"; attrs: Record<string, string> }[] = [
    { tag: "link", attrs: { rel: "canonical", href: url } },
    { tag: "meta", attrs: { name: "twitter:card", content: "summary" } },
    { tag: "meta", attrs: { name: "twitter:title", content: title } },
    {
      tag: "meta",
      attrs: { name: "twitter:description", content: description },
    },
    { tag: "meta", attrs: { name: "twitter:image", content: image } },
    ...Object.entries({
      "og:type": "website",
      "og:title": title,
      "og:description": description,
      "og:url": url,
      "og:image": image,
      "og:image:alt":
        locale === "es"
          ? `Portada de ${release.title}`
          : `${release.title} cover art`,
      "og:locale": locale === "es" ? "es_US" : "en_US",
    }).map(([property, content]) => ({
      tag: "meta" as const,
      attrs: { property, content },
    })),
  ];
  return { title, description, tags };
}
