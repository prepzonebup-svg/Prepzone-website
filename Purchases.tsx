import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useSeo } from '../lib/seo';
import { Loading, Empty } from '../components/ui';
import { TYPE_LABEL } from '../lib/format';

export default function Purchases() {
  useSeo({ title: 'আমার কেনা পণ্য | MasterMind', path: '/account/purchases', noindex: true });
  const [rows, setRows] = useState<any[] | null>(null);
  const [tg, setTg] = useState<Record<string, any>>({}); const [err, setErr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState('');
  useEffect(() => { supabase.from('entitlements').select('id,product_type,status,granted_at,order_items(product_title)').eq('status', 'active').order('granted_at', { ascending: false }).then(({ data }) => setRows(data ?? [])); }, []);

  async function download(id: string) {
    setBusy(id); setErr((e) => ({ ...e, [id]: '' }));
    try { const r = await api<{ url: string }>('pdf-download', { entitlement_id: id }); window.location.href = r.url; }
    catch (x: any) { setErr((e) => ({ ...e, [id]: x.message })); } finally { setBusy(''); }
  }
  async function access(id: string) {
    setBusy(id); setErr((e) => ({ ...e, [id]: '' }));
    try { setTg((t) => ({ ...t, [id]: null })); const r = await api('my-telegram-access', { entitlement_id: id }); setTg((t) => ({ ...t, [id]: r })); }
    catch (x: any) { setErr((e) => ({ ...e, [id]: x.message })); } finally { setBusy(''); }
  }
  return (
    <div className="wrap section" style={{ maxWidth: 760 }}><h1>আমার কেনা পণ্য</h1>
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty>অনুমোদিত কোনো কেনা পণ্য নেই। পেমেন্ট অনুমোদনের পর এখানে দেখা যাবে। <Link to="/account/orders">অর্ডার দেখুন</Link></Empty> :
        rows.map((e) => (<div className="panel" key={e.id}>
          <span className="tag">{TYPE_LABEL[e.product_type]}</span><h3>{e.order_items?.product_title}</h3>
          {e.product_type === 'pdf_book' && <button className="btn" disabled={busy === e.id} onClick={() => download(e.id)}>পিডিএফ ডাউনলোড</button>}
          {['course', 'exam_batch'].includes(e.product_type) && <>
            <button className="btn" disabled={busy === e.id} onClick={() => access(e.id)}>টেলিগ্রাম অ্যাক্সেস দেখুন</button>
            {tg[e.id] && <div className="panel ok">
              {tg[e.id].instructions && <p>{tg[e.id].instructions}</p>}
              {tg[e.id].invite_link ? <p><a className="btn" href={tg[e.id].invite_link} rel="noopener noreferrer">টেলিগ্রামে যোগ দিন</a><br /><span className="small muted">লিংকটি শুধু আপনার জন্য; অন্যকে শেয়ার করবেন না।</span></p>
                : <p>অ্যাডমিন শীঘ্রই আপনাকে অ্যাক্সেস দেবে। দেরি হলে সাপোর্টে যোগাযোগ করুন।</p>}</div>}</>}
          {err[e.id] && <p className="err" role="alert">{err[e.id]}</p>}
        </div>))}
    </div>);
}
