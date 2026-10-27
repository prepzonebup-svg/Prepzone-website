# MasterMind — Architecture & Threat Model (Phase 1)

## Stack
React + TypeScript (Vite) SPA with prerendered meta tags → Netlify. Supabase (Postgres, Auth, Storage). Netlify Functions (TypeScript) for every privileged operation. Manual bKash/Nagad payments only. Telegram via bot (optional) or admin-managed manual invites.

## Security boundaries
| Layer | Can do | Cannot do |
|---|---|---|
| Browser (anon/authenticated key) | Read published catalogue, own orders/payments/entitlements; staff CMS/catalogue edits via RLS | Write orders, payments, entitlements, stock; read private PDFs, Telegram links, coupons |
| Netlify Function (service_role) | Verify JWT → call SECURITY DEFINER functions with the *verified* user id | Trust any user id, price, or path from the request body |
| Postgres functions | Compute prices/stock/shipping, approve payments, create entitlements atomically | Be called by browsers (execute revoked) |

Rule: a function never accepts `user_id` from the client. It reads the bearer token, calls `supabase.auth.getUser(token)`, and passes that id.

## Planned Netlify Functions
`create-order`, `submit-payment`, `cancel-order`, `pdf-download`, `my-telegram-access`, `admin-decide-payment`, `admin-cancel-order`, `admin-fulfillment`, `admin-adjust-stock`, `admin-upload-url` (signed upload for covers/PDFs, validates type/size), `admin-roles` (super admin), `admin-dashboard` (aggregates), `telegram-provision` (bot invite creation).

## Project structure
```
mastermind/
  supabase/migrations/0001_schema.sql, 0002_functions.sql, 0003_rls_storage_seed.sql
  netlify/functions/*.ts   netlify/functions/_lib/{auth,supabase,errors,validate}.ts
  src/{pages,components,admin,lib,i18n}   public/{robots.txt,_redirects}
  docs/{ARCHITECTURE.md,DEPLOY.md,LAUNCH_CHECKLIST.md}
  .env.example  netlify.toml  package.json
```

## Key design decisions
- **Payment vs fulfillment** are separate columns (`orders.payment_status`, `orders.fulfillment_status`); shipping is rejected unless payment is approved.
- **Stock policy:** reserved (decremented) at order creation under a row lock; released on cancel/refund. `CHECK (stock_quantity >= 0)` is the last line of defence. Known limitation: abandoned unpaid orders hold stock until cancelled (a configurable expiry job is a later task).
- **TrxID uniqueness:** partial unique index per (method, trx_id) for non-rejected payments; a rejected TrxID reused elsewhere is allowed but logged as `flagged_reused_rejected_trx`.
- **One-hour rule:** UI compares `now - payments.submitted_at` (server-set) to `site_settings.support.waiting_minutes`. Display-only; no code path approves by time.
- **Approval requires verified amount:** verifier enters the amount seen in the bKash/Nagad account; it must equal order total.
- **Roles** only in `admin_roles`; Super Admin implicitly holds all roles.
- **PDFs:** private bucket `paid-pdfs`, no storage policies. `authorize_pdf_download` checks ownership + approved payment + active entitlement, logs, then the function signs a 60-second URL.

## Threat model
| # | Threat | Mitigation |
|---|---|---|
| 1 | Fake TrxID / screenshot | Manual verification against the real account; amount re-entered by verifier |
| 2 | TrxID reused on many orders | Partial unique index + pre-check + race handler |
| 3 | Student edits price/status | No client write grants; prices computed in `create_order` |
| 4 | IDOR on orders/PDFs | RLS owner checks; functions filter `user_id = verified id` |
| 5 | Direct PDF URL | Private bucket, 60s signed URL only after entitlement check |
| 6 | Link sharing of signed URL | Short expiry + download logs + rate limit; residual risk: a paid user can share the file itself |
| 7 | Oversell race | `FOR UPDATE` on book row + CHECK constraint |
| 8 | Double click / retries | Idempotency key on orders; idempotent approve and entitlements |
| 9 | Insider abuse | Role checks in DB, mandatory reasons, append-only audit/payment events |
| 10 | Telegram invite forwarding | Prefer single-use, member-limited invites via bot; manual links shown only post-approval; limitation documented |
| 11 | Privilege escalation | Roles not in user_metadata; `admin_roles` writable by Super Admin only |
| 12 | Brute force / abuse | `check_rate_limit` on login-adjacent, payment submit, download endpoints |
| 13 | XSS via CMS | Markdown rendered with sanitiser; no raw HTML |

## Not yet done (honest status)
Frontend, Netlify Functions, admin UI, DEPLOY/LAUNCH docs, `.env.example`, automated tests. Migrations have **not** been run on a real database.
