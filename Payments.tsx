import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { Loading, Empty } from '../components/ui';
import { taka, fmtDateTime } from '../lib/format';
import { api, mins, useAction, Msg, Scroll } from './ui';

const TABS: [string, string][] = [['pending_verification', 'যাচাইয়ের অপেক্ষায়'], ['approved', 'অনুমোদিত'], ['rejected', 'বাতিল']];

export default function Payments() {
  const s = useSettings(); const waitMin = Number(s.support?.waiting_minutes ?? 60);
  const [tab, setTab] = useState('pending_verification');
  const [rows, setRows] = useState<any[] | null>(null); const [people, setPeople] = useState<Record<string, any>>({});
  const [dups, setDups] = useState<Record<string, number>>({}); const [flags, setFlags] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    setRows(null);
    const { data } = await supabase.from('payments').select('*, orders(id,order_no,total,user_id,order_items(product_title))')
      .eq('status', tab).order('submitted_at', { ascending: tab === 'pending_verification' }).limit(100);
    const list = data ?? []; setRows(list);
    const uids = [...new Set(list.map((r: any) => r.orders?.user_id))];
    if (uids.length) supabase.from('profiles').select('id,full_name,phone').in('id', uids).then(({ data }) => setPeople(Object.fromEntries((data ?? []).map((p) => [p.id, p]))));
    const trxs = [...new Set(list.map((r: any) => r.trx_id))];
    if (trxs.length) supabase.from('payments').select('id,method,trx_id').in('trx_id', trxs).then(({ data }) => {
      const c: Record<string, number> = {}; (data ?? []).forEach((p) => { const k = `${p.method}:${p.trx_id}`; c[k] = (c[k] ?? 0) + 1; }); setDups(c); });
    if (list.length) supabase.from('payment_events').select('payment_id').in('payment_id', list.map((r: any) => r.id)).like('event', 'flagged%').then(({ data }) => setFlags(new Set((data ?? []).map((e) => e.payment_id))));
  }, [tab]);
  useEffect(() => { load(); }, [load]);
  return (<>
    <h1>পেমেন্ট যাচাই</h1>
    <p className="row">{TABS.map(([k, l]) => <button key={k} className={`btn sm ${tab === k ? '' : 'ghost'}`} onClick={() => setTab(k)}>{l}</button>)}</p>
    <p className="small muted">bKash/Nagad অ্যাকাউন্টে আসল লেনদেন মিলিয়ে তারপর অনুমোদন দিন। সময় পার হলেও কোনো পেমেন্ট নিজে থেকে অনুমোদিত হয় না।</p>
    {rows === null ? <Loading /> : rows.length === 0 ? <Empty>কোনো পেমেন্ট নেই।</Empty> : rows.map((r) => (
      <PaymentRow key={r.id} r={r} person={people[r.orders?.user_id]} overdue={tab === 'pending_verification' && mins(r.submitted_at) >= waitMin}
        dup={(dups[`${r.method}:${r.trx_id}`] ?? 1) > 1} flagged={flags.has(r.id)} onDone={load} />))}
  </>);
}

function PaymentRow({ r, person, overdue, dup, flagged, onDone }: any) {
  const { user } = useAuth(); const a = useAction();
  const [open, setOpen] = useState(false); const [amount, setAmount] = useState(''); const [reason, setReason] = useState(''); const [note, setNote] = useState('');
  const [notes, setNotes] = useState<any[]>([]);
  useEffect(() => { if (open) supabase.from('staff_notes').select('note,created_at').eq('order_id', r.order_id).order('created_at').then(({ data }) => setNotes(data ?? [])); }, [open, r.order_id]);
  const decide = (decision: 'approve' | 'reject') => a.run(async () => {
    if (decision === 'approve' && Number(amount) !== Number(r.amount)) throw new Error(`অ্যাকাউন্টে দেখা পরিমাণ (${taka(r.amount)}) টাইপ করুন।`);
    await api('admin-decide-payment', { payment_id: r.id, decision, reason: reason || undefined, verified_amount: decision === 'approve' ? Number(amount) : undefined }); onDone();
  });
  const addNote = () => a.run(async () => { const { error } = await supabase.from('staff_notes').insert({ order_id: r.order_id, payment_id: r.id, author_id: user!.id, note }); if (error) throw error; setNote(''); setNotes([...notes, { note, created_at: new Date().toISOString() }]); }, 'নোট সংরক্ষিত।');
  return (
    <div className={`panel ${overdue ? 'bad' : ''}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><strong>{r.orders?.order_no}</strong> · {taka(r.amount)} · {r.method === 'bkash' ? 'bKash' : 'Nagad'}<br />
          <span className="small muted">{person?.full_name} · {person?.phone} · {r.orders?.order_items?.map((i: any) => i.product_title).join(', ')}</span></div>
        <div className="small">{fmtDateTime(r.submitted_at)}{r.status === 'pending_verification' && <><br /><span className={overdue ? 'err' : 'muted'}>{mins(r.submitted_at)} মিনিট অপেক্ষা</span></>}</div>
      </div>
      <p className="small">প্রেরক: <strong>{r.sender_number}</strong> · TrxID: <strong>{r.trx_id}</strong>
        {dup && <span className="badge bad"> ডুপ্লিকেট TrxID</span>}{flagged && <span className="badge warn"> আগে বাতিল হওয়া TrxID</span>}{r.note && <> · নোট: {r.note}</>}</p>
      {r.status !== 'pending_verification' && <p className="small muted">সিদ্ধান্ত: {fmtDateTime(r.decided_at)} {r.decision_reason ? `· ${r.decision_reason}` : ''}</p>}
      <button className="btn ghost sm" onClick={() => setOpen(!open)}>{open ? 'বন্ধ করুন' : r.status === 'pending_verification' ? 'যাচাই করুন' : 'বিস্তারিত'}</button>
      {open && <div style={{ marginTop: 12 }}>
        {notes.map((n, i) => <p key={i} className="small">📝 {n.note} <span className="muted">({fmtDateTime(n.created_at)})</span></p>)}
        <div className="row"><input style={{ flex: 1 }} placeholder="অভ্যন্তরীণ নোট" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /><button className="btn ghost sm" disabled={!note.trim() || a.busy} onClick={addNote}>নোট যোগ</button></div>
        {r.status === 'pending_verification' && <div className="f" style={{ marginTop: 12 }}>
          <label>অ্যাকাউন্টে আসা পরিমাণ (অনুমোদনের জন্য)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`যেমন ${r.amount}`} /></label>
          <label>কারণ / মন্তব্য <span className="hint">(বাতিলের জন্য বাধ্যতামূলক)</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></label>
          <div className="row"><button className="btn" disabled={a.busy} onClick={() => decide('approve')}>অনুমোদন দিন</button>
            <button className="btn ghost" disabled={a.busy || !reason.trim()} onClick={() => decide('reject')}>বাতিল করুন</button></div></div>}
        <Msg err={a.err} ok={a.ok} />
      </div>}
    </div>);
}
