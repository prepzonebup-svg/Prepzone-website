import { useEffect, useState } from 'react';
import { Loading } from '../components/ui';
import { api, useAction, Msg } from './ui';

const ROLES: [string, string][] = [['super_admin', 'Super Admin'], ['product_order_manager', 'Product/Order Manager'], ['payment_verifier', 'Payment Verifier']];
export default function Roles() {
  const [rows, setRows] = useState<any[] | null>(null); const [email, setEmail] = useState(''); const [role, setRole] = useState('payment_verifier'); const a = useAction();
  const load = () => api<any[]>('admin-roles', { action: 'list' }).then(setRows);
  useEffect(() => { load(); }, []);
  return (<><h1>অ্যাডমিন রোল</h1>
    <p className="muted">যাকে রোল দেবেন তাকে আগে সাইটে রেজিস্টার করতে হবে। সব রোল পরিবর্তন অডিট লগে থাকে।</p>
    <form className="row" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await api('admin-roles', { action: 'grant', email, role }); setEmail(''); load(); }); }}>
      <input style={{ maxWidth: 280 }} type="email" placeholder="ইউজারের ইমেইল" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <select style={{ maxWidth: 240 }} value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button className="btn sm" disabled={a.busy}>রোল দিন</button></form><Msg err={a.err} ok={a.ok} />
    {rows === null ? <Loading /> : <table className="t"><tbody>{rows.map((r) => <tr key={r.user_id + r.role}><td>{r.email}</td><td>{ROLES.find((x) => x[0] === r.role)?.[1]}</td>
      <td><button className="btn ghost sm" onClick={() => confirm('রোলটি সরাবেন?') && a.run(async () => { await api('admin-roles', { action: 'revoke', user_id: r.user_id, role: r.role }); load(); })}>সরান</button></td></tr>)}</tbody></table>}</>);
}
