# Deployment & Setup Guide

> Honest status: this code has **not** been installed, built, or run against a real Supabase/Netlify project yet.
> Expect to fix small errors on the first `npm install && npm run build` and the first migration run. Do steps 1–3 on a **test** project first.

## 1. Supabase
1. Create a project (region close to Bangladesh, e.g. Singapore).
2. **SQL Editor** → run, in order: `0001_schema.sql`, `0002_functions.sql`, `0003_rls_storage_seed.sql`, `0004_quote_order.sql`. Fix any error before continuing.
3. On the **test** project, run `supabase/tests/001_business_rules.sql`. Success prints `ALL BUSINESS-RULE TESTS PASSED`; it rolls back all test data.
4. **Authentication → Providers → Email**: enable; keep "Confirm email" ON; set minimum password length 8.
5. **Authentication → URL Configuration**: Site URL `https://bupadmission.com`; add redirect URLs `https://bupadmission.com/**` and your Netlify preview/dev URLs.
6. **Authentication → Rate Limits**: keep defaults or tighten sign-in/sign-up/reset limits (this is the login brute-force protection).
7. **Authentication → SMTP**: configure a real SMTP sender (default Supabase email is heavily rate-limited, unsuitable for production).
8. **Storage**: confirm buckets `product-covers` (public) and `paid-pdfs` (**private**) exist. Do NOT add storage policies to `paid-pdfs`.
9. **Project Settings → API**: copy Project URL, `anon` key, and `service_role` key (secret).
10. Enable daily backups (paid plan) or schedule exports before launch.

## 2. First Super Admin (secure role assignment)
Roles live only in `admin_roles`; there is no UI path to the first admin by design.
1. Register normally on the site with the owner's email and verify it.
2. SQL Editor (runs as owner):
```sql
insert into admin_roles(user_id, role)
select id, 'super_admin' from auth.users where email = 'OWNER@EXAMPLE.COM';
```
3. Log in → "অ্যাডমিন" appears. Further roles: Admin → রোল (Super Admin only).
Use a unique strong password and enable email security for this account.

## 3. Netlify
1. Push the repo to GitHub/GitLab; Netlify → Add site → Import. Build command `npm run build`, publish `dist`, functions `netlify/functions` (already in `netlify.toml`).
2. **Site settings → Environment variables** (see `.env.example`):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL` (browser-safe)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (**secret**; mark as secret, scope to Functions)
   - `TELEGRAM_BOT_TOKEN` (optional)
3. Deploy. Domain management → add `bupadmission.com`, enable HTTPS.
4. Verify: `/sitemap.xml` loads, `/robots.txt` loads, a random URL shows the 404 page.
5. If the CSP blocks something you legitimately need, adjust it in `netlify.toml` (do not add `unsafe-eval`/wildcards).

## 4. Configure the business (Admin Panel, after login as Super Admin)
| What | Where |
|---|---|
| bKash/Nagad numbers, account type, Bangla instructions, enable/disable | সেটিংস → পেমেন্ট |
| WhatsApp number, waiting minutes (default 60), message template | সেটিংস → সাপোর্ট |
| Delivery charges per area, default zone, free-delivery threshold | সেটিংস → ডেলিভারি চার্জ |
| Site name, announcement, homepage text, social links, SEO | সেটিংস |
| Policies (terms, privacy, refund, shipping, about, FAQ) | কনটেন্ট |
| Products, prices, covers, PDFs, stock | পণ্য / ইনভেন্টরি |
| Telegram per course/batch | পণ্য → edit → টেলিগ্রাম অ্যাক্সেস |
| Coupons | কুপন |

Payment numbers are intentionally **empty** until you enter them; the order page shows "no payment method enabled" until then.
Shipping charge is **৳0 until you set it** — set the default zone before selling books.

## 4b. Extra pieces
- **Logo:** Settings → লোগো (Super Admin). JPG/PNG/WebP up to 2 MB.
- **Auto-cancel unpaid orders:** `expire-orders` runs hourly (Netlify scheduled function). Set the hours in Settings → অপরিশোধিত অর্ডার. It never cancels an order whose payment is awaiting verification or approved.
- **Link previews:** `/p/:slug` is served by the `product-page` function (see `netlify.toml`) so shared product links show title/description/image.
- **Unit tests:** `npm run test:unit` (Node 22+).

## 5. Telegram
**Manual (works with no setup):** paste a private group invite link and instructions on the product; it is shown only to students with an approved order.
**Bot (single-use 24h invites):**
1. @BotFather → `/newbot` → copy token → Netlify env `TELEGRAM_BOT_TOKEN` → redeploy.
2. Add the bot as **admin** in the private group/channel with "Invite users via link".
3. Get the chat id (starts with `-100…`) and put it in the product's Chat ID; choose method "বট দিয়ে…".
Limitation: Telegram cannot stop a member from sharing content or screenshots; single-use links only limit link forwarding.

## 6. PDFs
Create a PDF product → save → upload the PDF in "ফাইল". The server verifies the file starts with `%PDF-`. Downloads use 60-second signed links after an entitlement check.

## 7. Local development
`npm install`, copy `.env.example` → `.env` with real values, `npm run dev` (Netlify CLI serves site + functions).
