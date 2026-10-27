-- Read-only price quote that reuses create_order's exact logic, then rolls everything back
-- (stock reservation, coupon redemption, order rows). No duplicated pricing code to drift.
-- STATUS: written but NOT yet executed against a real database.
create function quote_order(p_user uuid, p_items jsonb, p_shipping jsonb, p_coupon text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_res jsonb;
begin
  begin
    v_id := create_order(p_user, p_items, p_shipping, p_coupon, 'quote-' || gen_random_uuid()::text);
    select jsonb_build_object('subtotal', subtotal, 'discount', discount_total, 'shipping', shipping_charge, 'total', total)
      into v_res from orders where id = v_id;
    raise exception 'QUOTE:%', v_res::text;      -- forces rollback of the sub-transaction
  exception when others then
    if sqlerrm like 'QUOTE:%' then return substr(sqlerrm, 7)::jsonb; end if;
    raise;
  end;
end $$;
revoke all on function quote_order(uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function quote_order(uuid, jsonb, jsonb, text) to service_role;

-- Audit trail for settings edits (payment numbers etc.). Values are NOT logged, only which key changed.
create function audit_settings_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs(actor_id, action, entity, entity_id, detail) values (auth.uid(), 'settings.' || lower(tg_op), 'site_settings', new.key, '{}');
  return new;
end $$;
create trigger trg_settings_audit after insert or update on site_settings for each row execute function audit_settings_change();

-- Release stock held by abandoned UNPAID orders. Never touches orders with a payment awaiting verification.
create function expire_unpaid_orders(p_hours int) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if p_hours < 1 then raise exception 'invalid_input'; end if;
  for r in select o.id from orders o
           where o.fulfillment_status <> 'cancelled' and o.payment_status in ('awaiting_payment','payment_rejected')
             and o.updated_at < now() - make_interval(hours => p_hours)
             and not exists (select 1 from payments p where p.order_id = o.id and p.status = 'pending_verification')
           for update of o skip locked
  loop
    perform admin_cancel_order_internal(r.id, null, 'নির্ধারিত সময়ে পেমেন্ট না আসায় স্বয়ংক্রিয়ভাবে বাতিল');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function expire_unpaid_orders(int) from public, anon, authenticated;
grant execute on function expire_unpaid_orders(int) to service_role;

insert into site_settings(key, value, visibility) values ('orders', '{"hold_hours":48}', 'admin') on conflict (key) do nothing;
