import type { ContentFields } from "./studio-content.ts";

export const copyLimits = { hook: 240, caption: 2200, cta: 240 } as const;
export const objectives = [
  "Discovery",
  "Connection",
  "Fan invitation",
] as const;
export type CreativeCopy = Pick<ContentFields, keyof typeof copyLimits>;
export type CreativeObjective = (typeof objectives)[number];

export function validCreativeCopy(input: unknown): input is CreativeCopy {
  if (!input || typeof input !== "object" || Object.keys(input).length !== 3)
    return false;
  const fields = input as Record<string, unknown>;
  return Object.entries(copyLimits).every(([key, limit]) => {
    const value = fields[key];
    return (
      typeof value === "string" &&
      !value.includes("\0") &&
      value.length <= limit &&
      (key === "cta" || Boolean(value.trim()))
    );
  });
}

export type CreativeRequest =
  | { view: "creative_status" }
  | {
      view: "creative_generate";
      release: string | null;
      releaseTitle: string | null;
      format: ContentFields["format"];
      language: ContentFields["language"];
      pillar: string;
      objective: CreativeObjective;
      note: string;
    };
