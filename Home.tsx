import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSeo } from '../lib/seo';
import { useSettings } from '../lib/settings';
import { ProductCard, Loading, Empty } from '../components/ui';
import { TYPE_LABEL, TYPE_PATH } from '../lib/format';

const PATHS = [
  ['course', 'কোর্স', 'ভর্তি প্রস্তুতির পূর্ণাঙ্গ কোর্স'], ['exam_batch', 'এক্সাম ব্যাচ', 'নিয়মিত পরীক্ষার ব্যাচ'],
  ['printed_book', 'ছাপা বই', 'বাসায় ডেলিভারি'], ['pdf_book', 'পিডিএফ বই', 'পেমেন্ট অনুমোদনের পর ডাউনলোড'],
];
const STEPS = ['পণ্য বেছে নিন ও লগইন করুন', 'অর্ডার করুন; পেমেন্ট নম্বর দেখুন', 'bKash/Nagad-এ টাকা পাঠিয়ে TrxID দিন', 'আমরা যাচাই করে অনুমোদন দেব; এরপর অ্যাক্সেস পাবেন'];

export default function Home() {
  const s = useSettings();
  const [items, setItems] = useState<any[] | null>(null);
  const [banners, setBanners] = useState<any[]>([]);
  useSeo({ title: s.seo?.default_title ?? 'MasterMind University Admission Programme', description: s.seo?.default_description, path: '/' });
  useEffect(() => {
    supabase.from('banners').select('id,title,subtitle,link_url').eq('is_active', true).order('sort_order').then(({ data }) => setBanners(data ?? []));
    supabase.from('products').select('id,slug,type,title,cover_path,price_selling,price_original')
      .eq('is_featured', true).order('created_at', { ascending: false }).limit(16).then(({ data }) => setItems(data ?? []));
  }, []);
  return (
    <>
      <section className="wrap hero">
        {banners.map((b) => { const ok = b.link_url && /^(https:\/\/|\/)/.test(b.link_url); const inner = <><strong>{b.title}</strong>{b.subtitle ? ` — ${b.subtitle}` : ''}</>; return <div key={b.id} className="panel pending" style={{ margin: '0 0 10px' }}>{ok ? <a href={b.link_url}>{inner}</a> : inner}</div>; })}
        <h1>{s.content?.hero_title || 'বিশ্ববিদ্যালয় ভর্তি প্রস্তুতি, এক জায়গায়।'}</h1>
        <p className="muted">{s.content?.hero_subtitle || 'কোর্স, এক্সাম ব্যাচ, ছাপা বই ও পিডিএফ। ক্লাস ও পরীক্ষা হয় টেলিগ্রামে; অর্ডার ও পেমেন্ট এখানে।'}</p>
        <div className="paths">{PATHS.map(([t, n, d]) => <Link key={t} to={TYPE_PATH[t]}><strong>{n}</strong><span className="muted">{d}</span></Link>)}</div>
      </section>
      <section className="wrap section">
        <h2>নির্বাচিত পণ্য</h2>
        {items === null ? <Loading /> : items.length === 0 ? <Empty>শীঘ্রই পণ্য যোগ করা হবে।</Empty> :
          (['course', 'exam_batch', 'printed_book', 'pdf_book'] as const).map((t) => {
            const list = items.filter((p) => p.type === t); if (!list.length) return null;
            return <div key={t}><h3 style={{ marginTop: 22 }}>{TYPE_LABEL[t]}</h3><div className="grid">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div></div>;
          })}
      </section>
      <section className="wrap section">
        <h2>কীভাবে অর্ডার করবেন</h2>
        <ol>{STEPS.map((x) => <li key={x}>{x}</li>)}</ol>
        <p className="muted">পেমেন্ট ম্যানুয়ালি যাচাই করা হয়; সাধারণত ১ ঘণ্টার মধ্যে অনুমোদন দেওয়া হয়। দেরি হলে অর্ডার পেজ থেকেই সাপোর্টে যোগাযোগ করতে পারবেন।</p>
        <Link className="btn ghost" to="/faq">সাধারণ প্রশ্ন দেখুন</Link>
      </section>
    </>
  );
}
