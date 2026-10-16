alter table public.profiles
  add column social_links jsonb not null default '{}'::jsonb
  check (
    jsonb_typeof(social_links) = 'object'
    and social_links - array['instagram', 'youtube', 'tiktok', 'x', 'facebook', 'linkedin', 'website']::text[] = '{}'::jsonb
  );
