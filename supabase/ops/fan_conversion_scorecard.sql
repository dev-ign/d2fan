-- Run as an authorized reporting operator. Returns aggregate counts for the
-- last complete Monday-to-Monday UTC week. Set period_end to rerun a past week.
with period as (
  select date_trunc('week', now(), 'UTC') as period_end
), reward_requests as (
  select r.fan_id, case
    when r.email_consent_status is not null or j.payload -> 'confirm' = 'true'::jsonb
      then 'marketing_opt_in'
    when j.payload -> 'confirm' = 'false'::jsonb then 'reward_only'
    else 'intent_unknown'
  end as metric
  from public.capture_requests r
  join public.fan_events e
    on e.event_id = 'capture:' || r.id::text and e.artist_id = r.artist_id
  left join public.delivery_jobs j
    on j.dedupe_key = e.event_id and j.artist_id = r.artist_id and j.kind = 'capture'
  cross join period p
  where r.artist_id = 'jona-ferreira' and e.event_type = 'fan_captured'
    and e.source = 'stay_close'
    and r.created_at >= p.period_end - interval '168 hours' and r.created_at < p.period_end
), first_grants as (
  select c.fan_id, min(c.captured_at) as first_grant_at
  from public.consent_records c
  join public.fans f on f.artist_id = c.artist_id and f.id = c.fan_id
  where c.artist_id = 'jona-ferreira' and c.channel = 'email'
    and c.purpose = 'marketing' and c.status = 'granted'
    and f.email_verified_at is not null
  group by c.fan_id
), outcomes as (
  select fan_id, metric from reward_requests
  union all
  select g.fan_id, 'new_confirmed'
  from first_grants g cross join period p
  where g.first_grant_at >= p.period_end - interval '168 hours' and g.first_grant_at < p.period_end
  union all
  select c.fan_id, 'withdrawal'
  from public.consent_records c cross join period p
  where c.artist_id = 'jona-ferreira' and c.channel = 'email'
    and c.purpose = 'marketing' and c.status = 'revoked'
    and c.captured_at >= p.period_end - interval '168 hours' and c.captured_at < p.period_end
), attributed as (
  select o.fan_id, o.metric,
    case when f.first_touch_release_slug in (
      'shorty', 'accion', 'darte-nota', 'contenta', 'cafe', 'caramelo',
      'viaje-astral', 'lalo', 'sunday', 'fria', 'me-avisas', '12-uvas'
    ) then f.first_touch_release_slug else 'unattributed' end as first_release,
    case lower(coalesce(nullif(f.first_touch_utm ->> 'utm_source', ''), ''))
      when 'instagram' then 'instagram'
      when 'facebook' then 'facebook'
      when 'youtube' then 'youtube'
      when 'tiktok' then 'tiktok'
      when 'spotify' then 'spotify'
      when 'google' then 'google'
      when '' then 'untagged'
      else 'other_campaign'
    end as first_source
  from outcomes o join public.fans f on f.id = o.fan_id and f.artist_id = 'jona-ferreira'
)
select
  (select period_end - interval '168 hours' from period) as period_start,
  (select period_end from period) as period_end,
  coalesce(first_release, 'all') as first_release,
  coalesce(first_source, 'all') as first_source,
  count(*) filter (where metric in ('reward_only', 'marketing_opt_in', 'intent_unknown')) as reward_requests,
  count(*) filter (where metric = 'reward_only') as reward_only_requests,
  count(distinct fan_id) filter (where metric = 'reward_only') as reward_only_requesters,
  count(*) filter (where metric = 'marketing_opt_in') as marketing_opt_in_requests,
  count(*) filter (where metric = 'intent_unknown') as unknown_intent_requests,
  count(*) filter (where metric = 'new_confirmed') as new_confirmed_marketing_fans,
  count(*) filter (where metric = 'withdrawal') as consent_withdrawals
from attributed
group by grouping sets ((), (first_release, first_source))
order by grouping(first_release) desc, first_release, first_source;
