-- Apply after 202610160004_database_security_hardening.sql.
begin;

alter table public.products
  add column delivery_file_path text,
  add constraint products_delivery_file_path_owner_check
    check (delivery_file_path is null or delivery_file_path like creator_id::text || '/%');
alter table public.products
  add column has_delivery_file boolean generated always as (delivery_file_path is not null) stored;

-- Replace table-level reads so the private storage path is never exposed.
revoke select on public.products from anon, authenticated;
grant select (
  id, creator_id, title, description, cover_url, kind, price_cents, currency,
  is_published, created_at, updated_at, has_delivery_file
) on public.products to anon, authenticated;
grant insert (
  creator_id, title, description, cover_url, kind, price_cents, currency,
  is_published, delivery_file_path
) on public.products to authenticated;
grant update (delivery_file_path) on public.products to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-deliveries',
  'product-deliveries',
  false,
  52428800,
  array['application/pdf', 'application/epub+zip', 'application/zip', 'audio/mpeg', 'audio/mp4', 'video/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Creators upload their own product deliveries"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-deliveries'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Creators replace their own product deliveries"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-deliveries'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'product-deliveries'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Creators delete their own product deliveries"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-deliveries'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create table public.product_delivery_access (
  checkout_id uuid primary key references public.checkout_orders(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.product_delivery_access enable row level security;
revoke all on public.product_delivery_access from public, anon, authenticated;
grant all privileges on public.product_delivery_access to service_role;

commit;