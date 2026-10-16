create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null,
  bio text not null default '',
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  description text not null default '',
  cover_url text,
  kind text not null check (kind in ('digital_product', 'paid_offer')),
  price_cents integer not null check (price_cents between 100 and 10000000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.checkout_orders (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id),
  product_id uuid references public.products(id),
  kind text not null check (kind in ('product', 'tip')),
  expected_amount_cents integer not null check (expected_amount_cents between 100 and 10000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  paypal_order_id text unique,
  status text not null default 'CREATING' check (status in ('CREATING', 'CREATED', 'APPROVED', 'CAPTURED', 'CANCELLED', 'FAILED', 'REFUNDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  captured_at timestamptz,
  check ((kind = 'product' and product_id is not null) or (kind = 'tip' and product_id is null))
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null unique references public.checkout_orders(id),
  creator_id uuid not null references public.profiles(id),
  product_id uuid references public.products(id),
  paypal_order_id text not null,
  paypal_capture_id text not null unique,
  amount_cents integer not null,
  currency text not null,
  status text not null check (status in ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  refunded_amount_cents integer not null default 0 check (refunded_amount_cents between 0 and amount_cents),
  source text not null default 'paypal_sandbox' check (source in ('paypal_sandbox', 'simulated')),
  created_at timestamptz not null default now(),
  captured_at timestamptz not null
);

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.payment_transactions(id),
  paypal_refund_id text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);

create table public.paypal_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  event text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.rate_limit_buckets (
  key text primary key,
  window_started timestamptz not null,
  request_count integer not null
);

create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  insert into rate_limit_buckets(key, window_started, request_count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_started = case
      when rate_limit_buckets.window_started <= now() - make_interval(secs => p_window_seconds) then now()
      else rate_limit_buckets.window_started
    end,
    request_count = case
      when rate_limit_buckets.window_started <= now() - make_interval(secs => p_window_seconds) then 1
      else rate_limit_buckets.request_count + 1
    end;

  select request_count <= p_limit into allowed from rate_limit_buckets where key = p_key;
  return allowed;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.checkout_orders enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.paypal_webhook_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limit_buckets enable row level security;

create policy "Profiles are publicly readable" on public.profiles for select using (true);
create policy "Creators can insert their profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Creators can update their profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Published products are public" on public.products for select using (is_published or auth.uid() = creator_id);
create policy "Creators manage own products" on public.products for all using (auth.uid() = creator_id) with check (auth.uid() = creator_id);
create policy "Creators read own checkouts" on public.checkout_orders for select using (auth.uid() = creator_id);
create policy "Creators read own transactions" on public.payment_transactions for select using (auth.uid() = creator_id);

create or replace function public.create_creator_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
begin
  requested_username := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  if requested_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Username must be 3-30 lowercase letters, numbers, or underscores.';
  end if;
  insert into public.profiles(id, username, display_name)
  values (new.id, requested_username, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), requested_username));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_creator_profile();

insert into storage.buckets (id, name, public)
values ('product-assets', 'product-assets', true)
on conflict (id) do nothing;

create policy "Product assets are public" on storage.objects for select using (bucket_id = 'product-assets');
create policy "Creators upload own product assets" on storage.objects for insert to authenticated
with check (bucket_id = 'product-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Creators update own product assets" on storage.objects for update to authenticated
using (bucket_id = 'product-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Creators delete own product assets" on storage.objects for delete to authenticated
using (bucket_id = 'product-assets' and (storage.foldername(name))[1] = auth.uid()::text);