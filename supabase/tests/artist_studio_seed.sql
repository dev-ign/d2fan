-- Disposable Studio preview only. Seed an empty isolated database as its local owner.
begin;

do $$
declare
  n integer;
  fan_id uuid;
  capture_id uuid;
  attempt_id uuid;
  joined_at timestamptz;
  touch jsonb;
  opt_in boolean;
  amount integer;
  mode text;
  session_id text;
begin
  if current_setting('app.artist_studio_synthetic', true) is distinct from 'on'
    or exists (select 1 from public.fans)
    or exists (select 1 from public.checkout_attempts)
    or exists (select 1 from public.delivery_jobs) then
    raise exception 'Studio fixtures require an explicitly enabled, empty disposable database';
  end if;

  for n in 1..43 loop
    capture_id := gen_random_uuid();
    joined_at := now() - make_interval(days => (n * n + n) % 29);
    opt_in := n % 4 <> 0;
    touch := jsonb_build_object(
      'release', 'sayyouluvme', 'campaign_id', 'sayyouluvme_2026',
      'landing_path', '/music/sayyouluvme', 'utm_campaign', 'sayyouluvme_2026',
      'utm_source', (array['instagram', 'youtube', 'tiktok', 'fan_share'])[1 + n % 4],
      'utm_medium', case when n % 4 = 3 then 'referral' else 'organic_social' end,
      'utm_content', (array['jona_stories', 'short_01', 'teaser_01', 'dedication_01'])[1 + n % 4]
    );
    fan_id := public.capture_fan_with_reward(
      'jona-ferreira', capture_id, 'listener-' || lpad(n::text, 2, '0') || '@example.test',
      case when n % 3 = 0 then 'en' else 'es' end, touch, touch,
      opt_in, 'local-studio-fixture-' || n, 'la_cultura_wallpapers'
    );
    if opt_in and n % 5 <> 0 then
      perform public.update_email_consent('jona-ferreira', fan_id, 'granted', capture_id);
      if n % 7 = 0 then
        perform public.update_email_consent('jona-ferreira', fan_id, 'revoked', capture_id);
      end if;
    end if;
    update public.fans set created_at = joined_at, updated_at = joined_at where id = fan_id;
    update public.capture_requests set created_at = joined_at where id = capture_id;
    update public.fan_events set created_at = joined_at where event_id = 'capture:' || capture_id;
  end loop;

  for n in 1..8 loop
    attempt_id := gen_random_uuid();
    mode := case when n = 8 then 'test' else 'live' end;
    session_id := 'cs_' || mode || '_StudioSynthetic' || n;
    amount := (array[500, 1500, 3000, 500, 1500, 1500, 500, 1500])[n];
    insert into public.checkout_attempts(
      id, artist_id, purpose, amount_minor, currency, status, stripe_session_id,
      payment_mode, stripe_account_id, guest_token_hash
    ) values (attempt_id, 'jona-ferreira', 'tip', amount, 'usd', 'pending_payment', session_id,
      mode, 'acct_StudioSynthetic', md5(attempt_id::text) || md5(attempt_id::text));
    perform public.fulfill_checkout('evt_studio_fixture_' || n, 'checkout.session.completed',
      attempt_id, session_id, 'pi_studio_fixture_' || n, amount, 'usd');
    if n = 4 then
      perform public.refund_purchase('evt_studio_refund_' || n, 'pi_studio_fixture_' || n, true);
    end if;
  end loop;
end $$;

commit;
