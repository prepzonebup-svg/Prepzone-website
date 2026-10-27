import { z } from 'zod';
import { route, rpc } from './_lib/handler';

export const handler = route(
  z.object({ order_id: z.string().uuid(), reason: z.string().trim().min(3).max(400), refund: z.boolean().default(false) }).strict(),
  async ({ user, body }) => { await rpc('admin_cancel_order', { p_admin: user.id, p_order: body.order_id, p_reason: body.reason, p_refund: body.refund }); return {}; });
