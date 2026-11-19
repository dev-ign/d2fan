import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { releases } from "./src/data/content";
import { getReleaseMetadata } from "./src/data/releaseMetadata";
import { spanish } from "./src/i18n/site";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "page-html",
      apply: "build",
      generateBundle: {
        order: "post",
        handler(_options, bundle) {
          const document = bundle["index.html"];
          if (document?.type !== "asset" || typeof document.source !== "string")
            return;
          // Share the SPA entry point while serving metadata to crawlers before JavaScript runs.
          const pages = [
            ...releases.map((release) => ({
              fileName: `music/${release.slug}.html`,
              ...getReleaseMetadata(release, "es"),
            })),
            { fileName: "privacy.html", ...spanish.privacy, tags: [] },
          ];
          for (const { fileName, title, description, tags } of pages) {
            const head = tags
              .map(({ tag, attrs }) => {
                const attributes = Object.entries(attrs)
                  .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
                  .join(" ");
                return `<${tag} ${attributes} data-release-meta>`;
              })
              .join("\n");
            const source = document.source
              .replace(
                /<title>.*?<\/title>/,
                () => `<title>${escapeHtml(title)}</title>`,
              )
              .replace(
                /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
                () =>
                  `<meta name="description" content="${escapeHtml(description)}">`,
              )
              .replace("</head>", () => `${head}\n</head>`);
            this.emitFile({
              type: "asset",
              fileName,
              source,
            });
          }
        },
      },
    },
  ],
  server: {
    fs: {
      // Preserve Vite's default secret-file exclusions and exclude camera masters.
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/source-media/**",
      ],
    },
  },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
});
