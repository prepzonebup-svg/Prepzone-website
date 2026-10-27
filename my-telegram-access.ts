import { z } from 'zod';
import { route, rateLimit, HttpError } from './_lib/handler';
import { admin } from './_lib/supabase';

const schema = z.object({ entitlement_id: z.string().uuid() }).strict();

// Returns Telegram access info ONLY for an active entitlement on an approved order.
export const handler = route(schema, async ({ user, body }) => {
  await rateLimit(`tg:${user.id}`, 10, 3600);
  const { data: e } = await admin.from('entitlements')
    .select('id, product_id, product_type, status, telegram, telegram_note, order_id')
    .eq('id', body.entitlement_id).eq('user_id', user.id).maybeSingle();
  if (!e || e.status !== 'active' || !['course', 'exam_batch'].includes(e.product_type)) throw new HttpError(403, 'not_entitled');
  const { data: o } = await admin.from('orders').select('payment_status').eq('id', e.order_id).eq('user_id', user.id).maybeSingle();
  if (o?.payment_status !== 'payment_approved') throw new HttpError(403, 'not_entitled');

  const { data: t } = await admin.from('telegram_access').select('*').eq('product_id', e.product_id).maybeSingle();
  if (!t || !t.is_enabled) return { mode: 'manual', instructions: t?.instructions ?? null, invite_link: null };

  if (t.method === 'manual') return { mode: 'manual', instructions: t.instructions, invite_link: t.invite_link };

  // bot_invite: single-use, 24h invite created with the bot token (Netlify env only).
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !t.chat_id) return { mode: 'pending_admin', instructions: t.instructions, invite_link: null };

  const cached = safeParse(e.telegram_note);
  if (e.telegram === 'provisioned' && cached?.link && cached.expires > Date.now() / 1000) {
    return { mode: 'bot_invite', instructions: t.instructions, invite_link: cached.link };
  }
  await rateLimit(`tg-issue:${e.id}`, 3, 86400);
  const expires = Math.floor(Date.now() / 1000) + 86400;
  const res = await fetch(`https://api.telegram.org/bot${token}/createChatInviteLink`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: t.chat_id, member_limit: 1, expire_date: expires, name: `ent-${e.id.slice(0, 8)}` }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.ok) {
    await admin.from('entitlements').update({ telegram: 'failed', telegram_note: 'bot_error' }).eq('id', e.id);
    return { mode: 'pending_admin', instructions: t.instructions, invite_link: null };
  }
  const link = json.result.invite_link as string;
  await admin.from('entitlements').update({ telegram: 'provisioned', telegram_note: JSON.stringify({ link, expires }) }).eq('id', e.id);
  return { mode: 'bot_invite', instructions: t.instructions, invite_link: link };
});

function safeParse(s: string | null): { link: string; expires: number } | null {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}
