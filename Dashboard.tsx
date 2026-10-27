import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Loading, ErrorBox } from '../components/ui';
import { taka, TYPE_LABEL, fmtDateTime } from '../lib/format';

export default function Dashboard() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { api('admin-dashboard').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <ErrorBox msg={err} />; if (!d) return <Loading />;
  const stat = (label: string, v: string | number, bad = false) => <div className={`panel ${bad ? 'bad' : ''}`} style={{ margin: 0 }}><div className="small muted">{label}</div><div className="big">{v}</div></div>;
  return (<>
    <h1>ড্যাশবোর্ড</h1>
    <div className="grid">
      {stat('মোট অর্ডার', d.total_orders)}{stat('যাচাইয়ের অপেক্ষায় পেমেন্ট', d.pending_payments)}
      {stat(`${d.waiting_minutes} মিনিটের বেশি পেন্ডিং`, d.overdue_pending, d.overdue_pending > 0)}
      {stat('অনুমোদিত বিক্রয় (gross)', taka(d.gross_approved_sales))}{stat('রিফান্ড', taka(d.refunded_total))}{stat('ডেলিভারি সম্পন্ন', d.delivered_orders)}
    </div>
    <p className="small muted">বিক্রয়ের অংক শুধু অনুমোদিত পেমেন্ট থেকে; পেন্ডিং ও রিফান্ড আলাদা।</p>
    <h2>ধরন অনুযায়ী বিক্রয়</h2>
    <table className="t"><tbody>{Object.keys(TYPE_LABEL).map((t) => <tr key={t}><td>{TYPE_LABEL[t]}</td><td>{taka(d.sales_by_type[t] ?? 0)}</td></tr>)}</tbody></table>
    <h2>কম স্টক</h2>
    {d.low_stock.length === 0 ? <p className="muted">কম স্টকের কোনো বই নেই।</p> : <ul>{d.low_stock.map((b: any) => <li key={b.product_id}>{b.title} — {b.stock} টি</li>)}</ul>}
    <h2>সাম্প্রতিক কার্যক্রম</h2>
    <ul>{d.recent_activity.map((a: any, i: number) => <li key={i}>{a.action} · {a.entity} · <span className="muted small">{fmtDateTime(a.created_at)}</span></li>)}</ul>
  </>);
}
