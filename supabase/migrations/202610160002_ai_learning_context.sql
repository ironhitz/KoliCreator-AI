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
set search_path = public
as $$
  select
    date_trunc('month', captured_at)::date as month_start,
    payment_transactions.product_id,
    payment_transactions.currency,
    count(*)::bigint as transaction_count,
    sum(amount_cents)::bigint as gross_cents,
    sum(amount_cents - refunded_amount_cents)::bigint as net_cents,
    count(*) filter (where refunded_amount_cents > 0)::bigint as refund_count
  from public.payment_transactions
  where creator_id = p_creator_id
    and status in ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
    and captured_at >= date_trunc('month', now()) - interval '5 months'
    and captured_at < date_trunc('month', now()) + interval '1 month'
  group by date_trunc('month', captured_at)::date, payment_transactions.product_id, payment_transactions.currency
  order by month_start, payment_transactions.currency, payment_transactions.product_id nulls first;
$$;

revoke all on function public.creator_ai_learning_context(uuid) from public, anon, authenticated;
grant execute on function public.creator_ai_learning_context(uuid) to service_role;
