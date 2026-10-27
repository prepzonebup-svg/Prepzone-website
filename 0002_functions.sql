-- Critical business logic as SECURITY DEFINER functions.
-- Callable ONLY by service_role (Netlify Functions), which first verifies the caller's JWT
-- and passes the verified user id. Browsers can never call these directly (see revokes at bottom).
-- STATUS: written but NOT yet executed against a real Postgres/Supabase instance.

create function staff_has_role(p_user uuid, p_roles admin_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_roles
                 where user_id = p_user and (role = 'super_admin' or role = any(p_roles)))
$$;

create function require_role(p_user uuid, p_roles admin_role[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not staff_has_role(p_user, p_roles) then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create function write_audit(p_actor uuid, p_action text, p_entity text, p_entity_id text, p_detail jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_logs(actor_id, action, entity, entity_id, detail) values (p_actor, p_action, p_entity, p_entity_id, p_detail)
$$;

-- Fixed-window rate limiter. Returns true if the call is ALLOWED.
create function check_rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_hits int;
begin
  insert into rate_limits(key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.hits + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

-- ───────────── create_order ─────────────
-- p_items: [{"product_id": "...", "quantity": 1}, ...]
-- p_shipping: {"name","phone","address","area","note"} (required if any printed book)
-- Prices, discounts, shipping and stock are ALL computed here from DB state.
create function create_order(p_user uuid, p_items jsonb, p_shipping jsonb, p_coupon text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order uuid; v_existing uuid; r record; p products%rowtype; b book_details%rowtype;
  v_subtotal numeric(12,2) := 0; v_line numeric(12,2); v_qty int;
  v_physical boolean := false; v_phone text; v_area text;
  v_ship numeric(12,2) := 0; z shipping_zones%rowtype;
  v_cp coupons%rowtype; v_disc numeric(12,2) := 0; v_used int;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then raise exception 'bad_idempotency_key'; end if;
  select id into v_existing from orders where user_id = p_user and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;       -- duplicate submit → same order

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'invalid_items'; end if;

  select bool_or(pr.type = 'printed_book') into v_physical
  from products pr where pr.id in (select (e->>'product_id')::uuid from jsonb_array_elements(p_items) e);
  v_physical := coalesce(v_physical, false);

  if v_physical then
    v_phone := normalize_bd_phone(p_shipping->>'phone');
    v_area  := nullif(trim(p_shipping->>'area'), '');
    if coalesce(trim(p_shipping->>'name'),'') = '' or v_phone is null
       or coalesce(trim(p_shipping->>'address'),'') = '' or v_area is null then
      raise exception 'invalid_shipping'; end if;
  end if;

  insert into orders(user_id, idempotency_key, has_physical, fulfillment_status,
                     ship_name, ship_phone, ship_address, ship_area, ship_note)
  values (p_user, p_idempotency_key, v_physical, case when v_physical then 'processing' else 'not_applicable' end::fulfillment_status,
          left(trim(p_shipping->>'name'),120), v_phone, left(trim(p_shipping->>'address'),400), left(v_area,80), left(p_shipping->>'note',400))
  returning id into v_order;

  -- Group by product, lock in id order (prevents deadlocks)
  for r in
    select (e->>'product_id')::uuid as pid, sum(greatest((e->>'quantity')::int,0))::int as qty
    from jsonb_array_elements(p_items) e group by 1 order by 1
  loop
    select * into p from products
     where id = r.pid and status = 'published'
       and (available_from is null or available_from <= now())
       and (available_until is null or available_until >= now());
    if not found then raise exception 'product_unavailable'; end if;
    v_qty := r.qty;
    if v_qty < 1 then raise exception 'invalid_quantity'; end if;

    if p.type = 'printed_book' then
      select * into b from book_details where product_id = p.id for update;   -- row lock = no oversell
      if v_qty > b.max_per_order then raise exception 'quantity_limit'; end if;
      if b.stock_quantity < v_qty then raise exception 'insufficient_stock'; end if;
      update book_details set stock_quantity = stock_quantity - v_qty where product_id = p.id;
      insert into stock_movements(product_id, delta, reason, order_id, actor_id)
      values (p.id, -v_qty, 'order_reserved', v_order, p_user);
    elsif v_qty <> 1 then
      raise exception 'invalid_quantity';
    end if;

    v_line := p.price_selling * v_qty;
    v_subtotal := v_subtotal + v_line;
    insert into order_items(order_id, product_id, product_title, product_type, unit_price, quantity, line_total)
    values (v_order, p.id, p.title, p.type, p.price_selling, v_qty, v_line);
  end loop;

  if v_physical then
    select * into z from shipping_zones
     where is_active and exists (select 1 from unnest(areas) a where lower(a) = lower(v_area)) limit 1;
    if not found then select * into z from shipping_zones where is_active and is_default; end if;
    if not found then raise exception 'shipping_not_configured'; end if;
    v_ship := case when z.free_over is not null and v_subtotal >= z.free_over then 0 else z.charge end;
  end if;

  if p_coupon is not null and trim(p_coupon) <> '' then
    select * into v_cp from coupons where code = upper(trim(p_coupon)) for update;
    if not found or not v_cp.is_active
       or (v_cp.starts_at is not null and v_cp.starts_at > now())
       or (v_cp.ends_at is not null and v_cp.ends_at < now())
       or v_subtotal < v_cp.min_order then raise exception 'coupon_invalid'; end if;
    select count(*) into v_used from coupon_redemptions where coupon_id = v_cp.id and released_at is null;
    if v_cp.usage_limit is not null and v_used >= v_cp.usage_limit then raise exception 'coupon_exhausted'; end if;
    select count(*) into v_used from coupon_redemptions where coupon_id = v_cp.id and user_id = p_user and released_at is null;
    if v_used >= v_cp.per_user_limit then raise exception 'coupon_exhausted'; end if;
    v_disc := case v_cp.type when 'percent' then round(v_subtotal * v_cp.value / 100, 2) else v_cp.value end;
    if v_cp.max_discount is not null then v_disc := least(v_disc, v_cp.max_discount); end if;
    v_disc := least(v_disc, v_subtotal - 1);   -- never free; at least 1 BDT payable
    insert into coupon_redemptions(coupon_id, order_id, user_id, discount) values (v_cp.id, v_order, p_user, v_disc);
  end if;

  update orders set subtotal = v_subtotal, discount_total = v_disc, shipping_charge = v_ship,
         total = v_subtotal - v_disc + v_ship, coupon_id = v_cp.id
   where id = v_order;
  insert into payment_events(order_id, event, actor_id) values (v_order, 'order_created', p_user);
  return v_order;
end $$;

-- ───────────── submit_payment ─────────────
create function submit_payment(p_user uuid, p_order uuid, p_method payment_method, p_sender text, p_trx text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_trx text := upper(trim(p_trx)); v_sender text := normalize_bd_phone(p_sender);
        v_pay uuid; v_enabled boolean; v_dup payments%rowtype;
begin
  select * into o from orders where id = p_order and user_id = p_user for update;
  if not found then raise exception 'order_not_found'; end if;           -- also covers other users' orders
  if o.fulfillment_status = 'cancelled' then raise exception 'order_cancelled'; end if;
  if o.payment_status in ('payment_approved','refunded') then raise exception 'already_paid'; end if;
  if v_sender is null then raise exception 'invalid_sender'; end if;
  if v_trx !~ '^[A-Z0-9]{6,20}$' then raise exception 'invalid_trx'; end if;

  select coalesce((value -> p_method::text ->> 'enabled')::boolean, false) into v_enabled from site_settings where key = 'payment';
  if not coalesce(v_enabled,false) then raise exception 'method_disabled'; end if;

  -- Idempotent retry: same live payment already recorded for this order
  select id into v_pay from payments where order_id = p_order and status = 'pending_verification' and method = p_method and trx_id = v_trx;
  if found then return v_pay; end if;
  if exists (select 1 from payments where order_id = p_order and status = 'pending_verification') then
    raise exception 'payment_already_pending'; end if;

  if exists (select 1 from payments where method = p_method and trx_id = v_trx and status <> 'rejected') then
    insert into payment_events(order_id, event, actor_id, meta) values (p_order, 'duplicate_trx_blocked', p_user, jsonb_build_object('method', p_method));
    raise exception 'duplicate_trx';
  end if;

  begin
    insert into payments(order_id, method, sender_number, trx_id, amount, note)
    values (p_order, p_method, v_sender, v_trx, o.total, left(p_note, 300)) returning id into v_pay;
  exception when unique_violation then raise exception 'duplicate_trx';   -- race with a concurrent submit
  end;

  -- Flag (not block) reuse of a previously REJECTED trx on a different order, so staff look closer
  if exists (select 1 from payments where method = p_method and trx_id = v_trx and status = 'rejected' and order_id <> p_order) then
    insert into payment_events(payment_id, order_id, event, actor_id, reason)
    values (v_pay, p_order, 'flagged_reused_rejected_trx', p_user, 'TrxID previously rejected on another order');
  end if;

  update orders set payment_status = 'pending_verification' where id = p_order;
  insert into payment_events(payment_id, order_id, event, actor_id, meta)
  values (v_pay, p_order, 'payment_submitted', p_user, jsonb_build_object('method', p_method, 'amount', o.total));
  return v_pay;
end $$;

-- ───────────── decide_payment (approve / reject) ─────────────
-- p_verified_amount = the amount the verifier actually saw in the bKash/Nagad account.
create function decide_payment(p_admin uuid, p_payment uuid, p_decision text, p_reason text, p_verified_amount numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pay payments%rowtype; o orders%rowtype; it record; v_tg telegram_status; v_new_ful fulfillment_status;
begin
  perform require_role(p_admin, array['payment_verifier']::admin_role[]);
  if p_decision not in ('approve','reject') then raise exception 'bad_decision'; end if;
  if p_decision = 'reject' and coalesce(trim(p_reason),'') = '' then raise exception 'reason_required'; end if;

  select * into pay from payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found'; end if;
  select * into o from orders where id = pay.order_id for update;

  -- Idempotent: repeated request returns current state without re-processing
  if pay.status <> 'pending_verification' then
    return jsonb_build_object('payment_id', pay.id, 'status', pay.status, 'already_decided', true);
  end if;
  if o.fulfillment_status = 'cancelled' then raise exception 'order_cancelled'; end if;

  if p_decision = 'approve' then
    if p_verified_amount is null or p_verified_amount <> pay.amount or pay.amount <> o.total then
      raise exception 'amount_mismatch'; end if;

    update payments set status = 'approved', decided_by = p_admin, decided_at = now(), decision_reason = left(p_reason,500) where id = pay.id;
    update orders set payment_status = 'payment_approved' where id = o.id;

    for it in select oi.id, oi.product_id, oi.product_type from order_items oi where oi.order_id = o.id loop
      if it.product_type in ('course','exam_batch','pdf_book') then
        v_tg := case when it.product_type = 'pdf_book' then 'not_required'
                     when exists (select 1 from telegram_access t where t.product_id = it.product_id and t.is_enabled) then 'pending'
                     else 'manual' end;
        insert into entitlements(user_id, order_id, order_item_id, product_id, product_type, telegram)
        values (o.user_id, o.id, it.id, it.product_id, it.product_type, v_tg)
        on conflict (order_item_id) do nothing;                    -- idempotent
      end if;
    end loop;
    -- Physical orders stay 'processing' until staff mark shipped; digital stay 'not_applicable'.
  else
    update payments set status = 'rejected', decided_by = p_admin, decided_at = now(), decision_reason = left(p_reason,500) where id = pay.id;
    update orders set payment_status = 'payment_rejected' where id = o.id;   -- student may resubmit a new TrxID
  end if;

  insert into payment_events(payment_id, order_id, event, actor_id, reason)
  values (pay.id, o.id, case p_decision when 'approve' then 'payment_approved' else 'payment_rejected' end, p_admin, left(p_reason,500));
  perform write_audit(p_admin, 'payment.' || p_decision, 'payment', pay.id::text, jsonb_build_object('order', o.order_no));
  return jsonb_build_object('payment_id', pay.id, 'status', case p_decision when 'approve' then 'approved' else 'rejected' end, 'already_decided', false);
end $$;

-- ───────────── cancel / refund ─────────────
create function admin_cancel_order(p_admin uuid, p_order uuid, p_reason text, p_refund boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; it record;
begin
  perform require_role(p_admin, case when p_refund then array['payment_verifier'] else array['product_order_manager','payment_verifier'] end::admin_role[]);
  if coalesce(trim(p_reason),'') = '' then raise exception 'reason_required'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.fulfillment_status = 'cancelled' or o.payment_status = 'refunded' then return; end if;   -- idempotent
  if o.payment_status = 'payment_approved' and not p_refund then raise exception 'refund_required'; end if;
  if o.fulfillment_status = 'delivered' then raise exception 'already_delivered'; end if;

  -- Restock reserved books unless already shipped
  if o.has_physical and o.fulfillment_status <> 'shipped' then
    for it in select product_id, quantity from order_items where order_id = o.id and product_type = 'printed_book' loop
      update book_details set stock_quantity = stock_quantity + it.quantity where product_id = it.product_id;
      insert into stock_movements(product_id, delta, reason, order_id, actor_id) values (it.product_id, it.quantity, 'order_released', o.id, p_admin);
    end loop;
  end if;
  update payments set status = 'rejected', decided_by = p_admin, decided_at = now(), decision_reason = 'order_cancelled: ' || left(p_reason,400)
   where order_id = o.id and status = 'pending_verification';
  update entitlements set status = 'revoked', revoked_at = now(), revoke_reason = left(p_reason,400) where order_id = o.id and status = 'active';
  update coupon_redemptions set released_at = now() where order_id = o.id and released_at is null;
  update orders set fulfillment_status = 'cancelled', cancel_reason = left(p_reason,400), cancelled_at = now(), cancelled_by = p_admin,
         payment_status = case when p_refund and o.payment_status = 'payment_approved' then 'refunded' else o.payment_status end
   where id = o.id;
  insert into payment_events(order_id, event, actor_id, reason) values (o.id, case when p_refund then 'order_refunded' else 'order_cancelled' end, p_admin, left(p_reason,400));
  perform write_audit(p_admin, case when p_refund then 'order.refund' else 'order.cancel' end, 'order', o.id::text, jsonb_build_object('order', o.order_no));
end $$;

-- Student-initiated cancel: only while nothing has been paid/submitted.
create function student_cancel_order(p_user uuid, p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order and user_id = p_user for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.payment_status not in ('awaiting_payment','payment_rejected') or o.fulfillment_status = 'cancelled' then
    raise exception 'cannot_cancel'; end if;
  perform admin_cancel_order_internal(o.id, p_user, 'Cancelled by student');
end $$;

create function admin_cancel_order_internal(p_order uuid, p_actor uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; it record;
begin
  select * into o from orders where id = p_order for update;
  if o.has_physical then
    for it in select product_id, quantity from order_items where order_id = o.id and product_type = 'printed_book' loop
      update book_details set stock_quantity = stock_quantity + it.quantity where product_id = it.product_id;
      insert into stock_movements(product_id, delta, reason, order_id, actor_id) values (it.product_id, it.quantity, 'order_released', o.id, p_actor);
    end loop;
  end if;
  update coupon_redemptions set released_at = now() where order_id = o.id and released_at is null;
  update orders set fulfillment_status = 'cancelled', cancel_reason = p_reason, cancelled_at = now(), cancelled_by = p_actor where id = o.id;
  insert into payment_events(order_id, event, actor_id, reason) values (o.id, 'order_cancelled', p_actor, p_reason);
end $$;

-- ───────────── fulfillment & stock ─────────────
create function admin_update_fulfillment(p_admin uuid, p_order uuid, p_status fulfillment_status, p_courier text, p_tracking text)
returns void language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  perform require_role(p_admin, array['product_order_manager']::admin_role[]);
  select * into o from orders where id = p_order for update;
  if not found or not o.has_physical then raise exception 'order_not_found'; end if;
  if o.payment_status <> 'payment_approved' then raise exception 'payment_not_approved'; end if;   -- shipped ≠ paid
  if not ((o.fulfillment_status = 'processing' and p_status = 'shipped')
       or (o.fulfillment_status = 'shipped' and p_status in ('shipped','delivered'))) then
    raise exception 'invalid_transition'; end if;
  update orders set fulfillment_status = p_status, courier = left(p_courier,80), tracking_ref = left(p_tracking,120) where id = o.id;
  perform write_audit(p_admin, 'order.fulfillment', 'order', o.id::text, jsonb_build_object('status', p_status));
end $$;

create function admin_adjust_stock(p_admin uuid, p_product uuid, p_delta int, p_reason text, p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_new int;
begin
  perform require_role(p_admin, array['product_order_manager']::admin_role[]);
  if p_delta = 0 or p_reason not in ('manual_adjustment','restock','return') then raise exception 'invalid_adjustment'; end if;
  update book_details set stock_quantity = stock_quantity + p_delta where product_id = p_product returning stock_quantity into v_new;
  if not found then raise exception 'not_a_book'; end if;      -- CHECK (stock >= 0) blocks negative results
  insert into stock_movements(product_id, delta, reason, actor_id, note) values (p_product, p_delta, p_reason, p_admin, left(p_note,300));
  perform write_audit(p_admin, 'stock.adjust', 'product', p_product::text, jsonb_build_object('delta', p_delta));
  return v_new;
end $$;

-- ───────────── Secure PDF authorisation ─────────────
-- Returns the private asset location ONLY if the caller owns an active, paid entitlement.
-- The Netlify Function then mints a ~60s signed URL. Logging happens here, atomically.
create function authorize_pdf_download(p_user uuid, p_entitlement uuid, p_ip inet, p_ua text)
returns table(bucket text, path text, asset_id uuid, file_name text)
language plpgsql security definer set search_path = public as $$
declare e entitlements%rowtype; a product_assets%rowtype; pr products%rowtype;
begin
  select * into e from entitlements where id = p_entitlement and user_id = p_user;
  if not found or e.status <> 'active' or e.product_type <> 'pdf_book' then raise exception 'not_entitled'; end if;
  if not exists (select 1 from orders where id = e.order_id and user_id = p_user and payment_status = 'payment_approved') then
    raise exception 'not_entitled'; end if;
  select * into a from product_assets where product_id = e.product_id and kind = 'pdf_private';
  if not found then raise exception 'file_missing'; end if;
  select * into pr from products where id = e.product_id;
  insert into download_logs(user_id, entitlement_id, asset_id, ip, user_agent) values (p_user, e.id, a.id, p_ip, left(p_ua,300));
  return query select a.bucket, a.path, a.id, (pr.slug || '.pdf')::text;
end $$;

-- ───────────── Lock down execution ─────────────
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('create_order','submit_payment','decide_payment','admin_cancel_order','student_cancel_order','admin_cancel_order_internal',
            'admin_update_fulfillment','admin_adjust_stock','authorize_pdf_download','check_rate_limit','write_audit','require_role','staff_has_role')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
