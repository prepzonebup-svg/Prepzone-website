import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, coverUrl } from '../lib/supabase';
import { useSeo } from '../lib/seo';
import { renderMarkdown } from '../lib/md';
import { Price, Loading, ErrorBox } from '../components/ui';
import { TYPE_LABEL, fmtDate } from '../lib/format';
import NotFound from './NotFoundInline';

export default function ProductDetail() {
  const { slug } = useParams();
  const [p, setP] = useState<any | undefined | null>(undefined);
  useEffect(() => {
    setP(undefined);
    supabase.from('products').select('*, book_details(*), batch_details(*)').eq('slug', slug!).maybeSingle().then(({ data }) => setP(data));
  }, [slug]);
  const img = coverUrl(p?.cover_path);
  useSeo({
    title: p ? (p.seo_title || `${p.title} | MasterMind`) : 'MasterMind', description: p?.seo_description || p?.short_desc || undefined,
    path: `/p/${slug}`, image: img,
    jsonLd: p ? { '@context': 'https://schema.org', '@type': 'Product', name: p.title, description: p.short_desc ?? undefined, image: img ?? undefined,
      offers: { '@type': 'Offer', priceCurrency: 'BDT', price: p.price_selling, availability: p.book_details && p.book_details.stock_quantity < 1 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' } } : undefined,
  });
  if (p === undefined) return <Loading />;
  if (p === null) return <NotFound />;
  const b = p.book_details, d = p.batch_details;
  const out = p.type === 'printed_book' && (!b || b.stock_quantity < 1);
  return (
    <div className="wrap section two">
      <div>
        <span className="tag">{TYPE_LABEL[p.type]}</span>
        <h1>{p.title}</h1>
        {p.short_desc && <p className="muted">{p.short_desc}</p>}
        {b?.author && <p>লেখক: {b.author}</p>}
        {d?.starts_on && <p>ব্যাচ: {fmtDate(d.starts_on)}{d.ends_on ? ` – ${fmtDate(d.ends_on)}` : ''}</p>}
        {p.description && <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.description) }} />}
        {Array.isArray(p.benefits) && p.benefits.length > 0 && <><h2>যা যা পাবেন</h2><ul>{p.benefits.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
        {Array.isArray(p.faqs) && p.faqs.length > 0 && <><h2>প্রশ্নোত্তর</h2>{p.faqs.map((f: any, i: number) => <details key={i}><summary><strong>{f.q}</strong></summary><p>{f.a}</p></details>)}</>}
      </div>
      <aside>
        {img ? <img className="cover" src={img} alt={p.title} width={600} height={450} /> : <div className="cover" />}
        <div className="panel">
          <div className="big"><Price selling={p.price_selling} original={p.price_original} /></div>
          {p.type === 'printed_book' && <p className={out ? 'err' : 'muted'}>{out ? 'স্টক শেষ' : 'স্টকে আছে'}</p>}
          {p.purchase_note && <p className="small muted">{p.purchase_note}</p>}
          {out ? <button className="btn" disabled>স্টক শেষ</button> : <Link className="btn" to={`/checkout/${p.slug}`}>অর্ডার করুন</Link>}
          <p className="small muted">পেমেন্ট bKash/Nagad-এ; যাচাইয়ের পর অ্যাক্সেস চালু হবে।</p>
        </div>
      </aside>
    </div>
  );
}
