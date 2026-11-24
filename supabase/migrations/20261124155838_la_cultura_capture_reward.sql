-- Bind the new offer to the existing capture and delivery job in one transaction.
-- The legacy RPC, reward objects and already-issued links keep their semantics.
create function public.capture_fan_with_reward(
  p_artist text, p_request uuid, p_email text, p_language text,
  p_first jsonb, p_last jsonb, p_opt_in boolean, p_fingerprint text, p_reward_id text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  fan uuid;
begin
  if p_reward_id is distinct from 'la_cultura_wallpapers' then
    raise exception 'invalid_request';
  end if;
  fan := public.capture_fan(
    p_artist, p_request, p_email, p_language, 'stay_close',
    p_first, p_last, p_opt_in, p_reward_id || ':' || p_fingerprint
  );
  update public.delivery_jobs
  set payload = payload || jsonb_build_object('rewardId', p_reward_id)
  where artist_id = p_artist and fan_id = fan and kind = 'capture'
    and dedupe_key = 'capture:' || p_request and payload->>'rewardId' is null;
  update public.fan_events
  set metadata = metadata || jsonb_build_object(
    'rewardId', p_reward_id, 'firstTouch', p_first, 'lastTouch', p_last
  )
  where artist_id = p_artist and fan_id = fan and event_type = 'fan_captured'
    and event_id = 'capture:' || p_request and metadata->>'rewardId' is null;
  return fan;
end;
$$;

revoke all on function public.capture_fan_with_reward(text,uuid,text,text,jsonb,jsonb,boolean,text,text)
from public, anon, authenticated, service_role;
grant execute on function public.capture_fan_with_reward(text,uuid,text,text,jsonb,jsonb,boolean,text,text)
to service_role;
