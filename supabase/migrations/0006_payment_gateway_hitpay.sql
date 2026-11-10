-- =====================================================================
-- Payment gateway is now HitPay (was PayMongo in 0005). Column names become
-- provider-neutral so the gateway can change again without schema churn.
-- Safe on live data: no online orders existed when this ran.
-- =====================================================================
alter table public.orders rename column paymongo_checkout_id to gateway_ref;        -- HitPay payment request id
alter table public.orders rename column paymongo_payment_id  to gateway_payment_id; -- HitPay payment id
alter table public.orders rename column paymongo_refund_id   to gateway_refund_id;  -- HitPay refund id
alter table public.orders add column if not exists payment_gateway text;            -- e.g. 'hitpay'

drop function if exists public.mark_order_paid(text, text, bigint);

-- Called only by trusted server code (service role) after the payment was
-- confirmed with the gateway's API. Idempotent; refuses amount mismatches;
-- flags payments that arrive after the order was cancelled.
create or replace function public.mark_order_paid(p_ref text, p_payment_id text, p_amount_centavos bigint)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where gateway_ref = p_ref for update;
  if not found then return 'not_found'; end if;
  if o.payment_status::text in ('paid', 'refunded') then return 'already_paid'; end if;
  if p_amount_centavos <> round(o.total * 100)::bigint then return 'amount_mismatch'; end if;
  update public.orders
     set payment_status = 'paid', gateway_payment_id = p_payment_id, paid_at = now()
   where id = o.id;
  return case when o.status = 'cancelled' then 'paid_after_cancel' else 'paid' end;
end $$;

revoke execute on function public.mark_order_paid(text, text, bigint) from public, anon, authenticated;
grant  execute on function public.mark_order_paid(text, text, bigint) to service_role;
