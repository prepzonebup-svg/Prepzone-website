import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Loading } from '../components/ui';
import { api, useAction, Msg } from './ui';

type F = { k: string; label: string; area?: boolean; bool?: boolean; num?: boolean; hint?: string };
const SECTIONS: { key: string; title: string; visibility: string; fields: F[] }[] = [
  { key: 'brand', title: 'ব্র্যান্ড', visibility: 'public', fields: [{ k: 'name', label: 'ওয়েবসাইটের নাম' }, { k: 'domain', label: 'ডোমেইন' }, { k: 'announcement', label: 'অ্যানাউন্সমেন্ট বার', hint: 'ফাঁকা রাখলে দেখাবে না' }] },
  { key: 'orders', title: 'অপরিশোধিত অর্ডার', visibility: 'admin', fields: [{ k: 'hold_hours', label: 'পেমেন্ট না এলে স্বয়ংক্রিয় বাতিল (ঘণ্টা)', num: true, hint: 'বইয়ের স্টক ছেড়ে দেওয়ার জন্য; যাচাইয়ের অপেক্ষায় থাকা অর্ডার কখনো বাতিল হয় না' }] },
  { key: 'content', title: 'হোমপেজ লেখা', visibility: 'public', fields: [{ k: 'hero_title', label: 'হিরো শিরোনাম' }, { k: 'hero_subtitle', label: 'হিরো উপশিরোনাম', area: true }] },
  { key: 'support', title: 'সাপোর্ট ও অপেক্ষার সময়', visibility: 'public', fields: [{ k: 'whatsapp_number', label: 'WhatsApp নম্বর', hint: '01XXXXXXXXX বা 8801XXXXXXXXX' }, { k: 'waiting_minutes', label: 'অপেক্ষার সময় (মিনিট)', num: true }, { k: 'default_message_bn', label: 'ডিফল্ট বার্তা', area: true, hint: '{ORDER_ID} ও {PRODUCT_NAME} ব্যবহার করুন' }, { k: 'alt_channel_label', label: 'বিকল্প চ্যানেলের নাম' }, { k: 'alt_channel_url', label: 'বিকল্প চ্যানেলের লিংক (https://…)' }, { k: 'email', label: 'সাপোর্ট ইমেইল' }] },
  { key: 'social', title: 'সোশ্যাল লিংক', visibility: 'public', fields: [{ k: 'facebook', label: 'Facebook' }, { k: 'youtube', label: 'YouTube' }, { k: 'telegram', label: 'Telegram' }] },
  { key: 'seo', title: 'ডিফল্ট SEO', visibility: 'public', fields: [{ k: 'default_title', label: 'শিরোনাম' }, { k: 'default_description', label: 'বিবরণ', area: true }] },
];
const PAY: F[] = [{ k: 'enabled', label: 'চালু', bool: true }, { k: 'number', label: 'নম্বর' }, { k: 'account_type', label: 'অ্যাকাউন্টের ধরন (Personal/Agent/Merchant)' }, { k: 'instructions_bn', label: 'নির্দেশনা (বাংলা)', area: true }];

export default function SettingsPage() {
  const { user } = useAuth(); const [s, setS] = useState<Record<string, any> | null>(null);
  useEffect(() => { supabase.from('site_settings').select('key,value').then(({ data }) => setS(Object.fromEntries((data ?? []).map((r) => [r.key, r.value])))); }, []);
  if (!s) return <Loading />;
  const save = async (key: string, value: any, visibility: string) => {
    const { error } = await supabase.from('site_settings').upsert({ key, value, visibility, updated_by: user!.id, updated_at: new Date().toISOString() });
    if (error) throw new Error('সংরক্ষণ করা যায়নি।'); setS({ ...s, [key]: value });
  };
  return (<><h1>সেটিংস</h1>
    <p className="small muted">পেমেন্ট নম্বর শুধু লগইন করা ব্যবহারকারীরা দেখতে পাবে। সত্যিকারের নম্বরই দিন; এখানে কিছু আগে থেকে ভরা নেই।</p>
    <Section title="পেমেন্ট — bKash" fields={PAY} value={s.payment?.bkash ?? {}} onSave={(v) => save('payment', { ...s.payment, bkash: v }, 'authenticated')} />
    <Section title="পেমেন্ট — Nagad" fields={PAY} value={s.payment?.nagad ?? {}} onSave={(v) => save('payment', { ...s.payment, nagad: v }, 'authenticated')} />
    <Section title="পেমেন্ট — রেফারেন্স নির্দেশনা" fields={[{ k: 'reference_hint_bn', label: 'রেফারেন্স/Order ID নির্দেশনা', area: true }]} value={s.payment ?? {}} onSave={(v) => save('payment', { ...s.payment, reference_hint_bn: v.reference_hint_bn }, 'authenticated')} />
    {SECTIONS.map((sec) => <Section key={sec.key} title={sec.title} fields={sec.fields} value={s[sec.key] ?? {}} onSave={(v) => {
      if (sec.key === 'support') { const m = Number(v.waiting_minutes); if (!Number.isInteger(m) || m < 1 || m > 1440) throw new Error('অপেক্ষার সময় ১–১৪৪০ মিনিটের মধ্যে হতে হবে।'); v = { ...v, waiting_minutes: m }; }
      if (sec.key === 'orders') { const h = Number(v.hold_hours); if (!Number.isInteger(h) || h < 1 || h > 720) throw new Error('১–৭২০ ঘণ্টার মধ্যে দিন।'); v = { hold_hours: h }; }
      for (const k of ['alt_channel_url', 'facebook', 'youtube', 'telegram']) if (v[k] && !/^https:\/\//.test(v[k])) throw new Error('লিংক https:// দিয়ে শুরু হতে হবে।');
      return save(sec.key, { ...s[sec.key], ...v }, sec.visibility); }} />)}
    <LogoUpload current={s.brand?.logo_path} />
    <ShippingZones /></>);
}

function Section({ title, fields, value, onSave }: { title: string; fields: F[]; value: any; onSave: (v: any) => Promise<void> | void }) {
  const [v, setV] = useState<any>(value); const a = useAction();
  return (<form className="f panel" onSubmit={(e) => { e.preventDefault(); a.run(async () => { await onSave(v); }); }}>
    <h3>{title}</h3>
    {fields.map((f) => f.bool ? <label key={f.k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input style={{ width: 'auto', minHeight: 0 }} type="checkbox" checked={!!v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.checked })} />{f.label}</label>
      : <label key={f.k}>{f.label}{f.hint && <span className="hint">{f.hint}</span>}{f.area ? <textarea rows={3} value={v[f.k] ?? ''} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} /> : <input value={v[f.k] ?? ''} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} inputMode={f.num ? 'numeric' : undefined} />}</label>)}
    <Msg err={a.err} ok={a.ok} /><div><button className="btn sm" disabled={a.busy}>সংরক্ষণ</button></div></form>);
}

function ShippingZones() {
  const [z, setZ] = useState<any[] | null>(null); const a = useAction();
  const load = () => supabase.from('shipping_zones').select('*').order('is_default', { ascending: false }).then(({ data }) => setZ(data ?? []));
  useEffect(() => { load(); }, []);
  if (!z) return null;
  return (<div className="panel"><h3>ডেলিভারি চার্জ (এলাকাভিত্তিক)</h3>
    <p className="small muted">এলাকার তালিকা কমা দিয়ে লিখুন। কোনো এলাকা না মিললে ডিফল্ট জোনের চার্জ প্রযোজ্য হবে।</p>
    {z.map((r) => <ZoneRow key={r.id} r={r} onDone={load} />)}
    <button className="btn ghost sm" onClick={() => a.run(async () => { const { error } = await supabase.from('shipping_zones').insert({ name: 'নতুন জোন', charge: 0, areas: [] }); if (error) throw error; load(); })}>+ জোন যোগ করুন</button><Msg err={a.err} ok="" /></div>);
}
function ZoneRow({ r, onDone }: any) {
  const [v, setV] = useState({ name: r.name, areas: r.areas.join(', '), charge: String(r.charge), free_over: r.free_over ?? '', is_active: r.is_active }); const a = useAction();
  return (<div className="f" style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
    <div className="row"><input style={{ maxWidth: 180 }} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />{r.is_default && <span className="badge">ডিফল্ট</span>}
      <input style={{ maxWidth: 110 }} inputMode="decimal" value={v.charge} onChange={(e) => setV({ ...v, charge: e.target.value })} aria-label="চার্জ" />
      <input style={{ maxWidth: 150 }} inputMode="decimal" placeholder="ফ্রি ডেলিভারি ≥" value={v.free_over} onChange={(e) => setV({ ...v, free_over: e.target.value })} /></div>
    <input placeholder="এলাকা: ঢাকা, গাজীপুর, …" value={v.areas} onChange={(e) => setV({ ...v, areas: e.target.value })} />
    <div className="row"><label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input style={{ width: 'auto', minHeight: 0 }} type="checkbox" checked={v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked })} />সক্রিয়</label>
      <button className="btn sm" disabled={a.busy} onClick={() => a.run(async () => { const { error } = await supabase.from('shipping_zones').update({ name: v.name, areas: v.areas.split(',').map((x: string) => x.trim()).filter(Boolean), charge: Number(v.charge), free_over: v.free_over === '' ? null : Number(v.free_over), is_active: v.is_active }).eq('id', r.id); if (error) throw new Error('সংরক্ষণ করা যায়নি।'); onDone(); })}>সংরক্ষণ</button></div><Msg err={a.err} ok={a.ok} /></div>);
}

function LogoUpload({ current }: { current?: string }) {
  const a = useAction();
  return (<div className="panel"><h3>লোগো</h3>
    {current ? <p className="muted small">লোগো সেট করা আছে। নতুন ছবি দিলে বদলে যাবে।</p> : <p className="muted small">এখন লেখা-লোগো দেখানো হচ্ছে।</p>}
    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; a.run(async () => {
      const u = await api<{ bucket: string; path: string; token: string }>('admin-upload-url', { kind: 'logo', content_type: file.type, size: file.size });
      const { error } = await supabase.storage.from(u.bucket).uploadToSignedUrl(u.path, u.token, file); if (error) throw new Error('আপলোড ব্যর্থ হয়েছে।');
      await api('admin-register-asset', { kind: 'logo', path: u.path }); }, 'লোগো আপডেট হয়েছে। পেজ রিফ্রেশ করুন।'); }} /><Msg err={a.err} ok={a.ok} /></div>);
}
