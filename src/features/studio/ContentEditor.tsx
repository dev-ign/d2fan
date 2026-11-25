import { useRef, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import {
  approvedMediaUrl,
  contentFormats,
  contentLanguages,
  contentStatuses,
  placementTag,
  type ContentFields,
} from "../../../supabase/shared/studio-content";
import { releases } from "../../data/content";
import { campaignLink } from "../../data/campaignLink";
import { studioRequest } from "./client";
import { contentIdeas, contentPillars, ideaCopy } from "./contentIdeas";
import { StudioHeading } from "./StudioViews";
import { CreativeAssistant } from "./CreativeAssistant";
import { ContentPublishing } from "./ContentPublishing";

export type EditorRecord = {
  id: string;
  revision: number | null;
  fields: ContentFields;
};
export function ContentEditor({
  accessToken,
  initial,
  close,
  refresh,
}: {
  accessToken: string;
  initial: EditorRecord;
  close: () => void;
  refresh: () => void;
}) {
  const [saved, setSaved] = useState(initial);
  const [fields, setFields] = useState(initial.fields);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<{ success: boolean; message: string }>();
  const submitting = useRef(false);
  const editorForm = useRef<HTMLFormElement>(null);
  const format = contentFormats[fields.format];
  const savedPlatform = contentFormats[saved.fields.format].platform;
  const published = saved.fields.published_on !== null;
  const release = releases.find(({ slug }) => slug === fields.release_slug);
  const template =
    contentIdeas.find(({ pillar }) => pillar === fields.pillar) ??
    contentIdeas[0];
  const link =
    saved.revision &&
    saved.fields.release_slug &&
    fields.release_slug === saved.fields.release_slug &&
    format.platform === savedPlatform
      ? campaignLink(
          saved.fields.release_slug,
          savedPlatform,
          "organic_social",
          placementTag(saved.id),
        )
      : null;

  function edit<K extends keyof ContentFields>(
    key: K,
    value: ContentFields[K],
  ) {
    setFields((previous) => ({ ...previous, [key]: value }));
  }

  async function save(next: ContentFields) {
    if (submitting.current || !editorForm.current?.reportValidity()) return;
    if (!next.title.trim()) {
      setNotice({ success: false, message: "Enter a title for this post." });
      return;
    }
    if (next.status === "ready" && !next.caption.trim()) {
      setNotice({
        success: false,
        message: "Add a caption before marking the post ready.",
      });
      return;
    }
    if (next.media_url && !approvedMediaUrl(next.media_url)) {
      setNotice({
        success: false,
        message: "Use a direct HTTPS URL to an approved video or image file.",
      });
      return;
    }
    submitting.current = true;
    setWorking(true);
    setNotice(undefined);
    try {
      const record = await studioRequest<{
        revision: number;
        fields: ContentFields;
      }>(accessToken, {
        view: "content_save",
        id: saved.id,
        revision: saved.revision,
        fields: next,
      });
      setSaved({ id: saved.id, ...record });
      setFields(record.fields);
      setNotice({
        success: true,
        message:
          next.status === "published" ? "Publication saved." : "Content saved.",
      });
      refresh();
      return record.fields;
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setNotice({
        success: false,
        message:
          code === "content_conflict"
            ? "This version is out of date. Copy any unsaved changes, then return to the planner and reopen the post."
            : code === "invalid_content"
              ? "Check the dates, media link and full post URL for the selected format."
              : "Could not confirm the save. You can retry or reopen the planner to check whether it was saved.",
      });
      refresh();
    } finally {
      submitting.current = false;
      setWorking(false);
    }
  }

  return (
    <div className="content-workspace">
      <button
        className="studio-text-link content-back"
        type="button"
        onClick={close}
        disabled={working}
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back to planner
      </button>
      <StudioHeading title={saved.fields.title || "New content"}>
        {saved.revision
          ? contentStatuses[saved.fields.status]
          : "Choose a song, draft the post and pick a publication date."}
      </StudioHeading>
      {notice && (
        <p
          className={`content-feedback ${notice.success ? "" : "studio-error"}`}
          role={notice.success ? "status" : "alert"}
        >
          {notice.message}
        </p>
      )}
      <div className="content-editor-layout">
        <section className="studio-panel" aria-labelledby="prepare-content">
          <div className="studio-panel-head">
            <h2 id="prepare-content">Prepare the post</h2>
          </div>
          <form
            ref={editorForm}
            className="content-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save(fields);
            }}
          >
            <fieldset disabled={working}>
              <label>
                Title
                <input
                  autoFocus
                  maxLength={120}
                  required
                  value={fields.title}
                  onChange={(event) => edit("title", event.currentTarget.value)}
                />
              </label>
              <div className="content-form-row">
                <label>
                  Song
                  <select
                    aria-label="Song"
                    value={fields.release_slug ?? ""}
                    disabled={published}
                    onChange={(event) =>
                      edit("release_slug", event.currentTarget.value || null)
                    }
                  >
                    <option value="">General artist content</option>
                    {releases.map((song) => (
                      <option key={song.slug} value={song.slug}>
                        {song.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Publication format
                  <select
                    aria-label="Publication format"
                    value={fields.format}
                    disabled={published}
                    onChange={(event) =>
                      edit(
                        "format",
                        event.currentTarget.value as ContentFields["format"],
                      )
                    }
                  >
                    {Object.entries(contentFormats).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {release && (
                <p className="content-field-note">
                  Campaign{" "}
                  <Link
                    className="studio-text-link"
                    to={`/campaigns?release=${release.slug}`}
                  >
                    {release.campaignId ?? release.slug}
                  </Link>
                </p>
              )}
              <div className="content-form-row">
                <label>
                  Content pillar
                  <input
                    list="studio-content-pillars"
                    maxLength={60}
                    placeholder="Choose or type a pillar"
                    value={fields.pillar}
                    onChange={(event) =>
                      edit("pillar", event.currentTarget.value)
                    }
                  />
                  <datalist id="studio-content-pillars">
                    {contentPillars.map((pillar) => (
                      <option key={pillar} value={pillar} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Language
                  <select
                    aria-label="Language"
                    value={fields.language}
                    onChange={(event) =>
                      edit(
                        "language",
                        event.currentTarget.value as ContentFields["language"],
                      )
                    }
                  >
                    {Object.entries(contentLanguages).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="studio-text-link content-template"
                type="button"
                onClick={() =>
                  setFields({
                    ...fields,
                    ...Object.fromEntries(
                      Object.entries(
                        ideaCopy(template, fields.language, release?.title),
                      ).filter(
                        ([key]) =>
                          !fields[key as "hook" | "caption" | "cta"].trim(),
                      ),
                    ),
                  })
                }
                disabled={Boolean(
                  fields.hook.trim() &&
                  fields.caption.trim() &&
                  fields.cta.trim(),
                )}
              >
                <Sparkles size={16} aria-hidden="true" /> Fill empty copy from a
                template
              </button>
              <CreativeAssistant
                accessToken={accessToken}
                fields={fields}
                song={release?.title}
                apply={(copy) =>
                  setFields((current) => ({ ...current, ...copy }))
                }
              />
              <label>
                Hook
                <input
                  maxLength={240}
                  value={fields.hook}
                  onChange={(event) => edit("hook", event.currentTarget.value)}
                />
              </label>
              <label>
                Caption
                <textarea
                  aria-label="Caption"
                  rows={5}
                  maxLength={2200}
                  value={fields.caption}
                  onChange={(event) =>
                    edit("caption", event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Call to action
                <input
                  maxLength={240}
                  value={fields.cta}
                  onChange={(event) => edit("cta", event.currentTarget.value)}
                />
              </label>
              <div className="content-form-row">
                <label>
                  Planned date (ET)
                  <input
                    type="date"
                    min="2000-01-01"
                    max="2099-12-31"
                    value={fields.planned_on ?? ""}
                    onChange={(event) =>
                      edit("planned_on", event.currentTarget.value || null)
                    }
                  />
                </label>
                <label>
                  Content status
                  <select
                    aria-label="Content status"
                    value={fields.status}
                    onChange={(event) =>
                      edit(
                        "status",
                        event.currentTarget.value as ContentFields["status"],
                      )
                    }
                  >
                    {Object.entries(contentStatuses)
                      .filter(([key]) =>
                        published
                          ? key === "published" || key === "archived"
                          : key !== "published",
                      )
                      .map(([key, value]) => (
                        <option key={key} value={key}>
                          {value}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label>
                Approved media URL
                <input
                  type="url"
                  placeholder="https://…/approved-clip.mp4"
                  value={fields.media_url ?? ""}
                  maxLength={2048}
                  onChange={(event) =>
                    edit("media_url", event.currentTarget.value || null)
                  }
                />
                <small>
                  Link directly to an approved MP4, WebM, JPG, PNG or WebP.
                </small>
              </label>
              <button className="studio-button studio-primary" type="submit">
                {working ? "Saving…" : "Save content"}
              </button>
            </fieldset>
          </form>
        </section>

        <ContentPublishing
          accessToken={accessToken}
          saved={saved}
          fields={fields}
          link={link}
          working={working}
          save={save}
        />
      </div>
    </div>
  );
}
