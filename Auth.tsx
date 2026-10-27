import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSeo } from '../lib/seo';

function useForm() { const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); return { err, setErr, msg, setMsg, busy, setBusy }; }
const bn = (m: string) => /Invalid login/i.test(m) ? 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।' : /already registered/i.test(m) ? 'এই ইমেইল দিয়ে আগে রেজিস্টার করা হয়েছে।' : /rate|too many/i.test(m) ? 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' : /Email not confirmed/i.test(m) ? 'ইমেইল ভেরিফাই করুন।' : 'কিছু ভুল হয়েছে। আবার চেষ্টা করুন।';

export function Login() {
  useSeo({ title: 'লগইন | MasterMind', path: '/login', noindex: true });
  const nav = useNavigate(); const loc: any = useLocation(); const f = useForm();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  async function go(e: React.FormEvent) {
    e.preventDefault(); f.setBusy(true); f.setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { f.setErr(bn(error.message)); f.setBusy(false); } else nav(loc.state?.from ?? '/account/purchases', { replace: true });
  }
  return (<div className="wrap section" style={{ maxWidth: 460 }}><h1>লগইন</h1>
    <form className="f" onSubmit={go}>
      <label>ইমেইল<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
      <label>পাসওয়ার্ড<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
      {f.err && <p className="err" role="alert">{f.err}</p>}
      <button className="btn" disabled={f.busy}>লগইন করুন</button>
      <p><Link to="/reset-password">পাসওয়ার্ড ভুলে গেছেন?</Link> · <Link to="/register">নতুন অ্যাকাউন্ট</Link></p>
    </form></div>);
}

export function Register() {
  useSeo({ title: 'রেজিস্ট্রেশন | MasterMind', path: '/register', noindex: true });
  const f = useForm(); const [v, setV] = useState({ full_name: '', phone: '', email: '', password: '' });
  const set = (k: string) => (e: any) => setV({ ...v, [k]: e.target.value });
  async function go(e: React.FormEvent) {
    e.preventDefault(); f.setBusy(true); f.setErr('');
    const { data, error } = await supabase.auth.signUp({ email: v.email, password: v.password, options: { data: { full_name: v.full_name, phone: v.phone }, emailRedirectTo: `${location.origin}/account/purchases` } });
    f.setBusy(false);
    if (error) f.setErr(bn(error.message));
    else f.setMsg(data.session ? 'রেজিস্ট্রেশন সম্পন্ন।' : 'আপনার ইমেইলে একটি ভেরিফিকেশন লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে লগইন করুন।');
  }
  return (<div className="wrap section" style={{ maxWidth: 460 }}><h1>নতুন অ্যাকাউন্ট</h1>
    <form className="f" onSubmit={go}>
      <label>পূর্ণ নাম<input value={v.full_name} onChange={set('full_name')} required maxLength={120} autoComplete="name" /></label>
      <label>মোবাইল নম্বর<input value={v.phone} onChange={set('phone')} required inputMode="tel" placeholder="01XXXXXXXXX" pattern="(\+?88)?01[3-9][0-9]{8}" autoComplete="tel" /></label>
      <label>ইমেইল<input type="email" value={v.email} onChange={set('email')} required autoComplete="email" /></label>
      <label>পাসওয়ার্ড <span className="hint">(কমপক্ষে ৮ অক্ষর)</span><input type="password" value={v.password} onChange={set('password')} required minLength={8} autoComplete="new-password" /></label>
      {f.err && <p className="err" role="alert">{f.err}</p>}{f.msg && <p className="panel ok" role="status">{f.msg}</p>}
      <button className="btn" disabled={f.busy}>রেজিস্টার করুন</button>
      <p>আগে থেকে অ্যাকাউন্ট আছে? <Link to="/login">লগইন</Link></p>
    </form></div>);
}

export function ResetRequest() {
  useSeo({ title: 'পাসওয়ার্ড রিসেট | MasterMind', path: '/reset-password', noindex: true });
  const f = useForm(); const [email, setEmail] = useState('');
  async function go(e: React.FormEvent) {
    e.preventDefault(); f.setBusy(true);
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password/update` });
    f.setBusy(false); f.setMsg('ইমেইলটি নিবন্ধিত থাকলে পাসওয়ার্ড রিসেটের লিংক পাঠানো হয়েছে।'); // same message either way
  }
  return (<div className="wrap section" style={{ maxWidth: 460 }}><h1>পাসওয়ার্ড রিসেট</h1>
    <form className="f" onSubmit={go}><label>ইমেইল<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      {f.msg && <p className="panel ok" role="status">{f.msg}</p>}<button className="btn" disabled={f.busy}>রিসেট লিংক পাঠান</button></form></div>);
}

export function ResetUpdate() {
  useSeo({ title: 'নতুন পাসওয়ার্ড | MasterMind', path: '/reset-password/update', noindex: true });
  const f = useForm(); const nav = useNavigate(); const [pw, setPw] = useState(''); const [ready, setReady] = useState(false);
  useEffect(() => { const { data } = supabase.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') setReady(true); }); supabase.auth.getSession().then(({ data }) => data.session && setReady(true)); return () => data.subscription.unsubscribe(); }, []);
  async function go(e: React.FormEvent) {
    e.preventDefault(); f.setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    f.setBusy(false); if (error) f.setErr('পাসওয়ার্ড পরিবর্তন করা যায়নি। লিংকটির মেয়াদ শেষ হতে পারে।'); else { f.setMsg('পাসওয়ার্ড পরিবর্তন হয়েছে।'); setTimeout(() => nav('/account/purchases'), 1200); }
  }
  return (<div className="wrap section" style={{ maxWidth: 460 }}><h1>নতুন পাসওয়ার্ড দিন</h1>
    {!ready ? <p className="muted">ইমেইলের লিংক থেকে এই পাতায় আসুন।</p> :
      <form className="f" onSubmit={go}><label>নতুন পাসওয়ার্ড<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required autoComplete="new-password" /></label>
        {f.err && <p className="err" role="alert">{f.err}</p>}{f.msg && <p className="panel ok">{f.msg}</p>}<button className="btn" disabled={f.busy}>পাসওয়ার্ড সেভ করুন</button></form>}</div>);
}
