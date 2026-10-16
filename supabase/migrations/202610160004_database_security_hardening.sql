-- Apply after 202610160001_initial_schema.sql, 202610160002_ai_learning_context.sql,
-- and 202610160003_creator_social_links.sql.
-- This migration intentionally replaces policies on KoliCreator-owned tables.
begin;

set local lock_timeout = '5s';

do $$
declare
  required_table text;
begin
  foreach required_table in array array[
    'profiles',
    'products',
    'checkout_orders',
    'payment_transactions',
    'payment_refunds',
    'paypal_webhook_events',
    'audit_logs',
    'rate_limit_buckets'
  ] loop
    if to_regclass(format('public.%I', required_table)) is null then
      raise exception 'Required table public.% is missing; apply the earlier KoliCreator migrations first.', required_table;
    end if;
  end loop;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'social_links'
  ) then
    raise exception 'profiles.social_links is missing; apply 202610160003_creator_social_links.sql first.';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'Required Supabase roles are missing; run this migration in the Supabase SQL editor.';
  end if;

  if to_regclass('storage.objects') is null
     or not exists (select 1 from storage.buckets where id = 'product-assets') then
    raise exception 'The product-assets Supabase Storage bucket is missing; apply the initial schema migration first.';
  end if;
end;
$$;

-- Prevent API roles from adding objects to the exposed schema and shadowing
-- objects used by trusted SECURITY DEFINER functions.
revoke create on schema public from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- New public-schema tables must receive explicit grants and RLS policies.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Remove permissive or obsolete policies on the application tables before
-- installing the complete, narrow policy set below.
do $$
declare
  target_table text;
  existing_policy text;
begin
  foreach target_table in array array[
    'profiles',
    'products',
    'checkout_orders',
    'payment_transactions',
    'payment_refunds',
    'paypal_webhook_events',
    'audit_logs',
    'rate_limit_buckets'
  ] loop
    for existing_policy in
      select policy.polname
      from pg_policy as policy
      where policy.polrelid = format('public.%I', target_table)::regclass
    loop
      execute format('drop policy %I on public.%I', existing_policy, target_table);
    end loop;

    execute format('alter table public.%I enable row level security', target_table);
  end loop;
end;
$$;

-- RLS controls rows; SQL grants separately control which operations and
-- columns the public API roles can attempt.
revoke all privileges on table
  public.profiles,
  public.products,
  public.checkout_orders,
  public.payment_transactions,
  public.payment_refunds,
  public.paypal_webhook_events,
  public.audit_logs,
  public.rate_limit_buckets
from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;

grant select on table public.profiles, public.products to anon, authenticated;
grant update (display_name, bio, social_links) on table public.profiles to authenticated;

grant insert (creator_id, title, description, cover_url, kind, price_cents, currency, is_published)
  on table public.products to authenticated;
grant update (title, description, cover_url, kind, price_cents, currency, is_published)
  on table public.products to authenticated;
grant delete on table public.products to authenticated;

grant select on table public.checkout_orders, public.payment_transactions to authenticated;

grant all privileges on table
  public.profiles,
  public.products,
  public.checkout_orders,
  public.payment_transactions,
  public.payment_refunds,
  public.paypal_webhook_events,
  public.audit_logs,
  public.rate_limit_buckets
to service_role;
grant usage, select on all sequences in schema public to service_role;

create policy "Public profiles are readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Creators update permitted profile fields"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Published products are public"
  on public.products for select
  to anon, authenticated
  using (is_published or (select auth.uid()) = creator_id);

create policy "Creators insert their own products"
  on public.products for insert
  to authenticated
  with check ((select auth.uid()) = creator_id);

create policy "Creators update their own products"
  on public.products for update
  to authenticated
  using ((select auth.uid()) = creator_id)
  with check ((select auth.uid()) = creator_id);

create policy "Creators delete their own products"
  on public.products for delete
  to authenticated
  using ((select auth.uid()) = creator_id);

create policy "Creators read their own checkout orders"
  on public.checkout_orders for select
  to authenticated
  using ((select auth.uid()) = creator_id);

create policy "Creators read their own payment transactions"
  on public.payment_transactions for select
  to authenticated
  using ((select auth.uid()) = creator_id);

-- Anonymous users cannot enumerate payment records, refunds, audit metadata,
-- rate-limit buckets, or webhook idempotency state. Service-role API handlers
-- retain trusted access and must continue authenticating/validating requests.

update storage.buckets
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'product-assets';

drop policy if exists "Product assets are public" on storage.objects;
drop policy if exists "Creators upload own product assets" on storage.objects;
drop policy if exists "Creators update own product assets" on storage.objects;
drop policy if exists "Creators delete own product assets" on storage.objects;

create policy "Public product assets are readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-assets');

create policy "Creators upload their own product assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Creators update their own product assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'product-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Creators delete their own product assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create index if not exists rate_limit_buckets_window_started_idx
  on public.rate_limit_buckets (window_started);

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  allowed boolean;
begin
  if p_key is null or char_length(p_key) not between 1 and 200 then
    raise exception 'Rate-limit key must contain between 1 and 200 characters.';
  end if;
  if p_limit is null or p_limit not between 1 and 10000 then
    raise exception 'Rate-limit maximum must be between 1 and 10000.';
  end if;
  if p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Rate-limit window must be between 1 and 86400 seconds.';
  end if;

  insert into public.rate_limit_buckets as bucket(key, window_started, request_count)
  values (p_key, pg_catalog.now(), 1)
  on conflict (key) do update set
    window_started = case
      when bucket.window_started <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
        then pg_catalog.now()
      else public.rate_limit_buckets.window_started
    end,
    request_count = case
      when bucket.window_started <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
        then 1
      else bucket.request_count + 1
    end;

  select bucket.request_count <= p_limit
    into allowed
    from public.rate_limit_buckets as bucket
    where bucket.key = p_key;
  return allowed;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;

create or replace function public.creator_ai_learning_context(p_creator_id uuid)
returns table (
  month_start date,
  product_id uuid,
  currency text,
  transaction_count bigint,
  gross_cents bigint,
  net_cents bigint,
  refund_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    pg_catalog.date_trunc('month', tx.captured_at)::date as month_start,
    tx.product_id,
    tx.currency,
    pg_catalog.count(*)::bigint as transaction_count,
    pg_catalog.sum(tx.amount_cents)::bigint as gross_cents,
    pg_catalog.sum(tx.amount_cents - tx.refunded_amount_cents)::bigint as net_cents,
    pg_catalog.count(*) filter (where tx.refunded_amount_cents > 0)::bigint as refund_count
  from public.payment_transactions as tx
  where tx.creator_id = p_creator_id
    and tx.status in ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
    and tx.captured_at >= pg_catalog.date_trunc('month', pg_catalog.now()) - interval '5 months'
    and tx.captured_at < pg_catalog.date_trunc('month', pg_catalog.now()) + interval '1 month'
  group by
    pg_catalog.date_trunc('month', tx.captured_at)::date,
    tx.product_id,
    tx.currency
  order by month_start, tx.currency, tx.product_id nulls first;
$$;

revoke all on function public.creator_ai_learning_context(uuid)
  from public, anon, authenticated;
grant execute on function public.creator_ai_learning_context(uuid)
  to service_role;

create or replace function public.create_creator_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requested_username text;
  requested_display_name text;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  if requested_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Username must be 3-30 lowercase letters, numbers, or underscores.';
  end if;

  requested_display_name := nullif(btrim(new.raw_user_meta_data->>'display_name'), '');
  if requested_display_name is null then
    requested_display_name := requested_username;
  end if;

  insert into public.profiles(id, username, display_name)
  values (new.id, requested_username, requested_display_name);
  return new;
end;
$$;

revoke all on function public.create_creator_profile()
  from public, anon, authenticated, service_role;

-- Verification queries for the SQL editor:
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in ('profiles', 'products', 'checkout_orders',
--     'payment_transactions', 'payment_refunds', 'paypal_webhook_events',
--     'audit_logs', 'rate_limit_buckets')
-- order by tablename;
--
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in ('profiles', 'products', 'checkout_orders',
--     'payment_transactions', 'payment_refunds', 'audit_logs', 'rate_limit_buckets')
--   and grantee in ('anon', 'authenticated')
-- order by table_name, grantee, privilege_type;
--
-- select table_name, column_name, grantee, privilege_type
-- from information_schema.column_privileges
-- where table_schema = 'public'
--   and table_name in ('profiles', 'products')
--   and grantee in ('anon', 'authenticated')
-- order by table_name, column_name, grantee, privilege_type;

commit;
