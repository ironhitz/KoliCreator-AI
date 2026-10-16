-- Apply after 202610160006_creator_ai_plans.sql.
begin;

create index if not exists payment_transactions_creator_captured_idx
  on public.payment_transactions (creator_id, captured_at desc);

create or replace function public.creator_transaction_summary(
  p_creator_id uuid,
  p_from timestamptz,
  p_product_id uuid,
  p_tips_only boolean
)
returns table (
  product_id uuid,
  currency text,
  capture_count bigint,
  gross_cents bigint,
  refunded_cents bigint,
  refunded_capture_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    tx.product_id,
    tx.currency,
    pg_catalog.count(*)::bigint,
    pg_catalog.sum(tx.amount_cents)::bigint,
    pg_catalog.sum(tx.refunded_amount_cents)::bigint,
    pg_catalog.count(*) filter (where tx.refunded_amount_cents > 0)::bigint
  from public.payment_transactions as tx
  where tx.creator_id = p_creator_id
    and tx.status in ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
    and (p_from is null or tx.captured_at >= p_from)
    and (p_product_id is null or tx.product_id = p_product_id)
    and (not p_tips_only or tx.product_id is null)
  group by tx.product_id, tx.currency
  order by tx.currency, tx.product_id nulls first;
$$;

revoke all on function public.creator_transaction_summary(uuid, timestamptz, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.creator_transaction_summary(uuid, timestamptz, uuid, boolean)
  to service_role;

commit;