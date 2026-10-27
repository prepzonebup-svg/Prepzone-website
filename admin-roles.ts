import { z } from 'zod';
import { route, requireStaff, rpc, HttpError } from './_lib/handler';
import { admin } from './_lib/supabase';

const ROLE = z.enum(['super_admin', 'product_order_manager', 'payment_verifier']);
const schema = z.object({ action: z.enum(['list', 'grant', 'revoke']), email: z.string().email().max(200).optional(), user_id: z.string().uuid().optional(), role: ROLE.optional() }).strict();

// Super Admin only (empty role list ⇒ only the implicit super_admin passes).
export const handler = route(schema, async ({ user, body }) => {
  await requireStaff(user, []);
  if (body.action === 'list') {
    const { data } = await admin.from('admin_roles').select('user_id, role, created_at').order('created_at');
    const out = [];
    for (const r of data ?? []) { const u = await admin.auth.admin.getUserById(r.user_id); out.push({ ...r, email: u.data.user?.email ?? '(unknown)' }); }
    return out;
  }
  if (!body.role) throw new HttpError(400, 'invalid_input');
  let uid = body.user_id;
  if (!uid && body.email) { // find by email (small user base: paged scan)
    for (let page = 1; page <= 20 && !uid; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      uid = data.users.find((u) => u.email?.toLowerCase() === body.email!.toLowerCase())?.id;
      if (!data.users.length || data.users.length < 200) break;
    }
  }
  if (!uid) throw new HttpError(404, 'order_not_found');
  if (body.action === 'revoke' && uid === user.id && body.role === 'super_admin') throw new HttpError(400, 'invalid_input'); // no self-lockout
  if (body.action === 'grant') await admin.from('admin_roles').upsert({ user_id: uid, role: body.role, granted_by: user.id });
  else await admin.from('admin_roles').delete().eq('user_id', uid).eq('role', body.role);
  await rpc('write_audit', { p_actor: user.id, p_action: `role.${body.action}`, p_entity: 'user', p_entity_id: uid, p_detail: { role: body.role } });
  return {};
});
