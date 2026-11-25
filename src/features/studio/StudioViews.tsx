import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Headphones,
  Search,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { artist, releases } from "../../data/content";
import { catalog } from "../../config/runtime";
import { getStreamingLinks } from "../../config/streaming";
import type { MusicRelease } from "../../domain/types";
import { campaignLink } from "../../data/campaignLink";
import {
  getReleaseUrl,
  resolveReleasePublication,
} from "../../data/releaseMetadata";
import {
  studioPageSize,
  type StudioFans,
  type StudioReadiness,
  type StudioReport,
} from "../../../supabase/shared/studio";
import { featuredRelease, useStudioRequest } from "./client";

const int = new Intl.NumberFormat("en-US");
const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "America/New_York",
});
const day = (value: string) =>
  date.format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "code",
  }).format(value / 100);
}

export function StudioHeading({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <header className="studio-heading">
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  );
}

export function StudioLoad({
  error,
  retry,
}: {
  error?: string;
  retry?: () => void;
}) {
  if (!error)
    return (
      <p className="studio-panel studio-empty" role="status">
        Loading Studio data…
      </p>
    );
  return (
    <div className="studio-panel studio-empty" role="alert">
      <p>
        {error === "unauthenticated"
          ? "Your session needs to be refreshed. Sign in again if retrying fails."
          : "Studio data is unavailable. Try again shortly."}
      </p>
      {retry && (
        <button className="studio-button" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <div className="studio-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function Overview({ report }: { report: StudioReport }) {
  const gross = report.live_revenue_by_currency;
  const peak = Math.max(
    1,
    ...report.daily_eastern.map(({ new_contacts }) => new_contacts),
  );
  return (
    <>
      <StudioHeading title="Overview">
        Audience and revenue for Jona Ferreira.
      </StudioHeading>
      <div className="studio-metrics">
        <Metric
          label="New contacts"
          value={int.format(report.last_30_days.new_contacts)}
          detail={`${int.format(report.totals.captured_contacts)} all time`}
        />
        <Metric
          label="Confirmed subscribers"
          value={int.format(report.totals.confirmed_marketing_subscribers)}
          detail="Current verified permission"
        />
        <Metric
          label="Verified payments"
          value={int.format(
            gross.reduce((n, row) => n + row.verified_payments, 0),
          )}
          detail="Live ledger · last 30 days"
        />
        <Metric
          label="Gross payments"
          value={
            gross.length === 1
              ? money(gross[0].gross_minor, gross[0].currency)
              : gross.length
                ? "By currency"
                : money(0, catalog.currency)
          }
          detail={
            gross.length
              ? "Before refunds and fees"
              : "No verified payments in this period"
          }
        />
      </div>
      <div className="studio-overview-grid">
        <section className="studio-panel" aria-labelledby="activity-title">
          <div className="studio-panel-head">
            <div>
              <h2 id="activity-title">Fan acquisition</h2>
              <p>New contacts by day · Eastern time</p>
            </div>
            <Link className="studio-text-link" to="/fans">
              Fan directory <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="studio-chart" aria-hidden="true">
            {report.daily_eastern.map((row) => (
              <div
                className="studio-chart-slot"
                key={row.day}
                title={`${day(row.day)} · ${row.new_contacts} new contacts`}
              >
                <span
                  style={{ height: `${(row.new_contacts / peak) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="studio-chart-foot">
            <span>
              {report.daily_eastern[0] && day(report.daily_eastern[0].day)}
            </span>
            <span>
              {report.daily_eastern.at(-1) &&
                day(report.daily_eastern.at(-1)!.day)}
            </span>
          </div>
          <p className="studio-note">
            {int.format(report.last_30_days.first_confirmations)} first email
            confirmations in the last 30 days.
          </p>
        </section>
        <section
          className="studio-panel studio-feature"
          aria-labelledby="featured-title"
        >
          <div className="studio-panel-head">
            <div>
              <h2 id="featured-title">Featured release</h2>
              <p>{featuredRelease.campaignId ?? featuredRelease.slug}</p>
            </div>
            <Headphones size={20} />
          </div>
          <img
            src={featuredRelease.coverArt}
            width="600"
            height="600"
            alt={`${featuredRelease.title} cover`}
          />
          <div>
            <h3>{featuredRelease.title}</h3>
            <p>{featuredRelease.artistCredit ?? artist.displayName}</p>
            <p>
              {int.format(report.campaign_totals.requests)} campaign requests
              from {int.format(report.campaign_totals.contacts)} contacts
            </p>
            <p>
              {int.format(report.reward_requests_30_days)} La Cultura requests
              across all campaigns in the last 30 days
            </p>
          </div>
          <Link className="studio-button" to="/campaigns">
            View campaign <ArrowUpRight size={16} />
          </Link>
        </section>
      </div>
    </>
  );
}

const consentLabel = {
  confirmed: "Confirmed",
  pending: "Pending",
  revoked: "Unsubscribed",
  unverified: "Unverified",
  none: "No opt-in",
};

export function Fans({ accessToken }: { accessToken: string }) {
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState({ search: "", page: 0 });
  const { data, error, retry } = useStudioRequest<StudioFans>(accessToken, {
    view: "fans",
    ...selection,
  });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / studioPageSize));

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelection({ search: draft.trim(), page: 0 });
  }

  return (
    <>
      <StudioHeading title="Fan directory">
        Search your contacts and check their current email consent.
      </StudioHeading>
      <section className="studio-panel" aria-label="Fan directory">
        <form className="studio-search" onSubmit={search}>
          <label>
            <span>Email address</span>
            <input
              type="search"
              placeholder="Find an email"
              value={draft}
              maxLength={254}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button className="studio-button" type="submit">
            <Search size={16} /> Search
          </button>
          {selection.search && (
            <button
              className="studio-text-link"
              type="button"
              onClick={() => {
                setDraft("");
                setSelection({ search: "", page: 0 });
              }}
            >
              Clear
            </button>
          )}
        </form>
        {!data ? (
          <StudioLoad error={error} retry={retry} />
        ) : (
          <>
            <p className="studio-note" role="status">
              {int.format(data.total)}{" "}
              {data.total === 1 ? "contact" : "contacts"}
            </p>
            {data.items.length ? (
              <div
                className="studio-table-scroll"
                role="region"
                aria-label="Contacts table"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Email</th>
                      <th scope="col">Consent</th>
                      <th scope="col">Language</th>
                      <th scope="col">Acquisition source</th>
                      <th scope="col">First release</th>
                      <th scope="col">Recent release</th>
                      <th scope="col">Joined</th>
                      <th scope="col">Last updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((fan) => (
                      <tr key={fan.id}>
                        <td>{fan.email}</td>
                        <td>
                          <span
                            className={`studio-chip studio-consent-${fan.consent}`}
                          >
                            {consentLabel[fan.consent]}
                          </span>
                        </td>
                        <td>{fan.language === "es" ? "Spanish" : "English"}</td>
                        <td>{fan.acquisition_source ?? "Unavailable"}</td>
                        <td>
                          {releases.find(
                            ({ slug }) => slug === fan.first_release,
                          )?.title ?? "Unavailable"}
                        </td>
                        <td>
                          {releases.find(
                            ({ slug }) => slug === fan.recent_release,
                          )?.title ?? "Unavailable"}
                        </td>
                        <td>{day(fan.created_at)}</td>
                        <td>{day(fan.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="studio-empty">No contacts match this search.</p>
            )}
            <div className="studio-pagination" aria-label="Fan directory pages">
              <button
                className="studio-button"
                disabled={selection.page === 0}
                onClick={() =>
                  setSelection({ ...selection, page: selection.page - 1 })
                }
              >
                Previous
              </button>
              <span>
                Page {selection.page + 1} of {pages}
              </span>
              <button
                className="studio-button"
                disabled={selection.page + 1 >= pages}
                onClick={() =>
                  setSelection({ ...selection, page: selection.page + 1 })
                }
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

function GatedPreviewStatus({ url }: { url: string }) {
  const [available, setAvailable] = useState<boolean>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    })
      .then((response) => {
        if (!controller.signal.aborted)
          setAvailable(
            response.ok &&
              response.headers.get("Content-Type")?.startsWith("audio/") ===
                true,
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailable(false);
      });
    return () => controller.abort();
  }, [url]);
  return (
    <>
      {available === undefined
        ? "Checking audio preview…"
        : available
          ? "Audio preview available"
          : "Audio preview unavailable"}
    </>
  );
}

function ReleaseAvailability({ release }: { release: MusicRelease }) {
  const destinations = getStreamingLinks(release);
  return (
    <>
      <p>
        {release.publicationStatus === "upcoming" ? (
          "Audio embargoed"
        ) : release.previewUrl?.startsWith("/api/") ? (
          <GatedPreviewStatus url={release.previewUrl} />
        ) : release.previewUrl ? (
          "Audio preview listed"
        ) : (
          "Audio preview unavailable"
        )}
      </p>
      <p>
        {destinations.length
          ? destinations.map(({ href, name }) => (
              <a className="studio-destination" key={href} href={href}>
                {name}
              </a>
            ))
          : "Streaming destinations unavailable"}
      </p>
    </>
  );
}

export function Releases({ asOf }: { asOf?: string }) {
  return (
    <>
      <StudioHeading title="Release catalog">
        Your music, publication dates, and campaign links.
      </StudioHeading>
      <section className="studio-panel" aria-label="Catalog releases">
        <ul className="studio-release-list">
          {releases.map((entry) => {
            const release = resolveReleasePublication(
              entry,
              asOf ? Date.parse(asOf) : undefined,
            );
            return (
              <li key={release.slug}>
                <img
                  src={release.coverArt}
                  width="56"
                  height="56"
                  alt=""
                  loading="lazy"
                />
                <div>
                  <h2>{release.title}</h2>
                  <p>
                    {release.artistCredit ?? artist.displayName} ·{" "}
                    {day(release.releaseDate)}
                  </p>
                  <ReleaseAvailability release={release} />
                </div>
                <span className="studio-chip">
                  {release.publicationStatus === "upcoming"
                    ? "Scheduled"
                    : "Released"}
                </span>
                <Link
                  className="studio-text-link"
                  to={`/campaigns?release=${release.slug}`}
                >
                  Campaign <ArrowUpRight size={15} />
                </Link>
                <a
                  className="studio-icon-link"
                  href={getReleaseUrl(release.slug)}
                  aria-label={`Open public page for ${release.title}`}
                >
                  <ExternalLink size={17} />
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

export function Campaigns({ accessToken }: { accessToken: string }) {
  const [params, setParams] = useSearchParams();
  const release =
    releases.find(({ slug }) => slug === params.get("release")) ??
    featuredRelease;
  const campaign = release.campaignId ?? release.slug;
  const [source, setSource] = useState("instagram");
  const [medium, setMedium] = useState("organic_social");
  const [creative, setCreative] = useState("");
  const [term, setTerm] = useState("");
  const [copy, setCopy] = useState<{ url: string; success: boolean }>();
  const url = campaignLink(
    release.slug,
    source,
    medium,
    creative.trim(),
    term.trim(),
  );
  const { data, error, retry } = useStudioRequest<StudioReport>(accessToken, {
    view: "report",
    campaign,
  });

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopy({ url, success: true });
    } catch {
      setCopy({ url, success: false });
    }
  }

  return (
    <>
      <StudioHeading title="Campaigns">
        Create tagged release links and see which placements bring fans to La
        Cultura.
      </StudioHeading>
      <section className="studio-panel">
        <div className="studio-panel-head">
          <div>
            <h2>Campaign link</h2>
            <p>
              Choose a release and give each placement its own creative label.
            </p>
          </div>
        </div>
        <div className="studio-link-fields">
          <label>
            Release
            <select
              value={release.slug}
              onChange={(event) => setParams({ release: event.target.value })}
            >
              {releases.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              {[
                "instagram",
                "facebook",
                "tiktok",
                "youtube",
                "newsletter",
                "whatsapp",
                "creator",
                "fan_share",
              ].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Medium
            <select
              value={medium}
              onChange={(event) => setMedium(event.target.value)}
            >
              {["organic_social", "paid_social", "email", "referral"].map(
                (option) => (
                  <option key={option}>{option}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Creative
            <input
              value={creative}
              placeholder="studio_session_01"
              maxLength={100}
              onChange={(event) => setCreative(event.target.value)}
            />
          </label>
          <label>
            Campaign term <small>Optional</small>
            <input
              value={term}
              maxLength={100}
              onChange={(event) => setTerm(event.target.value)}
            />
          </label>
        </div>
        <div className="studio-copy">
          <input
            aria-label="Campaign URL"
            value={url ?? ""}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            className="studio-button studio-primary"
            disabled={!url}
            onClick={() => void copyLink()}
          >
            {copy?.url === url && copy.success ? (
              <Check size={16} />
            ) : (
              <Copy size={16} />
            )}{" "}
            Copy link
          </button>
        </div>
        {!url && (
          <p className="studio-error" role="status">
            Use a campaign label without contact details or URLs.
          </p>
        )}
        <p className="studio-note" role="status">
          {copy?.url === url
            ? copy.success
              ? "Link copied."
              : "Select the URL to copy it manually."
            : ""}
        </p>
      </section>
      <section className="studio-panel">
        <div className="studio-panel-head">
          <div>
            <h2>Campaign performance</h2>
            <p>{campaign} · Last 30 Eastern calendar days</p>
          </div>
        </div>
        {!data ? (
          <StudioLoad error={error} retry={retry} />
        ) : (
          <>
            <div className="studio-metrics studio-metrics-three">
              <Metric
                label="Reward requests"
                value={data.campaign_totals.requests}
                detail="Captured La Cultura requests"
              />
              <Metric
                label="Distinct contacts"
                value={data.campaign_totals.contacts}
                detail="Deduplicated across placements"
              />
              <Metric
                label="Confirmed requests"
                value={data.campaign_totals.contacts_with_confirmed_request}
                detail="Contacts with a confirmed request"
              />
            </div>
            {data.campaign_breakdown.length ? (
              <div
                className="studio-table-scroll"
                role="region"
                aria-label="Campaign breakdown"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Medium</th>
                      <th scope="col">Creative</th>
                      <th scope="col">Landing</th>
                      <th scope="col">Signup release</th>
                      <th scope="col">Language</th>
                      <th scope="col">Requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaign_breakdown.map((row, index) => (
                      <tr key={index}>
                        <td>{row.acquisition_source}</td>
                        <td>{row.medium}</td>
                        <td>{row.creative}</td>
                        <td>{row.landing_path ?? "—"}</td>
                        <td>{row.associated_release ?? "—"}</td>
                        <td>{row.language.toUpperCase()}</td>
                        <td>{row.requests}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="studio-empty">
                No captured requests for this campaign in the selected period.
              </p>
            )}
            <p className="studio-note">
              Traffic and streaming totals are unavailable from the capture
              ledger.
            </p>
          </>
        )}
      </section>
    </>
  );
}

export function Revenue({ report }: { report: StudioReport }) {
  const revenue = report.live_revenue_by_currency.length
    ? report.live_revenue_by_currency
    : [
        {
          currency: catalog.currency,
          verified_payments: 0,
          linked_paying_fans: 0,
          guest_payments: 0,
          gross_minor: 0,
          full_refunds_minor: 0,
          payments_with_unknown_refund_amount: 0,
          net_after_refunds_minor: 0,
        },
      ];
  return (
    <>
      <StudioHeading title="Verified revenue">
        Fulfilled live payments in the last 30 Eastern calendar days.
      </StudioHeading>
      {revenue.map((row) => (
        <section className="studio-panel" key={row.currency}>
          <div className="studio-panel-head">
            <div>
              <h2>{row.currency.toUpperCase()}</h2>
              <p>
                {int.format(row.verified_payments)} verified payments ·{" "}
                {int.format(row.guest_payments)} guest payments ·{" "}
                {int.format(row.linked_paying_fans)} linked paying fans
              </p>
            </div>
            <ArrowDownRight size={20} />
          </div>
          <div className="studio-metrics studio-metrics-three">
            <Metric
              label="Gross payments"
              value={money(row.gross_minor, row.currency)}
              detail="Verified ledger"
            />
            <Metric
              label="Full refunds"
              value={money(row.full_refunds_minor, row.currency)}
              detail="Recorded full-refund amounts"
            />
            <Metric
              label="Net after refunds"
              value={
                row.net_after_refunds_minor === null
                  ? "Unavailable"
                  : money(row.net_after_refunds_minor, row.currency)
              }
              detail={
                row.payments_with_unknown_refund_amount
                  ? "Partial-refund amounts are missing"
                  : "Before processing fees"
              }
            />
          </div>
        </section>
      ))}
      <p className="studio-note">
        Processing fees, payouts, distinct guests, and campaign-level revenue
        require additional provider evidence.
      </p>
    </>
  );
}

export function Readiness({
  readiness,
  report,
}: {
  readiness: StudioReadiness;
  report?: StudioReport;
}) {
  const ops = report?.operations;
  const checks = [
    {
      name: "Guest Support",
      enabled: readiness.supportEnabled,
      detail:
        "Server admission. Verify merchant identity, payment support, and webhook settlement in Stripe.",
    },
    {
      name: "Paid Vault",
      enabled: readiness.vaultEnabled,
      detail:
        "Server commerce setting. Confirm offer availability and fulfillment before opening.",
    },
    {
      name: "Requested reward email",
      enabled: readiness.rewardEmailEnabled,
      detail: ops
        ? `${ops.reward_email_accepted} accepted by the provider and ${ops.reward_email_failed} failed over 30 days. Inbox delivery needs provider evidence.`
        : "Delivery counts are currently unavailable.",
    },
    {
      name: "Marketing email",
      enabled: readiness.marketingEmailEnabled,
      detail:
        "Server sending setting. Verify sender, mailing address, and send-time consent before a campaign.",
    },
  ];
  return (
    <>
      <StudioHeading title="Operational readiness">
        Current server settings and checks that require an operator.
      </StudioHeading>
      <section
        className="studio-panel"
        aria-label="Operational readiness checks"
      >
        <ul className="studio-checks">
          {checks.map((check) => (
            <li key={check.name}>
              <div>
                <h2>{check.name}</h2>
                <p>{check.detail}</p>
              </div>
              <span
                className={`studio-chip ${check.enabled ? "studio-consent-confirmed" : ""}`}
              >
                {check.enabled ? "Enabled" : "Closed"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
