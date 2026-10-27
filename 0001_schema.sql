-- MasterMind University Admission Programme — schema
-- Apply in order: 0001_schema.sql, 0002_functions.sql, 0003_rls_storage_seed.sql
-- STATUS: written but NOT yet executed against a real Postgres/Supabase instance.

create extension if not exists pgcrypto;

-- ───────────── Enums ─────────────
create type product_type       as enum ('course','exam_batch','printed_book','pdf_book');
create type publish_status     as enum ('draft','published','unpublished','archived');
create type payment_method     as enum ('bkash','nagad');
-- Payment state (money) and fulfillment state (goods) are separate columns on purpose.
create type order_payment_status as enum
  ('awaiting_payment','pending_verification','payment_approved','payment_rejected','refunded');
create type fulfillment_status as enum
  ('not_applicable','processing','shipped','delivered','cancelled');
create type payment_record_status as enum ('pending_verification','approved','rejected');
create type admin_role         as enum ('super_admin','product_order_manager','payment_verifier');
create type entitlement_status as enum ('active','revoked');
create type telegram_status    as enum ('not_required','pending','provisioned','manual','failed');
create type discount_type      as enum ('percent','fixed');

-- ───────────── Helpers ─────────────
create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Normalises Bangladeshi mobile numbers to 01XXXXXXXXX; returns null if invalid.
create function normalize_bd_phone(p text) returns text language sql immutable as $$
  select case when d ~ '^01[3-9][0-9]{8}$' then d end
  from (select regexp_replace(regexp_replace(coalesce(p,''), '[^0-9+]', '', 'g'), '^(\+?88)', '') as d) s
$$;

-- ───────────── Identity ─────────────
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles for each row execute function set_updated_at();

-- Roles live ONLY here. Never in user_metadata (user-editable).
create table admin_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       admin_role not null,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, full_name, phone)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name',''),120),
          normalize_bd_phone(new.raw_user_meta_data->>'phone'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ───────────── Catalogue ─────────────
create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0
);

create table products (
  id             uuid primary key default gen_random_uuid(),
  type           product_type not null,
  category_id    uuid references categories(id) on delete set null,
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title          text not null,
  short_desc     text,
  description    text,                       -- sanitised/markdown only; rendered without raw HTML
  cover_path     text,                       -- path in public bucket product-covers
  price_original numeric(12,2) check (price_original is null or price_original >= 0),
  price_selling  numeric(12,2) not null check (price_selling > 0),
  status         publish_status not null default 'draft',
  available_from timestamptz,
  available_until timestamptz,
  benefits       jsonb not null default '[]',
  faqs           jsonb not null default '[]',
  purchase_note  text,
  is_featured    boolean not null default false,
  seo_title      text,
  seo_description text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (price_original is null or price_original >= price_selling)
);
create index idx_products_listing on products(type, status, is_featured, created_at desc);
create trigger trg_products_updated before update on products for each row execute function set_updated_at();

create table product_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  kind text not null check (kind in ('gallery','pdf_private','pdf_sample')),
  bucket text not null,
  path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
create index idx_assets_product on product_assets(product_id, kind);
-- Only one active private PDF per product.
create unique index uq_one_private_pdf on product_assets(product_id) where kind = 'pdf_private';

create table book_details (
  product_id uuid primary key references products(id) on delete cascade,
  author text,
  sku text unique,
  weight_grams int check (weight_grams is null or weight_grams >= 0),
  stock_quantity int not null default 0 check (stock_quantity >= 0),  -- DB-level oversell guard
  low_stock_threshold int not null default 5 check (low_stock_threshold >= 0),
  max_per_order int not null default 10 check (max_per_order between 1 and 50)
);

create table batch_details (
  product_id uuid primary key references products(id) on delete cascade,
  starts_on date,
  ends_on date,
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

-- Admin-only. Students receive access only through entitlements (server-side).
create table telegram_access (
  product_id uuid primary key references products(id) on delete cascade,
  is_enabled boolean not null default false,
  method text not null default 'manual' check (method in ('manual','bot_invite')),
  chat_id text,            -- for bot_invite
  invite_link text,        -- for manual; NEVER exposed to unpaid users
  instructions text,
  updated_at timestamptz not null default now()
);

create table stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references products(id),
  delta int not null check (delta <> 0),
  reason text not null check (reason in ('order_reserved','order_released','manual_adjustment','restock','return')),
  order_id uuid,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index idx_stock_mv_product on stock_movements(product_id, created_at desc);

create table shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  areas text[] not null default '{}',
  charge numeric(10,2) not null check (charge >= 0),
  free_over numeric(12,2) check (free_over is null or free_over > 0),
  is_default boolean not null default false,
  is_active boolean not null default true
);
create unique index uq_default_zone on shipping_zones(is_default) where is_default;

-- ───────────── Coupons ─────────────
create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  type discount_type not null,
  value numeric(12,2) not null check (value > 0),
  max_discount numeric(12,2),
  min_order numeric(12,2) not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit int,
  per_user_limit int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (type <> 'percent' or value <= 100)
);

-- ───────────── Orders & payments ─────────────
create sequence order_no_seq;

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('MM-' || to_char(now() at time zone 'Asia/Dhaka','YYMM') || '-' || lpad(nextval('order_no_seq')::text,5,'0')),
  user_id uuid not null references auth.users(id),
  idempotency_key text not null,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  shipping_charge numeric(12,2) not null default 0 check (shipping_charge >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  coupon_id uuid references coupons(id),
  payment_status order_payment_status not null default 'awaiting_payment',
  fulfillment_status fulfillment_status not null default 'not_applicable',
  has_physical boolean not null default false,
  ship_name text, ship_phone text, ship_address text, ship_area text, ship_note text,
  courier text, tracking_ref text,
  cancel_reason text, cancelled_at timestamptz, cancelled_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (not has_physical or (ship_name is not null and ship_phone is not null and ship_address is not null and ship_area is not null))
);
create index idx_orders_user on orders(user_id, created_at desc);
create index idx_orders_status on orders(payment_status, fulfillment_status, created_at desc);
create trigger trg_orders_updated before update on orders for each row execute function set_updated_at();

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  product_title text not null,          -- snapshot
  product_type product_type not null,   -- snapshot
  unit_price numeric(12,2) not null check (unit_price >= 0),  -- snapshot
  quantity int not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);
create index idx_items_order on order_items(order_id);

create table coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id),
  order_id uuid not null unique references orders(id),
  user_id uuid not null references auth.users(id),
  discount numeric(12,2) not null,
  released_at timestamptz,               -- set when order cancelled/refunded
  created_at timestamptz not null default now()
);
create index idx_redemptions_coupon on coupon_redemptions(coupon_id) where released_at is null;

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  method payment_method not null,
  sender_number text not null,
  trx_id text not null check (trx_id ~ '^[A-Z0-9]{6,20}$'),
  amount numeric(12,2) not null check (amount > 0),       -- copied from orders.total at submit time
  note text,
  status payment_record_status not null default 'pending_verification',
  submitted_at timestamptz not null default now(),        -- trusted server clock; drives the 1-hour rule
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_reason text,
  check ((status = 'pending_verification') = (decided_at is null))
);
-- One TrxID can back only one live (pending/approved) payment per method.
create unique index uq_payment_trx_live on payments(method, trx_id) where status <> 'rejected';
-- One live payment per order.
create unique index uq_payment_order_live on payments(order_id) where status <> 'rejected';
create index idx_payments_queue on payments(status, submitted_at);
create index idx_payments_trx on payments(trx_id);

-- Append-only audit of every payment/order decision.
create table payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid references payments(id),
  order_id uuid not null references orders(id),
  event text not null,
  actor_id uuid,
  reason text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_pevents_order on payment_events(order_id, created_at);

-- Staff-only notes (kept out of student-readable tables).
create table staff_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  payment_id uuid references payments(id),
  author_id uuid not null references auth.users(id),
  note text not null check (length(note) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- ───────────── Entitlements & downloads ─────────────
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  order_id uuid not null references orders(id),
  order_item_id uuid not null unique references order_items(id),   -- idempotency: one entitlement per item
  product_id uuid not null references products(id),
  product_type product_type not null,
  status entitlement_status not null default 'active',
  telegram telegram_status not null default 'not_required',
  telegram_note text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text
);
create index idx_ent_user on entitlements(user_id, status);

create table download_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  entitlement_id uuid not null references entitlements(id),
  asset_id uuid not null references product_assets(id),
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_dl_ent on download_logs(entitlement_id, created_at desc);

-- ───────────── Settings, CMS, audit, rate limits ─────────────
create table site_settings (
  key text primary key,
  value jsonb not null,
  visibility text not null default 'public' check (visibility in ('public','authenticated','admin')),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table cms_pages (
  slug text primary key,                 -- privacy, terms, refund, shipping, about, faq...
  title text not null,
  body_md text not null default '',      -- Markdown only; sanitised at render time
  status publish_status not null default 'published',
  seo_description text,
  updated_at timestamptz not null default now()
);

create table banners (
  id uuid primary key default gen_random_uuid(),
  title text, subtitle text, image_path text, link_url text,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}',   -- never put secrets/PII beyond ids here
  created_at timestamptz not null default now()
);
create index idx_audit_entity on audit_logs(entity, entity_id, created_at desc);

create table rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);

-- Append-only enforcement
create function forbid_mutation() returns trigger language plpgsql as $$
begin raise exception 'append-only table: % not allowed on %', tg_op, tg_table_name; end $$;
create trigger trg_pe_append before update or delete on payment_events for each row execute function forbid_mutation();
create trigger trg_audit_append before update or delete on audit_logs for each row execute function forbid_mutation();
create trigger trg_stock_append before update or delete on stock_movements for each row execute function forbid_mutation();
create trigger trg_dl_append before update or delete on download_logs for each row execute function forbid_mutation();
