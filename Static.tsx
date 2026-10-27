import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSeo } from '../lib/seo';
import { useSettings } from '../lib/settings';
import { renderMarkdown } from '../lib/md';
import { Loading } from '../components/ui';
import NotFound from './NotFoundInline';
export const NotFoundPage = NotFound; export { NotFound };

export function CmsPage({ slug }: { slug: string }) {
  const [pg, setPg] = useState<any | undefined>(undefined);
  useEffect(() => { setPg(undefined); supabase.from('cms_pages').select('*').eq('slug', slug).maybeSingle().then(({ data }) => setPg(data)); }, [slug]);
  useSeo({ title: `${pg?.title ?? ''} | MasterMind`, description: pg?.seo_description ?? undefined, path: `/${slug}` });
  if (pg === undefined) return <Loading />;
  if (!pg) return <NotFound />;
  return <div className="wrap section prose"><h1>{pg.title}</h1>{pg.body_md ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(pg.body_md) }} /> : <p className="muted">কনটেন্ট শীঘ্রই যোগ করা হবে।</p>}</div>;
}

export function Contact() {
  const s = useSettings(); const sup = s.support ?? {};
  useSeo({ title: 'যোগাযোগ ও সাপোর্ট | MasterMind', path: '/contact' });
  const wa = (sup.whatsapp_number ?? '').replace(/\D/g, '');
  return (
    <div className="wrap section">
      <h1>যোগাযোগ ও সাপোর্ট</h1>
      {!wa && !sup.email && !sup.alt_channel_url && <p className="muted">যোগাযোগের তথ্য এখনো যোগ করা হয়নি।</p>}
      {wa && <p><a className="btn" href={`https://wa.me/${wa.startsWith('01') ? '88' + wa : wa}`} rel="noopener noreferrer">WhatsApp-এ মেসেজ করুন</a></p>}
      {sup.alt_channel_url && <p><a href={sup.alt_channel_url} rel="noopener noreferrer">{sup.alt_channel_label || 'অন্য মাধ্যমে যোগাযোগ'}</a></p>}
      {sup.email && <p>ইমেইল: <a href={`mailto:${sup.email}`}>{sup.email}</a></p>}
    </div>
  );
}
