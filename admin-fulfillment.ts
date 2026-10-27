import { z } from 'zod';
import { route, rpc } from './_lib/handler';

export const handler = route(
  z.object({ order_id: z.string().uuid(), status: z.enum(['shipped', 'delivered']),
             courier: z.string().trim().max(80).default(''), tracking: z.string().trim().max(120).default('') }).strict(),
  async ({ user, body }) => { await rpc('admin_update_fulfillment', { p_admin: user.id, p_order: body.order_id, p_status: body.status, p_courier: body.courier, p_tracking: body.tracking }); return {}; });
