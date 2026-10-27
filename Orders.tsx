import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Loading, Empty } from '../components/ui';
import { taka, fmtDateTime, PAY_LABEL, FUL_LABEL } from '../lib/format';
import { api, can, useAction, Msg } from './ui';

export default function Orders() {
  const [q, setQ] = useState(''); const [pay, setPay] = useState(''); const [ful, setFul] = useState('');
  const [rows, setRows] = useState<any[] | null>(null); const [open, setOpen] = useState('');
  const load = () => {
    setRows(null);
    let b = supabase.from('orders').select('id,order_no,total,payment_status,fulfillment_status,has_physical,created_at,order_items(product_title)').order('created_at', { ascending: false }).limit(60);
    if (q.trim()) b = b.ilike('order_no', `%${q.trim().replace(/[%_]/g, '')}%`);
    if (pay) b = b.eq('payment_status', pay); if (ful) b = b.eq('fulfillment_status', ful);
    b.then(({ data }) => setRows(data ?? []));
  };
  useEffect(load, [pay, ful]);
  return (<>
    <h1>অর্ডার</h1>
    <form className="row" onSubmit={(e) => { e.preventDefault(); load(); }}>
      <input style={{ maxWidth: 220 }} placeholder="অর্ডার নম্বর (MM-…)" value={q} onChange={(e) => setQ(e.target.value)} />
      <select style={{ maxWidth: 200 }} value={pay} onChange={(e) => setPay(e.target.value)}><option value="">সব পেমেন্ট স্ট্যাটাস</option>{Object.entries(PAY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select style={{ maxWidth: 200 }} value={ful} onChange={(e) => setFul(e.target.value)}><option value="">সব ডেলিভারি স্ট্যাটাস</option>{Object.entries(FUL_LABEL).filter(([k]) => k !== 'not_applicable').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button className="btn sm">খুঁজুন</button></form>
    {rows === null ? <Loading /> : rows.length === 0 ? <Empty>কোনো অর্ডার নেই।</Empty> : rows.map((o) => (
      <div className="panel" key={o.id}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><strong>{o.order_no}</strong> · {taka(o.total)}<br /><span className="small muted">{o.order_items.map((i: any) => i.product_title).join(', ')} · {fmtDateTime(o.created_at)}</span></div>
          <div><span className="badge">{PAY_LABEL[o.payment_status]}</span> {o.has_physical && <span className="badge">{FUL_LABEL[o.fulfillment_status]}</span>}{o.fulfillment_status === 'cancelled' && !o.has_physical && <span className="badge bad">বাতিল</span>}</div>
        </div>
        <button className="btn ghost sm" onClick={() => setOpen(open === o.id ? '' : o.id)}>{open === o.id ? 'বন্ধ করুন' : 'বিস্তারিত'}</button>
        {open === o.id && <OrderDetail id={o.id} onChange={load} />}
      </div>))}
  </>);
}

function OrderDetail({ id, onChange }: { id: string; onChange: () => void }) {
  const { user, roles } = useAuth(); const a = useAction();
  const [o, setO] = useState<any>(null); const [events, setEvents] = useState<any[]>([]); const [notes, setNotes] = useState<any[]>([]);
  const [courier, setCourier] = useState(''); const [tracking, setTracking] = useState(''); const [reason, setReason] = useState(''); const [note, setNote] = useState('');
  const load = () => {
    supabase.from('orders').select('*, order_items(*), payments(*)').eq('id', id).maybeSingle().then(({ data }) => { setO(data); setCourier(data?.courier ?? ''); setTracking(data?.tracking_ref ?? ''); });
    supabase.from('payment_events').select('event,reason,created_at').eq('order_id', id).order('created_at').then(({ data }) => setEvents(data ?? []));
    supabase.from('staff_notes').select('note,created_at').eq('order_id', id).order('created_at').then(({ data }) => setNotes(data ?? []));
  };
  useEffect(load, [id]);
  if (!o) return <Loading />;
  const refresh = () => { load(); onChange(); };
  const paid = o.payment_status === 'payment_approved'; const cancelled = o.fulfillment_status === 'cancelled';
  return (
    <div style={{ marginTop: 12 }}>
      <table className="t"><tbody>
        {o.order_items.map((i: any) => <tr key={i.id}><td>{i.product_title} × {i.quantity}</td><td>{taka(i.line_total)}</td></tr>)}
        <tr><td>ছাড় / ডেলিভারি</td><td>−{taka(o.discount_total)} / {taka(o.shipping_charge)}</td></tr></tbody></table>
      {o.has_physical && <p>📦 {o.ship_name} · {o.ship_phone}<br />{o.ship_address}, {o.ship_area}{o.ship_note ? ` (${o.ship_note})` : ''}</p>}
      {o.has_physical && paid && !cancelled && ['processing', 'shipped'].includes(o.fulfillment_status) && can(roles, 'product_order_manager') && (
        <div className="f"><div className="row"><input placeholder="কুরিয়ার" value={courier} onChange={(e) => setCourier(e.target.value)} maxLength={80} /><input placeholder="ট্র্যাকিং নম্বর" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={120} /></div>
          <div className="row">{o.fulfillment_status === 'processing' && <button className="btn sm" disabled={a.busy} onClick={() => a.run(async () => { await api('admin-fulfillment', { order_id: o.id, status: 'shipped', courier, tracking }); refresh(); })}>শিপড হিসেবে মার্ক করুন</button>}
            {o.fulfillment_status === 'shipped' && <><button className="btn ghost sm" disabled={a.busy} onClick={() => a.run(async () => { await api('admin-fulfillment', { order_id: o.id, status: 'shipped', courier, tracking }); refresh(); })}>ট্র্যাকিং আপডেট</button>
              <button className="btn sm" disabled={a.busy} onClick={() => a.run(async () => { await api('admin-fulfillment', { order_id: o.id, status: 'delivered', courier, tracking }); refresh(); })}>ডেলিভারড</button></>}</div></div>)}
      {!cancelled && o.fulfillment_status !== 'delivered' && o.payment_status !== 'refunded' && <div className="f" style={{ marginTop: 10 }}>
        <input placeholder="বাতিল/রিফান্ডের কারণ (বাধ্যতামূলক)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={400} />
        <div className="row">
          {!paid && <button className="btn ghost sm" disabled={a.busy || reason.trim().length < 3} onClick={() => confirm('অর্ডার বাতিল করবেন?') && a.run(async () => { await api('admin-cancel-order', { order_id: o.id, reason, refund: false }); refresh(); })}>অর্ডার বাতিল</button>}
          {paid && can(roles, 'payment_verifier') && <button className="btn ghost sm" disabled={a.busy || reason.trim().length < 3} onClick={() => confirm('রিফান্ড করলে অ্যাক্সেস বাতিল হবে। নিশ্চিত?') && a.run(async () => { await api('admin-cancel-order', { order_id: o.id, reason, refund: true }); refresh(); })}>রিফান্ড করুন (অ্যাক্সেস বাতিল)</button>}
        </div><p className="small muted">রিফান্ডের টাকা bKash/Nagad-এ আলাদাভাবে পাঠাতে হবে; এখানে শুধু রেকর্ড হয়।</p></div>}
      <Msg err={a.err} ok={a.ok} />
      <h3>নোট</h3>{notes.map((n, i) => <p key={i} className="small">📝 {n.note} <span className="muted">({fmtDateTime(n.created_at)})</span></p>)}
      <div className="row"><input style={{ flex: 1 }} placeholder="অভ্যন্তরীণ নোট" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        <button className="btn ghost sm" disabled={!note.trim()} onClick={async () => { const { error } = await supabase.from('staff_notes').insert({ order_id: o.id, author_id: user!.id, note }); if (!error) { setNotes([...notes, { note, created_at: new Date().toISOString() }]); setNote(''); } }}>যোগ</button></div>
      <h3>ইতিহাস</h3><ul className="small">{events.map((e, i) => <li key={i}>{e.event}{e.reason ? ` — ${e.reason}` : ''} <span className="muted">({fmtDateTime(e.created_at)})</span></li>)}</ul>
    </div>);
}
