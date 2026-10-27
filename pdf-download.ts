import { z } from 'zod';
import { route, rpc, rateLimit, HttpError } from './_lib/handler';
import { admin } from './_lib/supabase';

const schema = z.object({ entitlement_id: z.string().uuid() }).strict();
const TTL_SECONDS = 60;

export const handler = route(schema, async ({ user, body, ip, event }) => {
  await rateLimit(`dl:${user.id}`, 20, 3600);
  // DB verifies: entitlement belongs to user, is active, order payment is approved. Also writes the download log.
  const rows = await rpc<{ bucket: string; path: string; file_name: string }[]>('authorize_pdf_download', {
    p_user: user.id, p_entitlement: body.entitlement_id, p_ip: ip, p_ua: event.headers['user-agent'] ?? '',
  });
  const a = rows?.[0];
  if (!a) throw new HttpError(403, 'not_entitled');
  const { data, error } = await admin.storage.from(a.bucket).createSignedUrl(a.path, TTL_SECONDS, { download: a.file_name });
  if (error || !data) throw new HttpError(404, 'file_missing');
  return { url: data.signedUrl, expires_in: TTL_SECONDS };
});
