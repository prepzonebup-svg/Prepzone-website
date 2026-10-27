# Production Launch Checklist

## Legal / business (owner action — not something code can settle)
- [ ] Confirm bKash/Nagad terms for receiving payments for goods/services on a personal number; use an appropriate (e.g. merchant/agent) account if required.
- [ ] Write real Terms, Privacy, Refund and Delivery policies (Admin → কনটেন্ট). Do not publish the empty placeholders.
- [ ] Decide refund handling: the system records refunds and revokes access; money is returned manually.

## Configuration
- [ ] All 4 migrations applied without error on production; test file passed on a staging project.
- [ ] bKash/Nagad numbers, WhatsApp number, waiting time, default shipping zone set.
- [ ] Super Admin created; each staff member has the minimum role; roles reviewed.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only in Netlify env (never in repo or `VITE_*`).
- [ ] SMTP configured; sign-up email confirmation and password-reset emails tested end to end.
- [ ] `paid-pdfs` bucket confirmed private; open a PDF's raw storage URL in a private window → must fail.

## Functional smoke test (production, with a real small-value product)
- [ ] Register → buy course → submit payment → shows "যাচাই করা হচ্ছে".
- [ ] Set waiting minutes to 1 temporarily: red support button appears and opens WhatsApp with order ID + product; restore to 60. Confirm the order is still pending.
- [ ] Approve in Admin with the correct amount → Telegram access appears; wrong amount is refused.
- [ ] Submit the same TrxID on a second order → refused/flagged.
- [ ] PDF: pending order cannot download; approved can; second account cannot.
- [ ] Book: stock decrements, cancel restores, out-of-stock blocks, delivery charge correct per area.
- [ ] Mobile (Android Chrome) walkthrough of checkout and order page.

## Security
- [ ] Try changing an order UUID in the URL as another user → 404.
- [ ] Browser devtools: `supabase.from('orders').update(...)` as a student is denied.
- [ ] Review Supabase Auth rate limits and enable CAPTCHA (Auth → Bot protection) if abuse appears.
- [ ] Netlify: enable deploy notifications; restrict who can edit env vars.
- [ ] Backups enabled and a restore tested.

## Known limitations to plan for
- Editable labels: only homepage headline/subtitle, announcement bar and CMS pages are editable; other UI labels are fixed in code.
- Staff can read payment sender numbers/TrxIDs (needed for verification); keep the staff list short.
- Link previews depend on `/p/:slug` going through the `product-page` function; verify with a WhatsApp/Facebook share test after deploy.
- Unpaid orders auto-cancel after the configured hours (default 48, Settings → অপরিশোধিত অর্ডার) via an hourly scheduled function; confirm it appears under Netlify → Functions → Scheduled.
- Tests: SQL business rules (not yet run), 8 unit tests (run and passing). No browser/E2E tests.
- Refunds are recorded in the system; the money must be sent back manually through bKash/Nagad.
