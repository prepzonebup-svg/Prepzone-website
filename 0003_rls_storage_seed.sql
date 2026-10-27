-- Row Level Security, storage buckets, and neutral seed data.
-- STATUS: written but NOT yet executed against a real Postgres/Supabase instance.
--
-- Model: browsers (role `authenticated`) may only READ what RLS allows plus do catalogue/CMS
-- writes if they hold a staff role. Orders, payments, entitlements and stock are written
-- ONLY by the SECURITY DEFINER functions in 0002 via service_role.

-- RLS-safe role check (evaluated for the calling user).
create function is_staff(p_roles admin_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_roles where user_id = auth.uid() and (role = 'super_admin' or role = any(p_roles)))
$$;
revoke all on function is_staff(admin_role[]) from public, anon;
grant execute on function is_staff(admin_role[]) to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['profiles','admin_roles','categories','products','product_assets','book_details','batch_details',
    'telegram_access','stock_movements','shipping_zones','coupons','orders','order_items','coupon_redemptions','payments',
    'payment_events','staff_notes','entitlements','download_logs','site_settings','cms_pages','banners','audit_logs','rate_limits']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- Default-deny for client roles on tables with no policy below (rate_limits, coupon_redemptions for students…).
-- Profiles: own row; users can edit name/phone only (no role columns exist here).
create policy profiles_self_read   on profiles for select to authenticated using (id = auth.uid() or is_staff(array['product_order_manager','payment_verifier']::admin_role[]));
create policy profiles_self_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Roles: super admin manages; everyone can read only their own rows.
create policy roles_self_read on admin_roles for select to authenticated using (user_id = auth.uid() or is_staff(array[]::admin_role[]));
create policy roles_super_write on admin_roles for all to authenticated
  using (is_staff(array[]::admin_role[])) with check (is_staff(array[]::admin_role[]));

-- Public catalogue (published only) + staff management.
create policy categories_read on categories for select to anon, authenticated using (true);
create policy categories_staff on categories for all to authenticated
  using (is_staff(array['product_order_manager']::admin_role[])) with check (is_staff(array['product_order_manager']::admin_role[]));

create policy products_public_read on products for select to anon, authenticated
  using (status = 'published' or is_staff(array['product_order_manager']::admin_role[]));
create policy products_staff on products for all to authenticated
  using (is_staff(array['product_order_manager']::admin_role[])) with check (is_staff(array['product_order_manager']::admin_role[]));

-- Private PDF assets are NEVER listed to clients (only gallery/sample).
create policy assets_public_read on product_assets for select to anon, authenticated
  using ((kind <> 'pdf_private' and exists (select 1 from products p where p.id = product_id and p.status = 'published'))
         or is_staff(array['product_order_manager']::admin_role[]));
create policy assets_staff on product_assets for all to authenticated
  using (is_staff(array['product_order_manager']::admin_role[])) with check (is_staff(array['product_order_manager']::admin_role[]));

create policy books_read on book_details for select to anon, authenticated
  using (exists (select 1 from products p where p.id = product_id and p.status = 'published') or is_staff(array['product_order_manager']::admin_role[]));
-- Staff may edit book metadata; stock changes must go through admin_adjust_stock (audited).
create policy books_staff_ins on book_details for insert to authenticated with check (is_staff(array['product_order_manager']::admin_role[]));
create policy books_staff_upd on book_details for update to authenticated
  using (is_staff(array['product_order_manager']::admin_role[])) with check (is_staff(array['product_order_manager']::admin_role[]));
-- Column-level privileges: a column REVOKE would NOT override a table-level GRANT, so reset at table level.
revoke insert, update on book_details from authenticated;
grant insert (product_id, author, sku, weight_grams, low_stock_threshold, max_per_order) on book_details to authenticated;
grant update (author, sku, weight_grams, low_stock_threshold, max_per_order) on book_details to authenticated;   -- stock only via admin_adjust_stock

create policy batch_read on batch_details for select to anon, authenticated
  using (exists (select 1 from products p where p.id = product_id and p.status = 'published') or is_staff(array['product_order_manager']::admin_role[]));
create policy batch_staff on batch_details for all to authenticated
  using (is_staff(array['product_order_manager']::admin_role[])) with check (is_staff(array['product_order_manager']::admin_role[]));

-- Telegram destinations: staff only. Students get access text via a server function after entitlement check.
create policy tg_staff on telegram_access for all to authenticated
  using (is_staff(array['product_order_manager']::admin_role[])) with check (is_staff(array['product_order_manager']::admin_role[]));

create policy shipping_read on shipping_zones for select to anon, authenticated using (is_active or is_staff(array['product_order_manager']::admin_role[]));
create policy shipping_staff on shipping_zones for all to authenticated
  using (is_staff(array['product_order_manager']::admin_role[])) with check (is_staff(array['product_order_manager']::admin_role[]));

-- Coupons: not readable by clients (validated server-side in create_order); staff manage.
create policy coupons_staff on coupons for all to authenticated
  using (is_staff(array['product_order_manager']::admin_role[])) with check (is_staff(array['product_order_manager']::admin_role[]));
create policy redemptions_staff_read on coupon_redemptions for select to authenticated using (is_staff(array['product_order_manager']::admin_role[]));

-- Orders / items / payments / entitlements / downloads: owner read-only, staff read-only. No client writes.
create policy orders_owner_read on orders for select to authenticated
  using (user_id = auth.uid() or is_staff(array['product_order_manager','payment_verifier']::admin_role[]));
create policy items_owner_read on order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_staff(array['product_order_manager','payment_verifier']::admin_role[]))));
create policy payments_owner_read on payments for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()) or is_staff(array['payment_verifier']::admin_role[]));
create policy pevents_staff_read on payment_events for select to authenticated using (is_staff(array['payment_verifier','product_order_manager']::admin_role[]));
create policy notes_staff_read on staff_notes for select to authenticated using (is_staff(array['payment_verifier','product_order_manager']::admin_role[]));
create policy notes_staff_write on staff_notes for insert to authenticated
  with check (author_id = auth.uid() and is_staff(array['payment_verifier','product_order_manager']::admin_role[]));
create policy ent_owner_read on entitlements for select to authenticated
  using (user_id = auth.uid() or is_staff(array['product_order_manager','payment_verifier']::admin_role[]));
create policy dl_owner_read on download_logs for select to authenticated
  using (user_id = auth.uid() or is_staff(array[]::admin_role[]));
create policy stock_staff_read on stock_movements for select to authenticated using (is_staff(array['product_order_manager']::admin_role[]));
create policy audit_super_read on audit_logs for select to authenticated using (is_staff(array[]::admin_role[]));

-- Settings: visibility tiers; writes super admin only.
create policy settings_read on site_settings for select to anon, authenticated
  using (visibility = 'public' or (visibility = 'authenticated' and auth.uid() is not null) or is_staff(array[]::admin_role[]));
create policy settings_super_write on site_settings for all to authenticated
  using (is_staff(array[]::admin_role[])) with check (is_staff(array[]::admin_role[]));

create policy cms_read on cms_pages for select to anon, authenticated using (status = 'published' or is_staff(array['product_order_manager']::admin_role[]));
create policy cms_staff on cms_pages for all to authenticated
  using (is_staff(array['product_order_manager']::admin_role[])) with check (is_staff(array['product_order_manager']::admin_role[]));
create policy banners_read on banners for select to anon, authenticated using (is_active or is_staff(array['product_order_manager']::admin_role[]));
create policy banners_staff on banners for all to authenticated
  using (is_staff(array['product_order_manager']::admin_role[])) with check (is_staff(array['product_order_manager']::admin_role[]));

-- Defence in depth: strip table-level write privileges where clients must never write.
revoke insert, update, delete on orders, order_items, payments, payment_events, entitlements, download_logs,
  stock_movements, audit_logs, coupon_redemptions, rate_limits from anon, authenticated;
revoke all on rate_limits from anon, authenticated;

-- ───────────── Storage ─────────────
-- product-covers: public images. paid-pdfs: PRIVATE; no storage.objects policies → only service_role can touch it.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
  ('product-covers','product-covers', true,  5242880,   array['image/jpeg','image/png','image/webp']),
  ('paid-pdfs',     'paid-pdfs',      false, 104857600, array['application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ───────────── Neutral seed (placeholders only — no real numbers) ─────────────
insert into site_settings(key, value, visibility) values
 ('brand', '{"name":"MasterMind University Admission Programme","domain":"bupadmission.com","logo_path":null,"primary_color":"#1d4ed8","announcement":""}', 'public'),
 ('payment', '{"bkash":{"enabled":false,"number":"","account_type":"","instructions_bn":""},
               "nagad":{"enabled":false,"number":"","account_type":"","instructions_bn":""},
               "reference_hint_bn":"পেমেন্টের সময় রেফারেন্স হিসেবে আপনার Order ID লিখুন।"}', 'authenticated'),
 ('support', '{"whatsapp_number":"","waiting_minutes":60,
               "default_message_bn":"আসসালামু আলাইকুম, আমি আমার পেমেন্টের অনুমোদন সম্পর্কে জানতে চাই। Order ID: {ORDER_ID}. Product: {PRODUCT_NAME}. পেমেন্ট সাবমিট করার পর ১ ঘণ্টার বেশি সময় হয়েছে, কিন্তু এখনো অনুমোদন পাইনি।",
               "alt_channel_label":"","alt_channel_url":"","email":""}', 'public'),
 ('social', '{"facebook":"","youtube":"","telegram":""}', 'public'),
 ('seo', '{"default_title":"MasterMind University Admission Programme","default_description":""}', 'public')
on conflict (key) do nothing;

insert into cms_pages(slug, title) values
 ('about','About Us'),('faq','FAQ'),('privacy','Privacy Policy'),('terms','Terms and Conditions'),
 ('refund','Refund Policy'),('shipping','Shipping and Delivery Policy')
on conflict (slug) do nothing;

-- Single default shipping zone; admin edits the real charge (0 until configured).
insert into shipping_zones(name, charge, is_default) values ('Default', 0, true) on conflict do nothing;
