-- Run in the protected Supabase SQL Editor after the Artist Studio reporting migration.
-- Returns one aggregate report, with no contact details or identifiers.
select public.artist_studio_report('jona-ferreira', 'sayyouluvme_2026') as fan_acquisition;
