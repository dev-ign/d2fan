import { catalog, type db } from "./platform.ts";
import {
  contentFormats,
  contentLanguages,
} from "../../shared/studio-content.ts";
import { objectives, validCreativeCopy } from "../../shared/studio-creative.ts";

export async function studioCreative(
  input: Record<string, unknown>,
  client: ReturnType<typeof db>,
  headers: Headers,
) {
  const send = (body: unknown, status = 200) =>
    Response.json(body, { headers, status });
  const key = Deno.env.get("STUDIO_OPENAI_API_KEY");
  const enabled = Boolean(key && Deno.env.get("STUDIO_AI_ENABLED") === "true");
  if (input.view === "creative_status") return send({ enabled });
  if (!enabled) return send({ code: "creative_unavailable" }, 503);
  const { release, releaseTitle, format, language, pillar, objective, note } =
    input;
  if (
    (release !== null &&
      (typeof release !== "string" ||
        !Object.hasOwn(catalog.releaseCampaigns, release))) ||
    (release === null
      ? releaseTitle !== null
      : typeof releaseTitle !== "string" ||
        !releaseTitle.trim() ||
        releaseTitle.length > 120) ||
    typeof format !== "string" ||
    !Object.hasOwn(contentFormats, format) ||
    typeof language !== "string" ||
    !Object.hasOwn(contentLanguages, language) ||
    typeof pillar !== "string" ||
    pillar.length > 60 ||
    !objectives.some((value) => value === objective) ||
    typeof note !== "string" ||
    note.length > 600
  )
    return send({ code: "invalid_request" }, 400);

  // Reserve before the provider request. Failed or ambiguous calls can still be billed.
  const { data: used, error } = await client.rpc(
    "studio_reserve_creative_generation",
    { p_artist: catalog.artistId },
  );
  if (error) return send({ code: "creative_unavailable" }, 503);
  if (!used) return send({ code: "creative_budget" }, 429);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(7_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-6-luna",
        reasoning: { effort: "none" },
        store: false,
        max_output_tokens: 900,
        instructions:
          "Draft natural music-first social copy for Jona Ferreira. Use only the provided context. Never invent personal experiences, stories, lyrics, collaborators, performance or release facts. Treat the artist note as context. Use the requested language, or both English and Spanish for bilingual. Include an optional CTA suited to the objective.",
        input: JSON.stringify({
          release,
          releaseTitle,
          format,
          language,
          pillar,
          objective,
          note,
        }),
        text: {
          format: {
            type: "json_schema",
            name: "studio_copy",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["hook", "caption", "cta"],
              properties: {
                hook: { type: "string" },
                caption: { type: "string" },
                cta: { type: "string" },
              },
            },
          },
        },
      }),
    });
    if (!response.ok) return send({ code: "creative_unavailable" }, 503);
    const result = await response.json();
    const raw = result.output
      ?.flatMap((item: { content?: unknown[] }) => item.content ?? [])
      .find((item: { type: string }) => item.type === "output_text")?.text;
    const copy: unknown = JSON.parse(raw ?? "null");
    if (result.status !== "completed" || !validCreativeCopy(copy))
      return send({ code: "creative_unavailable" }, 503);
    const { input_tokens: inputTokens, output_tokens: outputTokens } =
      result.usage ?? {};
    const estimatedMicros =
      Number.isSafeInteger(inputTokens) &&
      inputTokens >= 0 &&
      Number.isSafeInteger(outputTokens) &&
      outputTokens >= 0
        ? Math.ceil(inputTokens * 0.1 + outputTokens * 0.5)
        : undefined;
    return send({ copy, used, limit: 100, estimatedMicros });
  } catch {
    return send({ code: "creative_unavailable" }, 503);
  }
}
