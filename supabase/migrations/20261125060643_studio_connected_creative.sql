create table public.studio_instagram_connections (
  artist_id text primary key,
  attempt uuid,
  state_hash text,
  session_id uuid,
  state_expires timestamptz,
  token_cipher text,
  token_version uuid not null default gen_random_uuid(),
  connected_at timestamptz,
  token_expires timestamptz,
  refreshed_at timestamptz,
  synced_at timestamptz,
  account_id text,
  username text,
  avatar text,
  reauthorize boolean not null default false
);

alter table public.studio_content_placements add column instagram_media_id text;
create unique index studio_placement_instagram_media
  on public.studio_content_placements(artist_id, instagram_media_id)
  where instagram_media_id is not null;

create function public.studio_clear_changed_instagram_media()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.post_url is distinct from old.post_url then
    new.instagram_media_id := null;
  end if;
  return new;
end;
$$;
revoke all on function public.studio_clear_changed_instagram_media() from public, anon, authenticated;
create trigger studio_clear_changed_instagram_media
before update of post_url on public.studio_content_placements
for each row execute function public.studio_clear_changed_instagram_media();

create table public.studio_creative_usage (
  artist_id text not null,
  period date not null,
  attempts integer not null check (attempts between 1 and 100),
  primary key (artist_id, period)
);

create function public.studio_reserve_creative_generation(p_artist text)
returns integer language sql security invoker set search_path = '' as $$
  insert into public.studio_creative_usage(artist_id, period, attempts)
  values (p_artist, date_trunc('month', now() at time zone 'UTC')::date, 1)
  on conflict (artist_id, period) do update
  set attempts = studio_creative_usage.attempts + 1
  where studio_creative_usage.attempts < 100
  returning attempts;
$$;

alter table public.studio_instagram_connections enable row level security;
alter table public.studio_creative_usage enable row level security;
revoke all on public.studio_instagram_connections, public.studio_creative_usage from public, anon, authenticated;
grant select, insert, update, delete on public.studio_instagram_connections to service_role;
grant select, insert, update on public.studio_creative_usage to service_role;
revoke all on function public.studio_reserve_creative_generation(text) from public, anon, authenticated;
grant execute on function public.studio_reserve_creative_generation(text) to service_role;
