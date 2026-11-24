-- Run in the protected Supabase SQL Editor as an authorized reporting operator.
-- Returns one aggregate report, with no contact details or identifiers.
with settings as (
  select 'jona-ferreira'::text as artist_id, 'sayyouluvme_2026'::text as campaign,
    (now() at time zone 'America/New_York')::date as through_day,
    array['sayyouluvme', 'shorty', 'accion', 'darte-nota', 'contenta', 'cafe', 'caramelo',
      'viaje-astral', 'lalo', 'sunday', 'fria', 'me-avisas', '12-uvas'] as release_slugs
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
    and coalesce(e.metadata -> 'lastTouch' ->> 'utm_campaign',
                 e.metadata -> 'lastTouch' ->> 'campaign_id') = s.campaign
    and e.created_at >= ((s.through_day - 29)::timestamp at time zone 'America/New_York')
), request_dimensions as (
  select fan_id, email_consent_status, language,
    case when touch ->> 'utm_source' in (
      'instagram', 'facebook', 'tiktok', 'youtube', 'newsletter', 'fan_share', 'whatsapp', 'creator'
    ) then touch ->> 'utm_source' else 'other_or_untagged' end as acquisition_source,
    case when touch ->> 'utm_medium' in ('organic_social', 'paid_social', 'email', 'referral')
      then touch ->> 'utm_medium' else 'other_or_untagged' end as medium,
    case when touch ->> 'utm_content' in (
      'bio', 'jona_stories', 'sbfaraon_stories', 'heart_balloon_reel', 'heart_balloon_reel_01',
      'teaser_01', 'short_01', 'release_announcement', 'studio_session_01', 'dedication_01', 'collab_01'
    ) then touch ->> 'utm_content' else 'other_or_untagged' end as creative,
    case when touch ->> 'landing_path' = '/'
      or touch ->> 'landing_path' = any(array(select '/music/' || unnest(s.release_slugs)))
      then touch ->> 'landing_path' end as landing_path,
    case when touch ->> 'release' = any(s.release_slugs)
      then touch ->> 'release' end as associated_release
  from attributed_requests cross join settings s
), campaign_breakdown as (
  select acquisition_source, medium, creative, landing_path, associated_release, language,
    'la_cultura_wallpapers' as reward_id,
    count(*) as requests, count(distinct fan_id) as contacts,
    count(distinct fan_id) filter (where email_consent_status = 'confirmed') as contacts_with_confirmed_request
  from request_dimensions
  group by acquisition_source, medium, creative, landing_path, associated_release, language
), campaign_totals as (
  select count(*) as requests, count(distinct fan_id) as contacts,
    count(distinct fan_id) filter (where email_consent_status = 'confirmed') as contacts_with_confirmed_request
  from attributed_requests
), totals as (
  select count(*) as captured_contacts,
    count(*) filter (where marketing_status = 'granted' and email_verified_at is not null) as confirmed_marketing_subscribers
  from fan_state
), live_revenue as (
  select p.currency, count(*) as verified_payments,
    count(distinct p.fan_id) as linked_paying_fans,
    count(*) filter (where p.fan_id is null) as guest_payments,
    sum(p.amount_minor) as gross_minor,
    coalesce(sum(p.amount_minor) filter (where p.status = 'refunded'), 0) as full_refunds_minor,
    count(*) filter (where p.status = 'partially_refunded') as payments_with_unknown_refund_amount,
    case when count(*) filter (where p.status = 'partially_refunded') = 0
      then sum(case when p.status = 'paid' then p.amount_minor else 0 end)
    end as net_after_refunds_minor
  from public.purchases p
  join public.checkout_attempts a on a.artist_id = p.artist_id and a.id = p.checkout_attempt_id
  join settings s on s.artist_id = p.artist_id
  where a.payment_mode = 'live'
    and p.paid_at >= ((s.through_day - 29)::timestamp at time zone 'America/New_York')
  group by p.currency
)
select jsonb_build_object(
  'totals', (select to_jsonb(t) from totals t),
  'daily_eastern', (select jsonb_agg(to_jsonb(d) order by d.day) from daily d),
  'campaign', (select campaign from settings),
  'campaign_totals', (select to_jsonb(c) from campaign_totals c),
  'live_revenue_by_currency', coalesce((
    select jsonb_agg(to_jsonb(r) order by currency) from live_revenue r
  ), '[]'::jsonb),
  'campaign_breakdown', coalesce((
    select jsonb_agg(to_jsonb(b) order by acquisition_source, medium, creative, landing_path, associated_release, language)
    from campaign_breakdown b
  ), '[]'::jsonb)
) as fan_acquisition;
