import { useEffect, useRef, useState } from "react";
import type {
  ContentPage,
  StudioContentItem,
} from "../../../supabase/shared/studio-content";
import { contentFormats } from "../../../supabase/shared/studio-content";
import type {
  InstagramMedia,
  InstagramMediaPage,
  InstagramStatus,
} from "../../../supabase/shared/studio-instagram";
import { releases } from "../../data/content";
import { studioRequest, useStudioRequest } from "./client";
import { StudioLoad } from "./StudioViews";

export type InstagramCallback =
  { code: string; state: string } | { denied: true };

const statusLabels = {
  setup_required: "Setup required",
  disconnected: "Not connected",
  pending: "Connection pending",
  connected: "Read access",
  reauthorize: "Reconnect required",
};

const linkKey = (link: string | null) =>
  link
    ?.replace(/^https:\/\/(?:www\.)?instagram\.com/, "")
    .split(/[?#]/)[0]
    .replace(/\/$/, "");

export function ContentSocial({
  accessToken,
  area,
  callback,
  clearCallback,
  edit,
}: {
  accessToken: string;
  area: "accounts" | "published";
  callback?: InstagramCallback;
  clearCallback: () => void;
  edit: (placement: StudioContentItem) => void;
}) {
  const account = useStudioRequest<InstagramStatus>(accessToken, {
    view: "instagram_status",
  });
  const [page, setPage] = useState(0);
  const published = useStudioRequest<ContentPage>(accessToken, {
    view: "content",
    status: "published",
    week: null,
    page,
  });
  const [media, setMedia] = useState<InstagramMediaPage>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(
    Boolean(callback && !("denied" in callback)),
  );
  const [message, setMessage] = useState(
    callback && "denied" in callback
      ? "Instagram authorization was cancelled."
      : "",
  );
  const completed = useRef(false);
  const active = useRef(false);
  const accountRetry = useRef(account.retry);
  const clear = useRef(clearCallback);
  useEffect(() => {
    if (!callback || completed.current) return;
    completed.current = true;
    if ("denied" in callback) {
      clear.current();
      return;
    }
    void studioRequest(accessToken, { view: "instagram_finish", ...callback })
      .then(() => setMessage("Instagram connected with read access."))
      .catch(() =>
        setMessage(
          "Instagram could not be connected. Start a fresh connection from this session.",
        ),
      )
      .finally(() => {
        setBusy(false);
        accountRetry.current();
        clear.current();
      });
  }, [accessToken, callback]);

  async function run(action: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "instagram_reauthorize") {
        setMedia(undefined);
        account.retry();
      }
      setMessage(
        code === "instagram_permalink" || code === "instagram_association"
          ? "The link could not be saved. Check the recorded permalink and whether the post is already associated."
          : code === "instagram_reauthorize"
            ? "Reconnect Instagram to retrieve media."
            : "Instagram is unavailable right now. Try again.",
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  function load(after: string | null) {
    void run(async () => {
      setMedia(
        await studioRequest<InstagramMediaPage>(accessToken, {
          view: "instagram_media",
          after,
        }),
      );
      setCursor(after);
      account.retry();
    });
  }

  function associate(item: InstagramMedia, placement: StudioContentItem) {
    void run(async () => {
      await studioRequest(accessToken, {
        view: "instagram_associate",
        placementId: placement.id,
        mediaId: item.id,
        after: cursor,
      });
      setMedia(
        (current) =>
          current && {
            ...current,
            items: current.items.map((row) =>
              row.id === item.id ? { ...row, placementId: placement.id } : row,
            ),
          },
      );
      setMessage("Instagram post linked to the recorded publication.");
    });
  }

  const connected = account.data?.status === "connected";
  return (
    <section className="studio-panel" aria-labelledby="content-social-title">
      <div className="studio-panel-head">
        <div>
          <h2 id="content-social-title">
            {area === "accounts" ? "Social accounts" : "Published content"}
          </h2>
          <p>
            {area === "accounts"
              ? "Connect Instagram to read profile and recent media."
              : "Review manual publications and verified Instagram media."}
          </p>
        </div>
      </div>
      <p role="status">{message}</p>
      {area === "accounts" ? (
        <>
          {!account.data ? (
            <StudioLoad error={account.error} retry={account.retry} />
          ) : (
            <div className="creative-review">
              <div className="content-copy-buttons">
                {account.data.profile?.avatar && (
                  <img
                    className="instagram-avatar"
                    src={account.data.profile.avatar}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                )}
                <strong>
                  {account.data.profile
                    ? `@${account.data.profile.username}`
                    : "Instagram"}
                </strong>
                <span className="studio-chip">
                  {statusLabels[account.data.status]}
                </span>
              </div>
              {account.data.status === "setup_required" && (
                <p>
                  A Professional Instagram account and an eligible Meta app
                  configuration are needed.
                </p>
              )}
              {account.data.syncedAt && (
                <p>
                  Last successful sync{" "}
                  {new Date(account.data.syncedAt).toLocaleString("en-US", {
                    timeZone: "America/New_York",
                  })}{" "}
                  ET
                </p>
              )}
              {account.data.status !== "setup_required" && (
                <div className="content-copy-buttons">
                  <button
                    className="studio-button studio-primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const { url } = await studioRequest<{ url: string }>(
                          accessToken,
                          { view: "instagram_start" },
                        );
                        if (new URL(url).origin !== "https://www.instagram.com")
                          throw new Error("invalid_provider");
                        location.assign(url);
                      })
                    }
                  >
                    {account.data.status === "disconnected"
                      ? "Connect Instagram"
                      : "Reconnect Instagram"}
                  </button>
                  {account.data.status !== "disconnected" && (
                    <button
                      className="studio-button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await studioRequest(accessToken, {
                            view: "instagram_disconnect",
                          });
                          setMedia(undefined);
                          account.retry();
                          setMessage(
                            "Disconnected from Studio. You can also remove app access in Instagram settings.",
                          );
                        })
                      }
                    >
                      Disconnect from Studio
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <p className="studio-note">TikTok uses native publishing.</p>
        </>
      ) : (
        <>
          <h3>Recorded in Studio</h3>
          {!published.data ? (
            <StudioLoad error={published.error} retry={published.retry} />
          ) : (
            <div className="creative-review">
              {published.data.items.length === 0 && (
                <p>Record a publication from the planner to see it here.</p>
              )}
              {published.data.items.map((record) => (
                <button
                  className="content-post"
                  key={record.id}
                  onClick={() => edit(record)}
                >
                  <strong>{record.title}</strong>
                  <span>
                    {contentFormats[record.format].label} ·{" "}
                    {record.published_on}
                  </span>
                </button>
              ))}
              {(page > 0 || published.data.has_more) && (
                <div className="content-copy-buttons">
                  <button
                    className="studio-button"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous publications
                  </button>
                  <button
                    className="studio-button"
                    disabled={!published.data.has_more}
                    onClick={() => setPage(page + 1)}
                  >
                    More publications
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="instagram-results creative-review">
            <h3>Recent Instagram media</h3>
            {connected ? (
              <button
                className="studio-button"
                disabled={busy}
                onClick={() => load(null)}
              >
                Refresh Instagram media
              </button>
            ) : (
              <p>Connect Instagram in Accounts to retrieve recent media.</p>
            )}
            {connected && media && (
              <>
                {!media.items.length && (
                  <p>Instagram returned no media on this page.</p>
                )}
                <div className="content-ideas">
                  {media.items.map((item) => {
                    const match = published.data?.items.find(
                      (record) =>
                        linkKey(record.post_url) === linkKey(item.permalink),
                    );
                    const release = releases.find(
                      ({ slug }) => slug === match?.release_slug,
                    );
                    return (
                      <article
                        className="instagram-post creative-review"
                        key={item.id}
                      >
                        {item.thumbnail && (
                          <img
                            src={item.thumbnail}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <a
                          className="studio-text-link"
                          href={item.permalink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.format.replaceAll("_", " ")} ·{" "}
                          {new Date(item.timestamp).toLocaleDateString(
                            "en-US",
                            { timeZone: "America/New_York" },
                          )}
                        </a>
                        {item.caption && <p>{item.caption}</p>}
                        {item.placementId ? (
                          <span>
                            Linked to Studio
                            {release
                              ? ` · ${release.title} · ${release.campaignId ?? release.slug}`
                              : ""}
                          </span>
                        ) : (
                          match && (
                            <button
                              className="studio-button"
                              disabled={busy}
                              onClick={() => associate(item, match)}
                            >
                              Link to {match.title}
                            </button>
                          )
                        )}
                        {!item.placementId && !match && (
                          <span>
                            Record this permalink in Studio to associate it.
                          </span>
                        )}
                      </article>
                    );
                  })}
                </div>
                {media.next && (
                  <button
                    className="studio-button"
                    disabled={busy}
                    onClick={() => load(media.next)}
                  >
                    More Instagram media
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
