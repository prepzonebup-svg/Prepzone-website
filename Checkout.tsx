import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useSeo } from '../lib/seo';
import { useAuth } from '../lib/auth';
import { taka } from '../lib/format';
import { Loading, ErrorBox } from '../components/ui';
import NotFound from './NotFoundInline';

type Quote = { subtotal: number; discount: number; shipping: number; total: number };

export default function Checkout() {
  const { slug } = useParams(); const nav = useNavigate(); const { user } = useAuth();
  const [p, setP] = useState<any | undefined | null>(undefined);
  const [areas, setAreas] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [ship, setShip] = useState({ name: '', phone: '', address: '', area: '', note: '' });
  const [coupon, setCoupon] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  useSeo({ title: 'চেকআউট | MasterMind', path: `/checkout/${slug}`, noindex: true });

  useEffect(() => {
    supabase.from('products').select('id,slug,type,title,price_selling,book_details(stock_quantity,max_per_order)').eq('slug', slug!).maybeSingle().then(({ data }) => setP(data));
    supabase.from('shipping_zones').select('areas').eq('is_active', true).then(({ data }) => setAreas([...new Set((data ?? []).flatMap((z: any) => z.areas))]));
  }, [slug]);
  useEffect(() => { // prefill from profile
    if (!user) return;
    supabase.from('profiles').select('full_name,phone').eq('id', user.id).maybeSingle().then(({ data }) => data && setShip((s) => ({ ...s, name: s.name || data.full_name, phone: s.phone || (data.phone ?? '') })));
  }, [user?.id]);

  const physical = p?.type === 'printed_book';
  const payload = useMemo(() => p ? ({
    items: [{ product_id: p.id, quantity: physical ? qty : 1 }],
    shipping: physical ? { name: ship.name, phone: ship.phone, address: ship.address, area: ship.area, note: ship.note || undefined } : undefined,
    coupon: coupon.trim() || undefined,
  }) : null, [p?.id, qty, ship, coupon, physical]);

  // Server-computed quote (same code path as order creation, rolled back). Debounced.
  useEffect(() => {
    if (!payload) return; key.current = crypto.randomUUID(); setQuote(null); setErr('');
    if (physical && (ship.address.length < 5 || !ship.area || ship.name.length < 2 || ship.phone.length < 10)) return;
    const t = setTimeout(() => api<Quote>('quote-order', payload).then(setQuote).catch((e) => setErr(e.message)), 500);
    return () => clearTimeout(t);
  }, [payload]);

  if (p === undefined) return <Loading />;
  if (p === null) return <NotFound />;

  async function place() {
    if (!payload || !quote) return;
    setBusy(true); setErr('');
    try { const r = await api<{ order_id: string }>('create-order', { ...payload, idempotency_key: key.current }); nav(`/account/orders/${r.order_id}`); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  const set = (k: string) => (e: any) => setShip({ ...ship, [k]: e.target.value });
  const max = Math.min(p.book_details?.max_per_order ?? 10, p.book_details?.stock_quantity ?? 10);
  return (
    <div className="wrap section two">
      <div>
        <h1>চেকআউট</h1>
        <h2>{p.title}</h2>
        <form className="f" onSubmit={(e) => { e.preventDefault(); place(); }}>
          {physical && <>
            <label>পরিমাণ<select value={qty} onChange={(e) => setQty(Number(e.target.value))}>{Array.from({ length: Math.max(max, 1) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
            <label>প্রাপকের নাম<input value={ship.name} onChange={set('name')} required maxLength={120} autoComplete="name" /></label>
            <label>মোবাইল নম্বর<input value={ship.phone} onChange={set('phone')} required inputMode="tel" placeholder="01XXXXXXXXX" autoComplete="tel" /></label>
            <label>এলাকা / জেলা<input value={ship.area} onChange={set('area')} required list="areas" maxLength={80} /><datalist id="areas">{areas.map((a) => <option key={a} value={a} />)}</datalist></label>
            <label>পূর্ণ ঠিকানা<textarea value={ship.address} onChange={set('address')} required rows={3} maxLength={400} /></label>
            <label>ডেলিভারি নির্দেশনা <span className="hint">(ঐচ্ছিক)</span><input value={ship.note} onChange={set('note')} maxLength={400} /></label>
          </>}
          <label>কুপন কোড <span className="hint">(ঐচ্ছিক)</span><input value={coupon} onChange={(e) => setCoupon(e.target.value)} maxLength={40} autoCapitalize="characters" /></label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" disabled={busy || !quote}>{busy ? 'অর্ডার হচ্ছে…' : 'অর্ডার নিশ্চিত করুন'}</button>
          <p className="small muted">অর্ডারের পর পরের পাতায় bKash/Nagad নম্বর ও পেমেন্ট ফর্ম দেখানো হবে।</p>
        </form>
      </div>
      <aside className="panel" aria-live="polite">
        <h3>মূল্য</h3>
        {!quote ? <p className="muted">{physical ? 'ঠিকানা পূরণ করলে চূড়ান্ত মূল্য দেখা যাবে।' : 'হিসাব হচ্ছে…'}</p> : (
          <table className="t"><tbody>
            <tr><td>সাবটোটাল</td><td>{taka(quote.subtotal)}</td></tr>
            {quote.discount > 0 && <tr><td>ছাড়</td><td>−{taka(quote.discount)}</td></tr>}
            {physical && <tr><td>ডেলিভারি চার্জ</td><td>{taka(quote.shipping)}</td></tr>}
            <tr><td><strong>মোট প্রদেয়</strong></td><td><strong>{taka(quote.total)}</strong></td></tr>
          </tbody></table>)}
      </aside>
    </div>
  );
}
