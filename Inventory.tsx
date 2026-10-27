import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, Empty } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import { api, useAction, Msg, Scroll } from './ui';

export default function Inventory() {
  const [books, setBooks] = useState<any[] | null>(null); const [mv, setMv] = useState<any[]>([]);
  const load = () => {
    supabase.from('book_details').select('product_id,stock_quantity,low_stock_threshold,products(title)').then(({ data }) => setBooks(data ?? []));
    supabase.from('stock_movements').select('delta,reason,created_at,products(title)').order('created_at', { ascending: false }).limit(30).then(({ data }) => setMv(data ?? []));
  };
  useEffect(load, []);
  return (<><h1>ইনভেন্টরি</h1>
    {books === null ? <Loading /> : books.length === 0 ? <Empty>কোনো ছাপা বই নেই।</Empty> : books.map((b) => <StockRow key={b.product_id} b={b} onDone={load} />)}
    <h2>সাম্প্রতিক স্টক মুভমেন্ট</h2>
    <Scroll><table className="t"><tbody>{mv.map((m, i) => <tr key={i}><td>{m.products?.title}</td><td>{m.delta > 0 ? '+' : ''}{m.delta}</td><td>{m.reason}</td><td className="muted small">{fmtDateTime(m.created_at)}</td></tr>)}</tbody></table></Scroll></>);
}

function StockRow({ b, onDone }: any) {
  const a = useAction(); const [delta, setDelta] = useState(''); const [reason, setReason] = useState('restock'); const low = b.stock_quantity <= b.low_stock_threshold;
  return (<div className={`panel ${low ? 'pending' : ''}`}>
    <strong>{b.products?.title}</strong> — স্টক: <strong>{b.stock_quantity}</strong> {low && <span className="badge warn">কম স্টক (সীমা {b.low_stock_threshold})</span>}
    <div className="row" style={{ marginTop: 8 }}>
      <input style={{ maxWidth: 120 }} inputMode="numeric" placeholder="+10 / −3" value={delta} onChange={(e) => setDelta(e.target.value)} />
      <select style={{ maxWidth: 200 }} value={reason} onChange={(e) => setReason(e.target.value)}><option value="restock">রিস্টক</option><option value="manual_adjustment">ম্যানুয়াল সংশোধন</option><option value="return">রিটার্ন</option></select>
      <button className="btn sm" disabled={a.busy || !Number.isInteger(Number(delta)) || Number(delta) === 0} onClick={async () => { if (await a.run(() => api('admin-adjust-stock', { product_id: b.product_id, delta: Number(delta), reason }))) { setDelta(''); onDone(); } }}>আপডেট</button></div>
    <Msg err={a.err} ok="" /></div>);
}
