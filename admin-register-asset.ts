import { z } from 'zod';
import { route, requireStaff, rpc, HttpError } from './_lib/handler';
import { admin } from './_lib/supabase';

const ascii = (a: ArrayLike<number>) => String.fromCharCode(...Array.from(a));
function isImage(h: Uint8Array) {
  return (h[0] === 0xff && h[1] === 0xd8) || ascii(h.slice(1, 4)) === 'PNG' || (ascii(h.slice(0, 4)) === 'RIFF' && ascii(h.slice(8, 12)) === 'WEBP');
}

// After the browser uploads to the signed URL, the server verifies the real bytes before registering.
export const handler = route(
  z.object({ product_id: z.string().uuid().optional(), kind: z.enum(['cover', 'pdf', 'logo']), path: z.string().max(200) }).strict(),
  async ({ user, body }) => {
    const isLogo = body.kind === 'logo';
    if (isLogo) await requireStaff(user, []); else { await requireStaff(user, ['product_order_manager']); if (!body.product_id) throw new HttpError(400, 'invalid_input'); }
    const prefix = isLogo ? 'brand/' : `${body.product_id}/`;
    if (!body.path.startsWith(prefix) || body.path.includes('..')) throw new HttpError(400, 'invalid_input');
    const bucket = body.kind === 'pdf' ? 'paid-pdfs' : 'product-covers';
    const { data: blob, error } = await admin.storage.from(bucket).download(body.path);
    if (error || !blob) throw new HttpError(400, 'invalid_input');
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const okMagic = body.kind === 'pdf' ? ascii(head.slice(0, 5)) === '%PDF-' : isImage(head);
    if (!okMagic) { await admin.storage.from(bucket).remove([body.path]); throw new HttpError(400, 'invalid_input'); }

    if (isLogo) {
      const { data: row } = await admin.from('site_settings').select('value').eq('key', 'brand').maybeSingle();
      await admin.from('site_settings').upsert({ key: 'brand', value: { ...(row?.value as object ?? {}), logo_path: body.path }, visibility: 'public', updated_by: user.id, updated_at: new Date().toISOString() });
    } else if (body.kind === 'cover') {
      await admin.from('products').update({ cover_path: body.path }).eq('id', body.product_id!);
    } else {
      const { data: old } = await admin.from('product_assets').select('id, path').eq('product_id', body.product_id!).eq('kind', 'pdf_private').maybeSingle();
      if (old) { // update in place: download_logs keep a valid FK to the asset row
        await admin.from('product_assets').update({ path: body.path, size_bytes: blob.size, mime_type: 'application/pdf' }).eq('id', old.id);
        await admin.storage.from(bucket).remove([old.path]);
      } else {
        await admin.from('product_assets').insert({ product_id: body.product_id!, kind: 'pdf_private', bucket, path: body.path, mime_type: 'application/pdf', size_bytes: blob.size });
      }
    }
    await rpc('write_audit', { p_actor: user.id, p_action: `asset.${body.kind}`, p_entity: isLogo ? 'brand' : 'product', p_entity_id: body.product_id ?? 'brand', p_detail: {} });
    return { path: body.path };
  });
