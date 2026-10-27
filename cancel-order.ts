import { z } from 'zod';
import { route, rpc } from './_lib/handler';

export const handler = route(z.object({ order_id: z.string().uuid() }).strict(), async ({ user, body }) => {
  await rpc('student_cancel_order', { p_user: user.id, p_order: body.order_id });
  return {};
});
