import { z } from 'zod';
import { route, rpc, rateLimit } from './_lib/handler';

const schema = z.object({
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(10),
  shipping: z.object({
    name: z.string().trim().min(2).max(120), phone: z.string().trim().max(20),
    address: z.string().trim().min(5).max(400), area: z.string().trim().min(2).max(80),
    note: z.string().trim().max(400).optional(),
  }).optional(),
  coupon: z.string().trim().max(40).optional(),
  idempotency_key: z.string().min(8).max(64),
}).strict();

export const handler = route(schema, async ({ user, body }) => {
  await rateLimit(`order:${user.id}`, 10, 600);
  // Price, stock, shipping and coupon are computed inside the DB function. Nothing monetary comes from the client.
  const orderId = await rpc<string>('create_order', {
    p_user: user.id, p_items: body.items, p_shipping: body.shipping ?? {}, p_coupon: body.coupon ?? null,
    p_idempotency_key: body.idempotency_key,
  });
  return { order_id: orderId };
});
