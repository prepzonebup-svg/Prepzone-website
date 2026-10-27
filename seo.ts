import { useEffect } from 'react';
const SITE = (import.meta.env.VITE_SITE_URL || 'https://bupadmission.com').replace(/\/$/, '');

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}
export function useSeo(o: { title: string; description?: string; path: string; image?: string | null; noindex?: boolean; jsonLd?: object }) {
  useEffect(() => {
    document.title = o.title;
    const url = SITE + o.path;
    setMeta('name', 'description', o.description ?? '');
    setMeta('name', 'robots', o.noindex ? 'noindex,nofollow' : 'index,follow');
    setMeta('property', 'og:title', o.title); setMeta('property', 'og:description', o.description ?? '');
    setMeta('property', 'og:url', url); setMeta('property', 'og:type', 'website');
    if (o.image) setMeta('property', 'og:image', o.image);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = url;
    document.getElementById('jsonld')?.remove();
    if (o.jsonLd) {
      const s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'jsonld';
      s.text = JSON.stringify(o.jsonLd); document.head.appendChild(s);
    }
  }, [o.title, o.description, o.path, o.image, o.noindex, JSON.stringify(o.jsonLd)]);
}
