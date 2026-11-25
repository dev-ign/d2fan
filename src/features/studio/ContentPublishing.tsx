import { useEffect, useState, type FormEvent } from "react";
import { Copy, ExternalLink, FileVideo } from "lucide-react";
import {
  approvedMediaUrl,
  contentFormats,
  easternDay,
  type ContentAcquisition,
  type ContentFields,
} from "../../../supabase/shared/studio-content";
import { useStudioRequest } from "./client";
import { StudioLoad } from "./StudioViews";
import type { EditorRecord } from "./ContentEditor";

const platformUrls = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/",
  youtube: "https://studio.youtube.com/",
};
const platformNames = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

function publishingInstructions(format: ContentFields["format"]) {
  if (format === "ig_story")
    return "In Instagram, create a Story and add this promotional URL with the Link sticker.";
  if (format.startsWith("ig_"))
    return "In Instagram, create the selected post format. Use the tracked URL in your bio or a companion Story where people can tap it.";
  if (format.startsWith("tt_"))
    return "In TikTok, tap Create and upload your approved media. Use the tracked URL in your profile if website links are available to your account.";
  return "Upload the video as a Short in YouTube Studio. Use the tracked URL in a clickable placement, such as your channel links.";
}

export function ContentPublishing({
  accessToken,
  saved,
  fields,
  link,
  working,
  save,
}: {
  accessToken: string;
  saved: EditorRecord;
  fields: ContentFields;
  link: string | null;
  working: boolean;
  save: (fields: ContentFields) => Promise<ContentFields | undefined>;
}) {
  const [date, setDate] = useState(saved.fields.published_on ?? easternDay());
  const [post, setPost] = useState(saved.fields.post_url ?? "");
  const [clipboard, setClipboard] = useState("");
  const format = contentFormats[fields.format];
  const published = saved.fields.published_on !== null;

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setClipboard(`${label} copied.`);
    } catch {
      setClipboard(
        `Select the ${label.toLowerCase()} field to copy it manually.`,
      );
    }
  }

  async function recording(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await save({
      ...fields,
      status: "published",
      post_url: post.trim(),
      published_on: date,
    });
    if (result?.post_url) setPost(result.post_url);
  }

  return (
    <div>
      <section
        className="studio-panel content-publish"
        aria-labelledby="native-publishing"
      >
        <div className="studio-panel-head">
          <div>
            <h2 id="native-publishing">Manual publishing</h2>
            <p>{format.label}</p>
          </div>
          <span className="studio-chip">Native app</span>
        </div>
        <MediaPrep media={fields.media_url} />
        <p>{publishingInstructions(fields.format)}</p>
        <div className="content-copy-buttons">
          <button
            className="studio-button"
            type="button"
            disabled={!fields.caption.trim()}
            onClick={() => void copy("Caption", fields.caption)}
          >
            <Copy size={15} aria-hidden="true" /> Copy caption
          </button>
          <button
            className="studio-button"
            type="button"
            disabled={!fields.cta.trim()}
            onClick={() => void copy("Call to action", fields.cta)}
          >
            <Copy size={15} aria-hidden="true" /> Copy CTA
          </button>
        </div>
        <label>
          Tracked promotional link
          <input
            value={link ?? ""}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        {link ? (
          <button
            className="studio-button"
            type="button"
            onClick={() => void copy("Promotional link", link)}
          >
            <Copy size={15} aria-hidden="true" /> Copy promotional link
          </button>
        ) : (
          <p className="content-field-note">
            {fields.release_slug
              ? "Save the song and format to create a tracked link."
              : "Select a song to create a tracked link."}
          </p>
        )}
        <p className="content-field-note" role="status">
          {clipboard}
        </p>
        <a
          className="studio-button content-platform-link"
          href={platformUrls[format.platform]}
          target="_blank"
          rel="noreferrer"
        >
          Open {platformNames[format.platform]}{" "}
          <ExternalLink size={15} aria-hidden="true" />
        </a>
      </section>

      <section className="studio-panel" aria-labelledby="record-publication">
        <div className="studio-panel-head">
          <div>
            <h2 id="record-publication">
              {published ? "Recorded publication" : "Record publication"}
            </h2>
            <p>
              {published
                ? "Update the record if you need to correct the post link or date."
                : "Return here after the post is live and add its full URL and actual date."}
            </p>
          </div>
        </div>
        {saved.fields.status === "archived" ? (
          <p>
            Restore this post in the preparation form to update its publication
            record.
          </p>
        ) : (
          <form
            className="content-form"
            onSubmit={(event) => void recording(event)}
          >
            <fieldset disabled={working}>
              <label>
                Published post URL
                <input
                  type="url"
                  value={post}
                  maxLength={1024}
                  required
                  onChange={(event) => setPost(event.currentTarget.value)}
                  placeholder={
                    format.platform === "tiktok"
                      ? "https://www.tiktok.com/@artist/video/…"
                      : `https://www.${format.platform}.com/…`
                  }
                />
              </label>
              <label>
                Actual publication date (ET)
                <input
                  type="date"
                  value={date}
                  min="2000-01-01"
                  max={easternDay()}
                  required
                  onChange={(event) => setDate(event.currentTarget.value)}
                />
              </label>
              <button className="studio-button" type="submit">
                {published
                  ? "Update publication record"
                  : "Record as published"}
              </button>
            </fieldset>
          </form>
        )}
        {saved.fields.post_url && (
          <a
            className="studio-text-link content-external-post"
            href={saved.fields.post_url}
            target="_blank"
            rel="noreferrer"
          >
            View recorded post <ExternalLink size={15} aria-hidden="true" />
          </a>
        )}
      </section>

      {link && (
        <PlacementAcquisition
          key={link}
          accessToken={accessToken}
          id={saved.id}
        />
      )}
    </div>
  );
}

function MediaPrep({ media }: { media: string | null }) {
  const [local, setLocal] = useState<{
    url: string;
    name: string;
    video: boolean;
  }>();
  const [preview, setPreview] = useState<string>();
  const linked = media ? approvedMediaUrl(media) : undefined;
  useEffect(
    () => () => {
      if (local) URL.revokeObjectURL(local.url);
    },
    [local],
  );

  const src = local?.url ?? (preview === linked?.href ? preview : undefined);
  const video = local?.video ?? /\.(mp4|webm)$/i.test(linked?.pathname ?? "");
  return (
    <div className="content-media">
      {src ? (
        video ? (
          <video
            src={src}
            aria-label="Approved media preview"
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={src}
            alt="Approved media preview"
            referrerPolicy="no-referrer"
          />
        )
      ) : (
        <div className="content-media-empty">
          <FileVideo size={22} aria-hidden="true" />
          <p>
            {linked
              ? "Approved media attached"
              : "Preview a file from this device"}
          </p>
        </div>
      )}
      <label className="content-local-file">
        Local preview (this session)
        <input
          type="file"
          accept="video/mp4,video/webm,image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setLocal(
              file
                ? {
                    url: URL.createObjectURL(file),
                    name: file.name,
                    video: file.type.startsWith("video/"),
                  }
                : undefined,
            );
          }}
        />
      </label>
      {(local || linked) && (
        <div className="content-copy-buttons">
          {local ? (
            <a className="studio-button" href={local.url} download={local.name}>
              Download local file
            </a>
          ) : (
            linked && (
              <>
                {!src && (
                  <button
                    className="studio-button"
                    type="button"
                    onClick={() => setPreview(linked.href)}
                  >
                    Load preview
                  </button>
                )}
                <a
                  className="studio-button"
                  href={linked.href}
                  target="_blank"
                  rel="noreferrer"
                  download
                >
                  Open / download file
                </a>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}

function PlacementAcquisition({
  accessToken,
  id,
}: {
  accessToken: string;
  id: string;
}) {
  const report = useStudioRequest<ContentAcquisition>(accessToken, {
    view: "content_acquisition",
    id,
  });
  return (
    <section className="studio-panel" aria-labelledby="content-acquisition">
      <div className="studio-panel-head">
        <div>
          <h2 id="content-acquisition">Placement acquisition</h2>
          <p>La Cultura activity attributed to this saved campaign link.</p>
        </div>
      </div>
      {report.data ? (
        <dl className="content-acquisition">
          <div>
            <dt>Contacts</dt>
            <dd>{report.data.contacts}</dd>
          </div>
          <div>
            <dt>Reward requests</dt>
            <dd>{report.data.requests}</dd>
          </div>
        </dl>
      ) : (
        <StudioLoad error={report.error} retry={report.retry} />
      )}
      <p className="content-field-note">
        Counts use the last recorded campaign touch. Shared links can carry
        traffic from multiple posts.
      </p>
    </section>
  );
}
