import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useSeo } from '../lib/seo';
import { useSettings } from '../lib/settings';

export default function Profile() {
  useSeo({ title: 'আমার অ্যাকাউন্ট | MasterMind', path: '/account', noindex: true });
  const { user } = useAuth(); const s = useSettings();
  const [v, setV] = useState({ full_name: '', phone: '' }); const [msg, setMsg] = useState('');
  useEffect(() => { supabase.from('profiles').select('full_name,phone').eq('id', user!.id).maybeSingle().then(({ data }) => data && setV({ full_name: data.full_name, phone: data.phone ?? '' })); }, [user?.id]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('profiles').update({ full_name: v.full_name.trim().slice(0, 120), phone: v.phone.trim() || null }).eq('id', user!.id);
    setMsg(error ? 'সেভ করা যায়নি।' : 'সেভ হয়েছে।');
  }
  return (<div className="wrap section" style={{ maxWidth: 560 }}><h1>আমার অ্যাকাউন্ট</h1>
    <p className="row"><Link className="btn ghost sm" to="/account/orders">আমার অর্ডার</Link><Link className="btn ghost sm" to="/account/purchases">আমার কেনা পণ্য</Link></p>
    <form className="f" onSubmit={save}><label>ইমেইল<input value={user?.email ?? ''} disabled /></label>
      <label>নাম<input value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} required maxLength={120} /></label>
      <label>মোবাইল<input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} inputMode="tel" /></label>
      {msg && <p role="status">{msg}</p>}<button className="btn">সেভ করুন</button></form>
    {s.support?.whatsapp_number && <p className="muted">সাহায্য দরকার? <Link to="/contact">সাপোর্টে যোগাযোগ করুন</Link></p>}</div>);
}
