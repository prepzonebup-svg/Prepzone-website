import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { route, requireStaff, rateLimit, HttpError } from './_lib/handler';
import { admin } from './_lib/supabase';

const IMG = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>;
const LIMITS = {
  cover: { bucket: 'product-covers', max: 5 * 1024 * 1024, types: IMG },
  logo:  { bucket: 'product-covers', max: 2 * 1024 * 1024, types: IMG },
  pdf:   { bucket: 'paid-pdfs', max: 100 * 1024 * 1024, types: { 'application/pdf': 'pdf' } as Record<string, string> },
};

export const handler = route(
  z.object({ product_id: z.string().uuid().optional(), kind: z.enum(['cover', 'pdf', 'logo']), content_type: z.string().max(60), size: z.number().int().positive() }).strict(),
  async ({ user, body }) => {
    if (body.kind === 'logo') await requireStaff(user, []);                      // Super Admin only
    else { await requireStaff(user, ['product_order_manager']); if (!body.product_id) throw new HttpError(400, 'invalid_input'); }
    await rateLimit(`upl:${user.id}`, 30, 3600);
    const cfg = LIMITS[body.kind];
    const ext = cfg.types[body.content_type];
    if (!ext || body.size > cfg.max) throw new HttpError(400, 'invalid_input');
    const path = `${body.kind === 'logo' ? 'brand' : body.product_id}/${randomUUID()}.${ext}`;   // server picks the path
    const { data, error } = await admin.storage.from(cfg.bucket).createSignedUploadUrl(path);
    if (error || !data) throw error ?? new HttpError(500, 'server_error');
    return { bucket: cfg.bucket, path, token: data.token };
  });
