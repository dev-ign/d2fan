-- Run only as an authorized operator in the Supabase SQL editor.
-- Export this query's result to CSV. This is not a public API or database view.
select f.email_normalized as email, f.preferred_language as language,
       f.first_touch_source, f.first_touch_release_slug,
       f.first_touch_utm, f.last_touch_utm, 'granted' as email_marketing_permission
from public.fans f
where f.artist_id = 'jona-ferreira'
  and public.email_permission(f.id)
order by f.created_at;
