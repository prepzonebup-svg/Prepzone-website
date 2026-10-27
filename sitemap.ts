import type { Handler } from '@netlify/functions';
import { admin } from './_lib/supabase';

const STATIC = ['', '/products', '/courses', '/exam-batches', '/books', '/pdfs', '/contact', '/about', '/faq', '/privacy', '/terms', '/refund', '/shipping'];

export const handler: Handler = async () => {
  const site = (process.env.VITE_SITE_URL || 'https://bupadmission.com').replace(/\/$/, '');
  const { data } = await admin.from('products').select('slug, updated_at').eq('status', 'published');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const urls = [
    ...STATIC.map((p) => `<url><loc>${esc(site + p)}</loc></url>`),
    ...(data ?? []).map((p) => `<url><loc>${esc(`${site}/p/${p.slug}`)}</loc><lastmod>${p.updated_at.slice(0, 10)}</lastmod></url>`),
  ];
  return { statusCode: 200, headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' },
    body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>` };
};
