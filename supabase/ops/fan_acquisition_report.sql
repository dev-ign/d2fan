-- Run in the protected Supabase SQL Editor as an authorized reporting operator.
-- Returns one aggregate report, with no contact details or identifiers.
with settings as (
  select 'jona-ferreira'::text as artist_id, 'sayyouluvme_2026'::text as campaign,
    (now() at time zone 'America/New_York')::date as through_day
), fan_state as (
  select f.id, f.created_at, f.email_verified_at, f.preferred_language,
    latest.status as marketing_status
  from public.fans f
  join settings s on s.artist_id = f.artist_id
  left join lateral (
    select c.status
    from public.consent_records c
    where c.artist_id = s.artist_id and c.fan_id = f.id
      and c.channel = 'email' and c.purpose = 'marketing'
    order by c.captured_at desc, c.id desc
    limit 1
  ) latest on true
), first_confirmations as (
  select c.fan_id, min(c.captured_at) as confirmed_at
  from public.consent_records c
  join settings s on s.artist_id = c.artist_id
  join fan_state f on f.id = c.fan_id
  where c.channel = 'email' and c.purpose = 'marketing'
    and c.status = 'granted' and f.email_verified_at is not null
  group by c.fan_id
), activity as (
  select (created_at at time zone 'America/New_York')::date as day, 'capture' as kind
  from fan_state
  union all
  select (confirmed_at at time zone 'America/New_York')::date, 'first_confirmation'
  from first_confirmations
), dates as (
  select s.through_day - offset_days as day
  from settings s cross join generate_series(0, 29) as offsets(offset_days)
), daily as (
  select d.day,
    count(*) filter (where a.kind = 'capture') as new_contacts,
    count(*) filter (where a.kind = 'first_confirmation') as first_confirmations
  from dates d left join activity a on a.day = d.day
  group by d.day
), attributed_requests as (
  select e.fan_id, r.email_consent_status,
    case when f.preferred_language in ('en', 'es') then f.preferred_language else 'other' end as language,
    e.metadata -> 'lastTouch' as touch
  from public.fan_events e
  join settings s on s.artist_id = e.artist_id
  join fan_state f on f.id = e.fan_id
  join public.capture_requests r on r.artist_id = e.artist_id
    and r.fan_id = e.fan_id and 'capture:' || r.id::text = e.event_id
  where e.event_type = 'fan_captured'
    and e.metadata ->> 'rewardId' = 'la_cultura_wallpapers'
    and e.metadata -> 'lastTouch' ->> 'utm_campaign' = s.campaign
), request_dimensions as (
  select fan_id, email_consent_status, language,
    case when touch ->> 'utm_source' in (
      'instagram', 'facebook', 'tiktok', 'youtube', 'newsletter', 'fan_share'
    ) then touch ->> 'utm_source' else 'other_or_untagged' end as acquisition_source,
    case touch ->> 'utm_content'
      when 'jona_stories' then 'jona_stories'
      when 'sbfaraon_stories' then 'sbfaraon_stories'
      else 'other_or_untagged'
    end as creative,
    case when touch ->> 'release' in (
      'sayyouluvme', 'shorty', 'accion', 'darte-nota', 'contenta', 'cafe', 'caramelo',
      'viaje-astral', 'lalo', 'sunday', 'fria', 'me-avisas', '12-uvas'
    ) then touch ->> 'release' else 'other_or_untagged' end as associated_release
  from attributed_requests
), campaign_breakdown as (
  select acquisition_source, creative, associated_release, language,
    'la_cultura_wallpapers' as reward_id,
    count(*) as requests, count(distinct fan_id) as contacts,
    count(distinct fan_id) filter (where email_consent_status = 'confirmed') as contacts_with_confirmed_request
  from request_dimensions
  group by acquisition_source, creative, associated_release, language
), totals as (
  select count(*) as captured_contacts,
    count(*) filter (where marketing_status = 'granted' and email_verified_at is not null) as confirmed_marketing_subscribers
  from fan_state
)
select jsonb_build_object(
  'totals', (select to_jsonb(t) from totals t),
  'daily_eastern', (select jsonb_agg(to_jsonb(d) order by d.day) from daily d),
  'campaign', (select campaign from settings),
  'campaign_breakdown', coalesce((
    select jsonb_agg(to_jsonb(b) order by acquisition_source, creative, associated_release, language)
    from campaign_breakdown b
  ), '[]'::jsonb)
) as fan_acquisition;
