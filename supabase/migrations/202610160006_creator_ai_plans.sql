-- Apply after 202610160005_digital_product_delivery.sql.
begin;

create table public.creator_ai_plans (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'testing', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index creator_ai_plans_creator_created_idx
  on public.creator_ai_plans (creator_id, created_at desc);

alter table public.creator_ai_plans enable row level security;
revoke all on public.creator_ai_plans from public, anon, authenticated;
grant select on public.creator_ai_plans to authenticated;
grant update (result, status, updated_at) on public.creator_ai_plans to authenticated;
grant all privileges on public.creator_ai_plans to service_role;

create policy "Creators read their own AI plans"
  on public.creator_ai_plans for select
  to authenticated
  using ((select auth.uid()) = creator_id);

create policy "Creators update their own AI plans"
  on public.creator_ai_plans for update
  to authenticated
  using ((select auth.uid()) = creator_id)
  with check ((select auth.uid()) = creator_id);

commit;