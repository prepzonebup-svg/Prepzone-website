import { z } from 'zod';
import { route, rpc } from './_lib/handler';

export const handler = route(
  z.object({ product_id: z.string().uuid(), delta: z.number().int().min(-10000).max(10000).refine((n) => n !== 0),
             reason: z.enum(['manual_adjustment', 'restock', 'return']), note: z.string().trim().max(300).optional() }).strict(),
  async ({ user, body }) => ({ stock: await rpc<number>('admin_adjust_stock', { p_admin: user.id, p_product: body.product_id, p_delta: body.delta, p_reason: body.reason, p_note: body.note ?? null }) }));
