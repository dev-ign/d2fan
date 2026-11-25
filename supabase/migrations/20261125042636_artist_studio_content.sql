-- Studio uses civil publication dates in America/New_York. An actual
-- publication is an owner-reported fact, independent of its planned date.
create table public.studio_content_ideas (
  artist_id text not null,
  id uuid not null,
  release_slug text,
  campaign_id text,
  title text not null check (length(title) between 1 and 120),
  pillar text not null check (length(pillar) <= 60),
  language text not null check (language in ('en', 'es', 'bilingual')),
  hook text not null check (length(hook) <= 240),
  caption text not null check (length(caption) <= 2200),
  cta text not null check (length(cta) <= 240),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (artist_id, id),
  check ((release_slug is null) = (campaign_id is null))
);

create table public.studio_content_placements (
  artist_id text not null,
  id uuid not null,
  idea_id uuid not null,
  format text not null check (format in ('ig_reel', 'ig_story', 'ig_feed', 'tt_video', 'tt_photo', 'yt_short')),
  status text not null check (status in ('idea', 'draft', 'ready', 'published', 'archived')),
  planned_on date,
  published_on date,
  post_url text check (length(post_url) <= 1024 and post_url like 'https://%'),
  media_url text check (length(media_url) <= 2048 and media_url like 'https://%'),
  primary key (artist_id, id),
  foreign key (artist_id, idea_id) references public.studio_content_ideas (artist_id, id),
  check ((published_on is null) = (post_url is null)),
  check (status = 'archived' or ((status = 'published') = (published_on is not null)))
);

create index studio_content_week on public.studio_content_placements (artist_id, planned_on, id);
create index studio_content_idea on public.studio_content_placements (artist_id, idea_id);
create index studio_content_capture_tag
on public.fan_events (artist_id, (metadata -> 'lastTouch' ->> 'utm_content'))
where event_type = 'fan_captured' and metadata ->> 'rewardId' = 'la_cultura_wallpapers'
  and left(metadata -> 'lastTouch' ->> 'utm_content', 7) = 'studio_';

alter table public.studio_content_ideas enable row level security;
alter table public.studio_content_placements enable row level security;
revoke all on public.studio_content_ideas, public.studio_content_placements from public, anon, authenticated;
grant select, insert, update on public.studio_content_ideas, public.studio_content_placements to service_role;

create function public.artist_studio_content_save(
  p_artist text, p_id uuid, p_revision integer, p_fields jsonb
)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  idea public.studio_content_ideas;
begin
  if p_revision is null then
    insert into public.studio_content_ideas
      (artist_id, id, release_slug, campaign_id, title, pillar, language, hook, caption, cta)
    values (p_artist, p_id, p_fields ->> 'release_slug', p_fields ->> 'campaign_id',
      p_fields ->> 'title', p_fields ->> 'pillar', p_fields ->> 'language',
      p_fields ->> 'hook', p_fields ->> 'caption', p_fields ->> 'cta')
    on conflict (artist_id, id) do nothing returning * into idea;
    if not found then return false; end if;

    insert into public.studio_content_placements
      (artist_id, id, idea_id, format, status, planned_on, published_on, post_url, media_url)
    values (p_artist, p_id, p_id, p_fields ->> 'format', p_fields ->> 'status',
      (p_fields ->> 'planned_on')::date, (p_fields ->> 'published_on')::date,
      p_fields ->> 'post_url', p_fields ->> 'media_url');
  else
    -- A revision protects both rows from stale tabs and concurrent writes.
    update public.studio_content_ideas i set
      release_slug = p_fields ->> 'release_slug', campaign_id = p_fields ->> 'campaign_id',
      title = p_fields ->> 'title', pillar = p_fields ->> 'pillar', language = p_fields ->> 'language',
      hook = p_fields ->> 'hook', caption = p_fields ->> 'caption', cta = p_fields ->> 'cta',
      revision = i.revision + 1, updated_at = now()
    from public.studio_content_placements p
    where i.artist_id = p_artist and i.revision = p_revision
      and p.artist_id = i.artist_id and p.idea_id = i.id and p.id = p_id
      and (p.published_on is null or (
        p_fields ->> 'published_on' is not null
        and p.format = p_fields ->> 'format'
        and i.release_slug is not distinct from (p_fields ->> 'release_slug')
      ))
    returning i.* into idea;
    if not found then return false; end if;

    update public.studio_content_placements p set
      format = p_fields ->> 'format', status = p_fields ->> 'status',
      planned_on = (p_fields ->> 'planned_on')::date,
      published_on = (p_fields ->> 'published_on')::date,
      post_url = p_fields ->> 'post_url', media_url = p_fields ->> 'media_url'
    where p.artist_id = p_artist and p.id = p_id;
  end if;
  return true;
end;
$$;

create function public.artist_studio_content_list(
  p_artist text, p_week date, p_status text, p_limit integer, p_offset integer
)
returns jsonb language sql stable security invoker set search_path = '' as $$
with filtered as (
  select p.id, i.revision, i.title, i.release_slug, i.pillar, i.language, i.hook, i.caption, i.cta,
    p.format, p.status, p.planned_on, p.published_on, p.post_url, p.media_url,
    i.updated_at
  from public.studio_content_placements p
  join public.studio_content_ideas i on i.artist_id = p.artist_id and i.id = p.idea_id
  where p.artist_id = p_artist
    and (p.status = p_status or (p_status = 'active' and p.status <> 'archived'))
    and (p_week is null or (p.planned_on >= p_week and p.planned_on < p_week + 7))
  order by p.planned_on nulls last, i.updated_at desc, p.id
  limit least(greatest(p_limit, 1), 50) + 1 offset greatest(p_offset, 0)
), queue as (
  select count(*) filter (where status <> 'archived'
      and planned_on >= p_week and planned_on < p_week + 7) as week_count,
    count(*) filter (where status = 'idea') as idea,
    count(*) filter (where status = 'draft') as draft,
    count(*) filter (where status = 'ready') as ready,
    count(*) filter (where status = 'published') as published,
    count(*) filter (where status in ('idea', 'draft', 'ready')
      and planned_on < (now() at time zone 'America/New_York')::date) as overdue
  from public.studio_content_placements
  where artist_id = p_artist
)
select jsonb_build_object(
  'items', coalesce((select jsonb_agg(to_jsonb(f) - 'updated_at'
    order by planned_on nulls last, updated_at desc, id) from (
      select * from filtered order by planned_on nulls last, updated_at desc, id
      limit least(greatest(p_limit, 1), 50)
    ) f), '[]'::jsonb),
  'has_more', (select count(*) > least(greatest(p_limit, 1), 50) from filtered),
  'week_count', (select week_count from queue),
  'queue', (select to_jsonb(queue) - 'week_count' from queue)
);
$$;

create function public.artist_studio_content_acquisition(p_artist text, p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
select jsonb_build_object('requests', count(e.event_id), 'contacts', count(distinct e.fan_id))
from public.studio_content_placements p
join public.studio_content_ideas i on i.artist_id = p.artist_id and i.id = p.idea_id
left join public.fan_events e on e.artist_id = p.artist_id
  and e.event_type = 'fan_captured' and e.metadata ->> 'rewardId' = 'la_cultura_wallpapers'
  and left(e.metadata -> 'lastTouch' ->> 'utm_content', 7) = 'studio_'
  and e.metadata -> 'lastTouch' ->> 'utm_content' =
    'studio_' || translate(replace(p.id::text, '-', ''), '0123456789abcdef', 'abcdefghijklmnop')
  and e.metadata -> 'lastTouch' ->> 'utm_campaign' = i.campaign_id
  and e.metadata -> 'lastTouch' ->> 'utm_source' = case split_part(p.format, '_', 1)
    when 'ig' then 'instagram' when 'tt' then 'tiktok' when 'yt' then 'youtube' end
  and e.metadata -> 'lastTouch' ->> 'utm_medium' = 'organic_social'
  and e.metadata -> 'lastTouch' ->> 'landing_path' = '/music/' || i.release_slug
  and e.created_at >= i.created_at
where p.artist_id = p_artist and p.id = p_id and i.campaign_id is not null
group by p.id;
$$;

revoke all on function public.artist_studio_content_save(text, uuid, integer, jsonb),
  public.artist_studio_content_list(text, date, text, integer, integer),
  public.artist_studio_content_acquisition(text, uuid) from public, anon, authenticated;
grant execute on function public.artist_studio_content_save(text, uuid, integer, jsonb),
  public.artist_studio_content_list(text, date, text, integer, integer),
  public.artist_studio_content_acquisition(text, uuid) to service_role;
