begin;

-- Only a new explicit capture can create a confirmation authorization. Existing
-- requests stay NULL: legacy links cannot be safely associated with an opt-in.
alter table public.capture_requests add column email_consent_status text
 check (email_consent_status in ('pending','confirmed','revoked'));

create or replace function public.capture_fan(p_artist text,p_request uuid,p_email text,p_language text,p_source text,p_first jsonb,p_last jsonb,p_opt_in boolean,p_fingerprint text)
returns uuid language plpgsql security definer set search_path='' as $$
declare f uuid; prior public.capture_requests; latest_status text; latest_at timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.capture_requests where id=p_request;
 if found then
  if prior.fingerprint <> p_fingerprint or prior.artist_id <> p_artist then raise exception 'request_conflict'; end if;
  return prior.fan_id;
 end if;
 -- The unique identity upsert also locks an existing fan. A first capture must
 -- establish that same identity before it can create any consent authorization.
 insert into public.fans(artist_id,email_normalized,preferred_language,first_touch_source,first_touch_release_slug,first_touch_utm,last_touch_utm)
 values(p_artist,p_email,p_language,p_source,p_first->>'release',p_first,p_last)
 on conflict(artist_id,email_normalized) do update set last_touch_utm=case when excluded.last_touch_utm='{}'::jsonb then fans.last_touch_utm else excluded.last_touch_utm end,
 first_touch_utm=case when fans.first_touch_utm='{}'::jsonb then excluded.first_touch_utm else fans.first_touch_utm end,
 first_touch_release_slug=coalesce(fans.first_touch_release_slug,excluded.first_touch_release_slug),updated_at=now()
 returning id into f;
 insert into public.capture_requests(id,artist_id,fan_id,fingerprint,created_at,email_consent_status)
 values(p_request,p_artist,f,p_fingerprint,now(),case when p_opt_in then 'pending' end);
 insert into public.fan_events(artist_id,fan_id,event_type,event_id,source,release_slug)
 values(p_artist,f,'fan_captured','capture:'||p_request,p_source,p_first->>'release');
 select status,captured_at into latest_status,latest_at from public.consent_records
 where fan_id=f and channel='email' and purpose='marketing' order by captured_at desc,id desc limit 1;
 if p_opt_in and latest_status is distinct from 'granted' then
  insert into public.consent_records(artist_id,fan_id,channel,purpose,status,consent_text_version,capture_source,captured_at)
  values(p_artist,f,'email','marketing','pending','2026-10-23',p_source,
   greatest(clock_timestamp(),latest_at+interval '1 microsecond'));
 end if;
 if p_source='stay_close' or p_opt_in then
  insert into public.delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload)
  values(p_artist,f,'capture','capture:'||p_request,jsonb_build_object('confirm',p_opt_in,'magnet',p_source='stay_close')) on conflict do nothing;
 end if;
 return f;
end $$;

-- Four explicit arguments distinguish this RPC from the legacy unsubscribe
-- signature, including while PostgREST still has its old schema cache.
create function public.update_email_consent(p_artist text,p_fan uuid,p_status text,p_request uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare latest_status text; latest_at timestamptz; changed_at timestamptz;
begin
 if p_status is null or p_status not in ('granted','revoked') then raise exception 'invalid_status'; end if;
 -- All authorization creation, consumption and invalidation serialize here.
 -- Never create a fan or a consent row on behalf of an unknown token subject.
 perform 1 from public.fans where id=p_fan and artist_id=p_artist for update;
 if not found then return false; end if;
 if p_status='granted' then
  update public.capture_requests set email_consent_status='confirmed'
  where id=p_request and artist_id=p_artist and fan_id=p_fan
   and email_consent_status='pending'
   and date_trunc('second',created_at)+interval '48 hours'>clock_timestamp();
  if not found then return false; end if;
 else
  update public.capture_requests set email_consent_status='revoked'
  where artist_id=p_artist and fan_id=p_fan and email_consent_status='pending';
 end if;
 select status,captured_at into latest_status,latest_at from public.consent_records
 where fan_id=p_fan and channel='email' and purpose='marketing' order by captured_at desc,id desc limit 1;
 if latest_status=p_status then return true; end if;
 -- Preserve append-only history and its existing reader ordering even when a
 -- waiting transaction began earlier, or two changes share a clock tick.
 changed_at:=greatest(clock_timestamp(),latest_at+interval '1 microsecond');
 insert into public.consent_records(artist_id,fan_id,channel,purpose,status,consent_text_version,capture_source,captured_at,revoked_at)
 values(p_artist,p_fan,'email','marketing',p_status,'2026-10-23','verified_link',changed_at,case when p_status='revoked' then changed_at end);
 if p_status='granted' then
  update public.fans set email_verified_at=coalesce(email_verified_at,changed_at) where id=p_fan;
  insert into public.delivery_jobs(artist_id,fan_id,kind,dedupe_key) values(p_artist,p_fan,'welcome','welcome:'||p_fan) on conflict do nothing;
 end if;
 insert into public.fan_events(artist_id,fan_id,event_type,event_id) values(p_artist,p_fan,'consent_updated',gen_random_uuid()::text);
 return true;
end $$;

-- Keep the legacy function identity, argument names and void return type so
-- cached/older callers can still unsubscribe. Never allow an unbound grant.
create or replace function public.update_email_consent(p_artist text,p_fan uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status is distinct from 'revoked' then
  raise exception 'unauthorized' using errcode='42501';
 end if;
 if not public.update_email_consent(p_artist,p_fan,'revoked',null::uuid) then
  raise exception 'unauthorized' using errcode='42501';
 end if;
end $$;

revoke execute on function public.capture_fan(text,uuid,text,text,text,jsonb,jsonb,boolean,text),
 public.update_email_consent(text,uuid,text,uuid),public.update_email_consent(text,uuid,text) from public,anon,authenticated;
grant execute on function public.capture_fan(text,uuid,text,text,text,jsonb,jsonb,boolean,text),
 public.update_email_consent(text,uuid,text,uuid),public.update_email_consent(text,uuid,text) to service_role;

notify pgrst, 'reload schema';
commit;
