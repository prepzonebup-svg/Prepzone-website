import type { Handler } from '@netlify/functions';
import { admin } from './_lib/supabase';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Serves the SPA shell with product-specific <title>/OpenGraph tags so link previews (WhatsApp/Facebook) and crawlers work.
export const handler: Handler = async (event) => {
  const origin = (process.env.URL || process.env.VITE_SITE_URL || '').replace(/\/$/, '');
  const slug = (event.queryStringParameters?.slug ?? '').split('/')[0];
  const shell = await fetch(`${origin}/index.html`).then((r) => r.text()).catch(() => '');
  if (!shell) return { statusCode: 502, body: 'shell unavailable' };
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { statusCode: 200, headers, body: shell };
  const { data: p } = await admin.from('products').select('title, short_desc, seo_title, seo_description, cover_path').eq('slug', slug).eq('status', 'published').maybeSingle();
  if (!p) return { statusCode: 200, headers, body: shell };    // SPA renders its own "not found"
  const title = esc(p.seo_title || `${p.title} | MasterMind`);
  const desc = esc(p.seo_description || p.short_desc || '');
  const img = p.cover_path ? `${process.env.SUPABASE_URL}/storage/v1/object/public/product-covers/${p.cover_path}` : '';
  const tags = `<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:type" content="website">` +
    `<meta property="og:url" content="${esc(`${(process.env.VITE_SITE_URL || origin)}/p/${slug}`)}">${img ? `<meta property="og:image" content="${esc(img)}">` : ''}` +
    `<meta name="description" content="${desc}">`;
  const body = shell.replace(/<title>.*?<\/title>/, `<title>${title}</title>`).replace('</head>', `${tags}</head>`);
  return { statusCode: 200, headers, body };
};
