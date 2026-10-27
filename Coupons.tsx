import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, Empty } from '../components/ui';
import { useAction, Msg } from './ui';

const blank = { id: '', code: '', type: 'percent', value: '', max_discount: '', min_order: '0', starts_at: '', ends_at: '', usage_limit: '', per_user_limit: '1', is_active: true };
const toLocal = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 16) : '');
export default function Coupons() {
  const [rows, setRows] = useState<any[] | null>(null); const [f, setF] = useState<any>(blank); const a = useAction();
  const load = () => supabase.from('coupons').select('*').order('created_at', { ascending: false }).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = (e: React.FormEvent) => { e.preventDefault(); a.run(async () => {
    const row: any = { code: f.code.trim().toUpperCase(), type: f.type, value: Number(f.value), max_discount: f.max_discount ? Number(f.max_discount) : null, min_order: Number(f.min_order || 0),
      starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null, ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null, usage_limit: f.usage_limit ? Number(f.usage_limit) : null, per_user_limit: Number(f.per_user_limit || 1), is_active: f.is_active };
    const { error } = f.id ? await supabase.from('coupons').update(row).eq('id', f.id) : await supabase.from('coupons').insert(row);
    if (error) throw new Error('কুপন সংরক্ষণ করা যায়নি (কোড ইউনিক ও মান সঠিক কিনা দেখুন)।'); setF(blank); load(); }); };
  return (<><h1>কুপন</h1>
    <form className="f panel" onSubmit={save}>
      <div className="row"><label>কোড<input value={f.code} onChange={set('code')} required maxLength={30} /></label>
        <label>ধরন<select value={f.type} onChange={set('type')}><option value="percent">শতাংশ (%)</option><option value="fixed">নির্দিষ্ট টাকা</option></select></label>
        <label>মান<input inputMode="decimal" value={f.value} onChange={set('value')} required /></label>
        <label>সর্বোচ্চ ছাড় <span className="hint">(ঐচ্ছিক)</span><input inputMode="decimal" value={f.max_discount} onChange={set('max_discount')} /></label></div>
      <div className="row"><label>ন্যূনতম অর্ডার<input inputMode="decimal" value={f.min_order} onChange={set('min_order')} /></label>
        <label>শুরু<input type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></label><label>শেষ<input type="datetime-local" value={f.ends_at} onChange={set('ends_at')} /></label></div>
      <div className="row"><label>মোট ব্যবহার সীমা<input inputMode="numeric" value={f.usage_limit} onChange={set('usage_limit')} /></label>
        <label>প্রতি ইউজার<input inputMode="numeric" value={f.per_user_limit} onChange={set('per_user_limit')} /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input style={{ width: 'auto', minHeight: 0 }} type="checkbox" checked={f.is_active} onChange={set('is_active')} />সক্রিয়</label></div>
      <Msg err={a.err} ok={a.ok} /><div className="row"><button className="btn" disabled={a.busy}>{f.id ? 'আপডেট' : 'কুপন তৈরি'}</button>{f.id && <button type="button" className="btn ghost" onClick={() => setF(blank)}>নতুন</button>}</div></form>
    {rows === null ? <Loading /> : rows.length === 0 ? <Empty>কোনো কুপন নেই।</Empty> : <table className="t"><tbody>{rows.map((c) => <tr key={c.id}>
      <td><strong>{c.code}</strong> {!c.is_active && <span className="badge bad">নিষ্ক্রিয়</span>}</td><td>{c.type === 'percent' ? `${c.value}%` : `৳${c.value}`}</td>
      <td className="small muted">ন্যূনতম ৳{c.min_order}{c.usage_limit ? ` · সীমা ${c.usage_limit}` : ''}</td>
      <td><button className="btn ghost sm" onClick={() => setF({ ...c, value: String(c.value), max_discount: c.max_discount ?? '', min_order: String(c.min_order), starts_at: toLocal(c.starts_at), ends_at: toLocal(c.ends_at), usage_limit: c.usage_limit ?? '', per_user_limit: String(c.per_user_limit) })}>এডিট</button></td></tr>)}</tbody></table>}</>);
}
