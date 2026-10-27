import { z } from 'zod';
import { route, rpc, rateLimit } from './_lib/handler';

const schema = z.object({
  order_id: z.string().uuid(),
  method: z.enum(['bkash', 'nagad']),
  sender_number: z.string().trim().min(10).max(20),
  trx_id: z.string().trim().min(6).max(20),
  note: z.string().trim().max(300).optional(),
}).strict();

export const handler = route(schema, async ({ user, body, ip }) => {
  await rateLimit(`pay:u:${user.id}`, 5, 600);
  if (ip) await rateLimit(`pay:ip:${ip}`, 15, 600);
  const id = await rpc<string>('submit_payment', {
    p_user: user.id, p_order: body.order_id, p_method: body.method,
    p_sender: body.sender_number, p_trx: body.trx_id, p_note: body.note ?? null,
  });
  return { payment_id: id, status: 'pending_verification' }; // never anything but pending
});
