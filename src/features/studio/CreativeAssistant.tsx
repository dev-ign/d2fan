import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  copyLimits,
  objectives,
  validCreativeCopy,
  type CreativeCopy,
  type CreativeObjective,
} from "../../../supabase/shared/studio-creative";
import type { ContentFields } from "../../../supabase/shared/studio-content";
import { studioRequest, useStudioRequest } from "./client";
import { contentIdeas, ideaCopy } from "./contentIdeas";

export function CreativeAssistant({
  accessToken,
  fields,
  song,
  apply,
}: {
  accessToken: string;
  fields: ContentFields;
  song?: string;
  apply: (copy: CreativeCopy) => void;
}) {
  const readiness = useStudioRequest<{ enabled: boolean }>(accessToken, {
    view: "creative_status",
  });
  const [candidate, setCandidate] = useState<CreativeCopy>();
  const [objective, setObjective] = useState<CreativeObjective>("Discovery");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [usage, setUsage] = useState("");

  function template() {
    const idea =
      contentIdeas.find(({ pillar }) => pillar === fields.pillar) ??
      (objective === "Fan invitation"
        ? contentIdeas[3]
        : objective === "Connection"
          ? contentIdeas[1]
          : contentIdeas[0]);
    setCandidate(ideaCopy(idea, fields.language, song));
    setMessage("Template ready to review.");
  }

  async function generate() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await studioRequest<{
        copy: CreativeCopy;
        used: number;
        limit: number;
        estimatedMicros?: number;
      }>(accessToken, {
        view: "creative_generate",
        release: fields.release_slug,
        releaseTitle: song ?? null,
        format: fields.format,
        language: fields.language,
        pillar: fields.pillar,
        objective,
        note,
      });
      if (!validCreativeCopy(result.copy)) throw new Error("invalid_copy");
      setCandidate(result.copy);
      const estimate =
        typeof result.estimatedMicros === "number"
          ? ` Estimated request cost USD ${(result.estimatedMicros / 1_000_000).toFixed(5)}.`
          : "";
      setUsage(
        `${result.used} of ${result.limit} AI requests used this month.${estimate}`,
      );
      setMessage("AI copy ready to review.");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "creative_budget"
          ? "Monthly AI limit reached. Templates are available."
          : "AI copy is unavailable. Your draft is intact. You can use a template.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="creative-assistant">
      <summary>
        <Sparkles size={16} aria-hidden="true" /> Creative Assistant
      </summary>
      <div className="creative-review">
        <label>
          Objective
          <select
            aria-label="Creative objective"
            value={objective}
            onChange={(event) =>
              setObjective(event.target.value as CreativeObjective)
            }
          >
            {objectives.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        {readiness.data?.enabled ? (
          <label>
            Artist note (optional)
            <textarea
              aria-label="Artist note"
              maxLength={600}
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        ) : (
          <p>
            Templates are available. AI generation requires an approved provider
            setup.
          </p>
        )}
        <div className="content-copy-buttons">
          <button
            className="studio-button"
            type="button"
            disabled={busy}
            onClick={template}
          >
            Review a template
          </button>
          {readiness.data?.enabled && (
            <button
              className="studio-button"
              type="button"
              disabled={busy}
              onClick={() => void generate()}
            >
              {busy
                ? "Generating…"
                : candidate
                  ? "Generate another AI candidate"
                  : "Generate AI copy"}
            </button>
          )}
        </div>
        <p role="status">{message}</p>
        {usage && <p>{usage}</p>}
        {candidate && (
          <div className="creative-review">
            <h3>Copy candidate</h3>
            {(["hook", "caption", "cta"] as const).map((field) => (
              <label key={field}>
                {field === "cta" ? "Candidate CTA" : `Candidate ${field}`}
                <textarea
                  aria-label={`Candidate ${field}`}
                  value={candidate[field]}
                  maxLength={copyLimits[field]}
                  rows={field === "caption" ? 4 : 2}
                  onChange={(event) =>
                    setCandidate({ ...candidate, [field]: event.target.value })
                  }
                />
              </label>
            ))}
            <div className="content-copy-buttons">
              <button
                type="button"
                className="studio-button studio-primary"
                disabled={busy || !validCreativeCopy(candidate)}
                onClick={() => {
                  apply(candidate);
                  setCandidate(undefined);
                  setMessage("Copy applied to the editor. Save when ready.");
                }}
              >
                Apply to draft
              </button>
              <button
                type="button"
                className="studio-button"
                disabled={busy}
                onClick={() => {
                  setCandidate(undefined);
                  setMessage("Candidate discarded.");
                }}
              >
                Discard candidate
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
