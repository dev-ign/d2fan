import type { Locale } from "../app/localeContext";
import type { MusicRelease } from "../domain/types";
import { artist } from "./content";

const siteUrl = "https://jonaferreira.com";

export function getReleaseMetadata(release: MusicRelease, locale: Locale) {
  const credit = release.artistCredit ?? artist.displayName;
  const title = `${release.title} — ${credit}`;
  const description =
    locale === "es"
      ? `Escucha ${release.title}, un sencillo de ${credit}.`
      : `Listen to ${release.title}, a single by ${credit}.`;
  const url = `${siteUrl}/music/${release.slug}`;
  const image = `${siteUrl}${release.coverArt}`;
  const tags: { tag: "link" | "meta"; attrs: Record<string, string> }[] = [
    { tag: "link", attrs: { rel: "canonical", href: url } },
    { tag: "meta", attrs: { name: "twitter:card", content: "summary" } },
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
