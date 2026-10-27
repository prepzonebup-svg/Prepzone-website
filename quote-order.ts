import { z } from 'zod';
import { route, rpc, rateLimit } from './_lib/handler';

const schema = z.object({
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(10),
  shipping: z.object({ name: z.string().max(120).optional(), phone: z.string().max(20).optional(), address: z.string().max(400).optional(), area: z.string().max(80).optional() }).optional(),
  coupon: z.string().trim().max(40).optional(),
}).strict();

export const handler = route(schema, async ({ user, body }) => {
  await rateLimit(`quote:${user.id}`, 40, 600);
  return rpc('quote_order', { p_user: user.id, p_items: body.items, p_shipping: body.shipping ?? {}, p_coupon: body.coupon ?? null });
});
