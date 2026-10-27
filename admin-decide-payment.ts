import { z } from 'zod';
import { route, rpc } from './_lib/handler';

const schema = z.object({
  payment_id: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
  verified_amount: z.number().positive().optional(), // amount the verifier actually saw in bKash/Nagad
}).strict();

// Role enforcement happens inside decide_payment (payment_verifier or super_admin).
export const handler = route(schema, async ({ user, body }) =>
  rpc('decide_payment', {
    p_admin: user.id, p_payment: body.payment_id, p_decision: body.decision,
    p_reason: body.reason ?? '', p_verified_amount: body.verified_amount ?? null,
  }));
