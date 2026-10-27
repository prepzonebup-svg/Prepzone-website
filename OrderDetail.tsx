import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useSeo } from '../lib/seo';
import { useSettings } from '../lib/settings';
import { Loading, ErrorBox } from '../components/ui';
import { taka, fmtDateTime, PAY_LABEL, FUL_LABEL, whatsappLink } from '../lib/format';
import NotFound from './NotFoundInline';

const DEFAULT_MSG = 'আসসালামু আলাইকুম, আমি আমার পেমেন্টের অনুমোদন সম্পর্কে জানতে চাই। Order ID: {ORDER_ID}. Product: {PRODUCT_NAME}. পেমেন্ট সাবমিট করার পর ১ ঘণ্টার বেশি সময় হয়েছে, কিন্তু এখনো অনুমোদন পাইনি।';

export default function OrderDetail() {
  const { id } = useParams(); const s = useSettings();
  const [o, setO] = useState<any | undefined | null>(undefined);
  const [skew, setSkew] = useState(0); const [now, setNow] = useState(Date.now());
  useSeo({ title: 'অর্ডারের বিবরণ | MasterMind', path: `/account/orders/${id}`, noindex: true });

  const load = useCallback(() => supabase.from('orders').select('*, order_items(*), payments(*)').eq('id', id!).maybeSingle().then(({ data }) => setO(data)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { // correct local clock skew using the server clock (display only)
    fetch('/api/server-time').then((r) => r.json()).then((j) => setSkew(j.now - Date.now())).catch(() => {});
  }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (o?.payment_status !== 'pending_verification') return; const t = setInterval(load, 30_000); return () => clearInterval(t); }, [o?.payment_status, load]);

  if (o === undefined) return <Loading />;
  if (o === null) return <NotFound />; // RLS hides other users' orders → indistinguishable from missing
  const pay = [...o.payments].sort((a: any, b: any) => +new Date(b.submitted_at) - +new Date(a.submitted_at))[0];
  const cancelled = o.fulfillment_status === 'cancelled';
  const names = o.order_items.map((i: any) => i.product_title).join(', ');
  const waitMin = Number(s.support?.waiting_minutes ?? 60);
  const elapsedMin = pay ? Math.floor((now + skew - +new Date(pay.submitted_at)) / 60_000) : 0;
  const overdue = o.payment_status === 'pending_verification' && elapsedMin >= waitMin;
  const wa = whatsappLink(s.support?.whatsapp_number, s.support?.default_message_bn || DEFAULT_MSG, { ORDER_ID: o.order_no, PRODUCT_NAME: names });

  const Support = ({ prominent }: { prominent: boolean }) => wa
    ? <a className={prominent ? 'btn alert' : ''} href={wa} target="_blank" rel="noopener noreferrer">{prominent ? 'Support-এ যোগাযোগ করুন (WhatsApp)' : 'সাপোর্টে যোগাযোগ করুন'}</a>
    : s.support?.alt_channel_url ? <a className={prominent ? 'btn alert' : ''} href={s.support.alt_channel_url} rel="noopener noreferrer">{s.support.alt_channel_label || 'সাপোর্টে যোগাযোগ করুন'}</a>
    : <span className="muted">সাপোর্ট নম্বর এখনো সেট করা হয়নি।</span>;

  return (
    <div className="wrap section" style={{ maxWidth: 760 }}>
      <p><Link to="/account/orders">← সব অর্ডার</Link></p>
      <h1>অর্ডার {o.order_no}</h1>
      <p className="row"><span className="badge">{cancelled ? FUL_LABEL.cancelled : PAY_LABEL[o.payment_status]}</span>
        {o.has_physical && !cancelled && <span className="badge">ডেলিভারি: {FUL_LABEL[o.fulfillment_status]}</span>}</p>

      <table className="t"><tbody>
        {o.order_items.map((i: any) => <tr key={i.id}><td>{i.product_title}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</td><td>{taka(i.line_total)}</td></tr>)}
        {o.discount_total > 0 && <tr><td>ছাড়</td><td>−{taka(o.discount_total)}</td></tr>}
        {o.has_physical && <tr><td>ডেলিভারি চার্জ</td><td>{taka(o.shipping_charge)}</td></tr>}
        <tr><td><strong>মোট</strong></td><td><strong>{taka(o.total)}</strong></td></tr>
      </tbody></table>

      {cancelled && <div className="panel bad" role="status">অর্ডারটি বাতিল করা হয়েছে।{o.cancel_reason ? ` কারণ: ${o.cancel_reason}` : ''}</div>}

      {!cancelled && ['awaiting_payment', 'payment_rejected'].includes(o.payment_status) && <PayForm order={o} rejected={o.payment_status === 'payment_rejected'} reason={pay?.decision_reason} onDone={load} />}

      {o.payment_status === 'pending_verification' && pay && (
        <div className={`panel ${overdue ? 'bad' : 'pending'}`} role="status">
          <p><strong>আপনার পেমেন্ট যাচাই করা হচ্ছে। সাধারণত ১ ঘণ্টার মধ্যে অনুমোদন দেওয়া হবে।</strong></p>
          <table className="t"><tbody>
            <tr><td>Order ID</td><td>{o.order_no}</td></tr><tr><td>পণ্য</td><td>{names}</td></tr><tr><td>পরিমাণ</td><td>{taka(pay.amount)}</td></tr>
            <tr><td>মাধ্যম</td><td>{pay.method === 'bkash' ? 'bKash' : 'Nagad'}</td></tr><tr><td>জমা দেওয়ার সময়</td><td>{fmtDateTime(pay.submitted_at)}</td></tr>
            <tr><td>অবস্থা</td><td>{PAY_LABEL[o.payment_status]}</td></tr></tbody></table>
          {overdue ? (<><p className="err">১ ঘণ্টার মধ্যে পেমেন্ট অনুমোদন হয়নি? আমাদের Support টিমের সঙ্গে যোগাযোগ করুন।</p><Support prominent /></>)
            : <p className="small"><Support prominent={false} /></p>}
        </div>)}

      {o.payment_status === 'payment_approved' && <div className="panel ok" role="status">
        <p><strong>পেমেন্ট অনুমোদিত হয়েছে।</strong></p>
        {o.has_physical ? <p>ডেলিভারি অবস্থা: {FUL_LABEL[o.fulfillment_status]}{o.tracking_ref ? ` · ট্র্যাকিং: ${o.tracking_ref}${o.courier ? ` (${o.courier})` : ''}` : ''}</p>
          : <p><Link className="btn" to="/account/purchases">আমার কেনা পণ্যে যান</Link></p>}</div>}

      {o.has_physical && <div className="panel"><h3>ডেলিভারি ঠিকানা</h3><p>{o.ship_name} · {o.ship_phone}<br />{o.ship_address}, {o.ship_area}</p></div>}
      {o.payment_status !== 'awaiting_payment' && !overdue && <p className="small muted">সমস্যা হলে <Support prominent={false} /></p>}
    </div>
  );
}

function PayForm({ order, rejected, reason, onDone }: { order: any; rejected: boolean; reason?: string; onDone: () => void }) {
  const s = useSettings(); const pay = s.payment ?? {};
  const methods = (['bkash', 'nagad'] as const).filter((m) => pay[m]?.enabled && pay[m]?.number);
  const [method, setMethod] = useState<'bkash' | 'nagad'>(methods[0] ?? 'bkash');
  const [sender, setSender] = useState(''); const [trx, setTrx] = useState(''); const [note, setNote] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false);
  const cur = pay[method];
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('submit-payment', { order_id: order.id, method, sender_number: sender, trx_id: trx.trim().toUpperCase(), note: note || undefined }); onDone(); }
    catch (x: any) { setErr(x.message); setBusy(false); }
  }
  async function cancel() { if (confirm('অর্ডারটি বাতিল করতে চান?')) { try { await api('cancel-order', { order_id: order.id }); onDone(); } catch (x: any) { setErr(x.message); } } }
  return (
    <div className="panel">
      {rejected && <p className="err" role="alert">আপনার আগের পেমেন্ট গ্রহণ করা হয়নি।{reason ? ` কারণ: ${reason}` : ''} সঠিক তথ্য দিয়ে আবার জমা দিন বা সাপোর্টে যোগাযোগ করুন।</p>}
      <h2>পেমেন্ট করুন — {taka(order.total)}</h2>
      {methods.length === 0 ? <ErrorBox msg="বর্তমানে কোনো পেমেন্ট মাধ্যম চালু নেই। সাপোর্টে যোগাযোগ করুন।" /> : (<>
        <div className="row" role="radiogroup" aria-label="পেমেন্ট মাধ্যম">
          {methods.map((m) => <label key={m} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input style={{ width: 'auto', minHeight: 0 }} type="radio" checked={method === m} onChange={() => setMethod(m)} />{m === 'bkash' ? 'bKash' : 'Nagad'}</label>)}
        </div>
        <p>নম্বর: <strong className="big">{cur.number}</strong> <button type="button" className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(cur.number); setCopied(true); }}>{copied ? 'কপি হয়েছে' : 'কপি'}</button>
          {cur.account_type && <span className="muted"> ({cur.account_type})</span>}</p>
        {cur.instructions_bn && <p>{cur.instructions_bn}</p>}
        <p className="small muted">{pay.reference_hint_bn} Order ID: <strong>{order.order_no}</strong>. আপনার PIN/OTP কাউকে দেবেন না।</p>
        <form className="f" onSubmit={go}>
          <label>যে নম্বর থেকে টাকা পাঠিয়েছেন<input value={sender} onChange={(e) => setSender(e.target.value)} required inputMode="tel" placeholder="01XXXXXXXXX" /></label>
          <label>TrxID<input value={trx} onChange={(e) => setTrx(e.target.value)} required minLength={6} maxLength={20} autoCapitalize="characters" /></label>
          <label>নোট <span className="hint">(ঐচ্ছিক)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" disabled={busy}>{busy ? 'জমা হচ্ছে…' : 'পেমেন্ট তথ্য জমা দিন'}</button>
        </form></>)}
      {!rejected && <p><button className="btn ghost sm" onClick={cancel}>অর্ডার বাতিল করুন</button></p>}
    </div>
  );
}
