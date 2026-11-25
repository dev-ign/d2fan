import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Lightbulb,
  List,
  Plus,
} from "lucide-react";
import {
  contentFormats,
  contentStatuses,
  easternDay,
  type ContentFields,
  type ContentPage,
  type StudioContentItem,
} from "../../../supabase/shared/studio-content";
import { releases } from "../../data/content";
import { featuredRelease, useStudioRequest } from "./client";
import { Metric, StudioHeading, StudioLoad } from "./StudioViews";
import { ContentEditor, type EditorRecord } from "./ContentEditor";
import { contentIdeas, ideaCopy } from "./contentIdeas";
import "./studio-content.css";

type Filter = keyof typeof contentStatuses | "active";
const atUtc = (day: string) => new Date(`${day}T00:00:00Z`);
function daysAfter(day: string, offset: number) {
  const date = atUtc(day);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const weekStart = (day: string) =>
  daysAfter(day, -((atUtc(day).getUTCDay() + 6) % 7));
const plannerDay = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    atUtc(day),
  );

function newPost(fields: Partial<ContentFields> = {}): EditorRecord {
  return {
    id: crypto.randomUUID(),
    revision: null,
    fields: {
      title: "",
      release_slug: null,
      pillar: "",
      language: "es",
      format: "ig_reel",
      hook: "",
      caption: "",
      cta: "",
      status: "idea",
      planned_on: null,
      published_on: null,
      post_url: null,
      media_url: null,
      ...fields,
    },
  };
}

function PlacementCard({
  item,
  open,
}: {
  item: StudioContentItem;
  open: () => void;
}) {
  const release = releases.find(({ slug }) => slug === item.release_slug);
  return (
    <button className="content-post" type="button" onClick={open}>
      <span className="content-post-format">
        {contentFormats[item.format].label}
      </span>
      <strong>{item.title}</strong>
      {release && <span>{release.title}</span>}
      <span className={`studio-chip content-status-${item.status}`}>
        {contentStatuses[item.status]}
      </span>
    </button>
  );
}

export function StudioContent({ accessToken }: { accessToken: string }) {
  const today = easternDay();
  const currentWeek = weekStart(today);
  const [week, setWeek] = useState(currentWeek);
  const [view, setView] = useState<"week" | "list">("week");
  const [filter, setFilter] = useState<Filter>("active");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<EditorRecord>();
  const [goal, setGoal] = useState(() => {
    try {
      const stored = Number(
        localStorage.getItem("jona:studio-content-weekly-goal"),
      );
      return Number.isInteger(stored) && stored >= 1 && stored <= 7
        ? stored
        : 4;
    } catch {
      return 4;
    }
  });
  const newButton = useRef<HTMLButtonElement>(null);
  const { data, error, retry } = useStudioRequest<ContentPage>(accessToken, {
    view: "content",
    week: view === "week" ? week : null,
    status: view === "week" ? "active" : filter,
    page,
  });

  function chooseView(next: "week" | "list", status: Filter = "active") {
    setPage(0);
    setFilter(status);
    setView(next);
  }
  function changeWeek(next: string) {
    setPage(0);
    setWeek(next);
  }
  function closeEditor() {
    setEditor(undefined);
    requestAnimationFrame(() => newButton.current?.focus());
  }
  function openItem(item: StudioContentItem) {
    const { id, revision, ...fields } = item;
    setEditor({ id, revision, fields });
  }
  function startIdea(idea: (typeof contentIdeas)[number]) {
    setEditor(
      newPost({
        release_slug: featuredRelease.slug,
        title: `${featuredRelease.title} · ${idea.title}`,
        pillar: idea.pillar,
        ...ideaCopy(idea, "es", featuredRelease.title),
      }),
    );
  }
  if (editor)
    return (
      <ContentEditor
        key={editor.id}
        accessToken={accessToken}
        initial={editor}
        close={closeEditor}
        refresh={retry}
      />
    );
  const queue = data?.queue;

  return (
    <div className="content-workspace">
      <div className="content-page-head">
        <StudioHeading title="Content">
          Turn a song into posts, and give listeners a path to La Cultura.
        </StudioHeading>
        <button
          ref={newButton}
          className="studio-button studio-primary"
          onClick={() => setEditor(newPost())}
        >
          <Plus size={17} aria-hidden="true" /> New content
        </button>
      </div>

      {queue && (
        <section className="studio-metrics" aria-label="Content queue">
          <Metric
            label="Ideas"
            value={queue.idea}
            detail="Concepts to develop"
          />
          <Metric label="Drafts" value={queue.draft} detail="In preparation" />
          <Metric
            label="Ready"
            value={queue.ready}
            detail="Ready for native publishing"
          />
          <Metric
            label="Published"
            value={queue.published}
            detail="Recorded in Studio"
          />
        </section>
      )}

      {queue && (
        <section className="content-next" aria-label="Next action">
          <Lightbulb size={19} aria-hidden="true" />
          <p>
            <strong>Next up</strong>{" "}
            {queue.overdue
              ? `${queue.overdue} past their planned date. Review the queue and pick a new date where needed.`
              : queue.ready
                ? "Pick a ready post and prepare its native upload."
                : queue.draft
                  ? "Finish the caption and CTA for one draft."
                  : queue.published
                    ? "Review a published placement’s acquisition before choosing a follow-up."
                    : "Pick a song and use one recording to plan a performance, a story and a follow-up."}
          </p>
          {queue.overdue > 0 ||
          queue.ready > 0 ||
          queue.draft > 0 ||
          queue.published > 0 ? (
            <button
              className="studio-text-link"
              onClick={() =>
                chooseView(
                  "list",
                  queue.overdue
                    ? "active"
                    : queue.ready
                      ? "ready"
                      : queue.draft
                        ? "draft"
                        : "published",
                )
              }
            >
              Open queue <ArrowRight size={15} aria-hidden="true" />
            </button>
          ) : (
            <a className="studio-text-link" href="#content-ideas">
              Find an idea <ArrowRight size={15} aria-hidden="true" />
            </a>
          )}
        </section>
      )}

      <section
        className="studio-panel content-planner"
        aria-labelledby="content-planner"
      >
        <div className="studio-panel-head content-planner-head">
          <div>
            <h2 id="content-planner">Content planner</h2>
            <p>Publication dates use Eastern time.</p>
          </div>
          <div
            className="content-switch"
            role="group"
            aria-label="Planner view"
          >
            <button
              className="studio-button"
              aria-pressed={view === "week"}
              onClick={() => chooseView("week")}
            >
              <CalendarDays size={16} aria-hidden="true" /> Week
            </button>
            <button
              className="studio-button"
              aria-pressed={view === "list"}
              onClick={() => chooseView("list")}
            >
              <List size={16} aria-hidden="true" /> List
            </button>
          </div>
        </div>
        {view === "week" ? (
          <>
            <WeekPlanner
              week={week}
              today={today}
              currentWeek={currentWeek}
              changeWeek={changeWeek}
              data={data}
              goal={goal}
              setGoal={setGoal}
              create={(fields) => setEditor(newPost(fields))}
              open={openItem}
            />
          </>
        ) : (
          <>
            <label className="content-filter">
              Status
              <select
                value={filter}
                onChange={(event) =>
                  chooseView("list", event.currentTarget.value as Filter)
                }
              >
                <option value="active">All active</option>
                {Object.entries(contentStatuses).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {data && data.items.length > 0 && (
              <ul className="content-list">
                {data.items.map((item) => (
                  <li key={item.id}>
                    <PlacementCard item={item} open={() => openItem(item)} />
                    <div className="content-list-date">
                      {item.published_on
                        ? `Published ${plannerDay(item.published_on, { month: "short", day: "numeric", year: "numeric" })}`
                        : item.planned_on
                          ? `Planned ${plannerDay(item.planned_on, { month: "short", day: "numeric", year: "numeric" })}`
                          : "Unplanned"}
                      {item.planned_on &&
                        item.planned_on < today &&
                        !item.published_on &&
                        item.status !== "archived" && (
                          <span className="studio-chip studio-consent-pending">
                            Past planned date
                          </span>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {!data && <StudioLoad error={error} retry={retry} />}
        {data?.items.length === 0 && (
          <p className="studio-note">
            {view === "week"
              ? "No content planned for this week. Choose a day to add a post."
              : "No content matches this status."}
          </p>
        )}
        {data && (data.has_more || page > 0) && (
          <div className="studio-pagination" aria-label="Content pages">
            <button
              className="studio-button"
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
            >
              <ArrowLeft size={15} aria-hidden="true" /> Previous
            </button>
            <span>Page {page + 1}</span>
            <button
              className="studio-button"
              onClick={() => setPage(page + 1)}
              disabled={!data.has_more}
            >
              Next <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>

      <section
        className="studio-panel"
        id="content-ideas"
        aria-labelledby="content-idea-title"
      >
        <div className="studio-panel-head">
          <div>
            <h2 id="content-idea-title">Content ideas</h2>
            <p>
              Start with {featuredRelease.title}, or swap in another song in the
              editor.
            </p>
          </div>
          <ClipboardList size={20} aria-hidden="true" />
        </div>
        <div className="content-ideas">
          {contentIdeas.map((idea) => (
            <button
              className="content-idea"
              key={idea.title}
              onClick={() => startIdea(idea)}
            >
              <strong>{idea.title}</strong>
              <span>{idea.direction}</span>
              <span className="content-idea-action">
                Use idea <ArrowRight size={14} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </section>

      <SocialReadiness />
    </div>
  );
}

function WeekPlanner({
  week,
  today,
  currentWeek,
  data,
  goal,
  setGoal,
  changeWeek,
  create,
  open,
}: {
  week: string;
  today: string;
  currentWeek: string;
  data?: ContentPage;
  goal: number;
  setGoal: (goal: number) => void;
  changeWeek: (week: string) => void;
  create: (fields: Partial<ContentFields>) => void;
  open: (item: StudioContentItem) => void;
}) {
  const dates = Array.from({ length: 7 }, (_, offset) =>
    daysAfter(week, offset),
  );
  return (
    <>
      <div className="content-toolbar">
        <div className="content-week-nav">
          <button
            className="studio-button"
            aria-label="Previous week"
            onClick={() => changeWeek(daysAfter(week, -7))}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <strong aria-live="polite">
            {plannerDay(week, { month: "short", day: "numeric" })} –{" "}
            {plannerDay(dates[6], {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </strong>
          <button
            className="studio-button"
            aria-label="Next week"
            onClick={() => changeWeek(daysAfter(week, 7))}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button
            className="studio-button"
            onClick={() => changeWeek(currentWeek)}
          >
            This week
          </button>
        </div>
        <label className="content-goal" title="Saved in this browser">
          {data ? `${data.week_count} planned · Weekly goal` : "Weekly goal"}
          <select
            aria-label="Weekly post goal"
            value={goal}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              setGoal(next);
              try {
                localStorage.setItem(
                  "jona:studio-content-weekly-goal",
                  String(next),
                );
              } catch {
                /* The goal remains editable for this session. */
              }
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {data && (
        <div className="content-week">
          {dates.map((day) => (
            <section
              className="content-day"
              key={day}
              aria-label={plannerDay(day, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            >
              <div className="content-day-head">
                <time
                  dateTime={day}
                  aria-current={day === today ? "date" : undefined}
                >
                  <span>{plannerDay(day, { weekday: "short" })}</span>
                  <strong>{plannerDay(day, { day: "numeric" })}</strong>
                </time>
                <button
                  className="studio-button content-day-add"
                  aria-label={`Plan content for ${plannerDay(day, { month: "long", day: "numeric" })}`}
                  onClick={() => create({ planned_on: day })}
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
              {releases
                .filter(({ releaseDate }) => releaseDate === day)
                .map((release) => (
                  <button
                    className="content-release-day"
                    type="button"
                    key={release.slug}
                    onClick={() =>
                      create({
                        release_slug: release.slug,
                        planned_on: day,
                        pillar: "Release announcement",
                      })
                    }
                  >
                    <span>Release day</span>
                    <strong>{release.title}</strong>
                  </button>
                ))}
              {data.items
                .filter(({ planned_on }) => planned_on === day)
                .map((item) => (
                  <PlacementCard
                    key={item.id}
                    item={item}
                    open={() => open(item)}
                  />
                ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function SocialReadiness() {
  return (
    <section className="studio-panel" aria-labelledby="content-social-title">
      <div className="studio-panel-head">
        <div>
          <h2 id="content-social-title">Social accounts</h2>
          <p>Publish in the native apps, then record the post here.</p>
        </div>
      </div>
      <ul className="studio-checks">
        <li>
          <div>
            <strong>Instagram</strong>
            <p>
              Confirm a professional account and complete Meta app setup to
              enable authorized reads.
            </p>
          </div>
          <span className="studio-chip studio-consent-pending">
            Setup required
          </span>
        </li>
        <li>
          <div>
            <strong>TikTok</strong>
            <p>
              TikTok Direct Post requires an eligible public-facing use case and
              an app audit.
            </p>
          </div>
          <span className="studio-chip">Manual publishing</span>
        </li>
      </ul>
    </section>
  );
}
