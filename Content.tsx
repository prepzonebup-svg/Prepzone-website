import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading } from '../components/ui';
import { useAction, Msg } from './ui';

export default function Content() {
  const [pages, setPages] = useState<any[] | null>(null); const [sel, setSel] = useState<any>(null); const a = useAction();
  const load = () => supabase.from('cms_pages').select('*').order('slug').then(({ data }) => setPages(data ?? []));
  useEffect(() => { load(); }, []);
  if (!pages) return <Loading />;
  return (<><h1>কনটেন্ট</h1>
    <p className="row">{pages.map((p) => <button key={p.slug} className={`btn sm ${sel?.slug === p.slug ? '' : 'ghost'}`} onClick={() => setSel(p)}>{p.title}</button>)}</p>
    {sel && <form className="f panel" onSubmit={(e) => { e.preventDefault(); a.run(async () => { const { error } = await supabase.from('cms_pages').update({ title: sel.title, body_md: sel.body_md, seo_description: sel.seo_description || null, status: sel.status, updated_at: new Date().toISOString() }).eq('slug', sel.slug); if (error) throw new Error('সংরক্ষণ করা যায়নি।'); load(); }); }}>
      <label>শিরোনাম<input value={sel.title} onChange={(e) => setSel({ ...sel, title: e.target.value })} required /></label>
      <label>বিষয়বস্তু <span className="hint">(Markdown: ## শিরোনাম, - তালিকা, **বোল্ড**, [লিংক](https://…); HTML কাজ করবে না)</span><textarea rows={14} value={sel.body_md} onChange={(e) => setSel({ ...sel, body_md: e.target.value })} /></label>
      <label>SEO বিবরণ<input value={sel.seo_description ?? ''} onChange={(e) => setSel({ ...sel, seo_description: e.target.value })} maxLength={160} /></label>
      <label>স্ট্যাটাস<select value={sel.status} onChange={(e) => setSel({ ...sel, status: e.target.value })}><option value="published">published</option><option value="draft">draft</option></select></label>
      <Msg err={a.err} ok={a.ok} /><div><button className="btn" disabled={a.busy}>সংরক্ষণ</button></div></form>}
    <Banners /></>);
}

function Banners() {
  const [rows, setRows] = useState<any[] | null>(null); const a = useAction();
  const load = () => supabase.from('banners').select('*').order('sort_order').then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  const [n, setN] = useState({ title: '', subtitle: '', link_url: '' });
  return (<div className="panel"><h3>হোমপেজ ব্যানার</h3>
    {(rows ?? []).map((b) => <div key={b.id} className="row" style={{ justifyContent: 'space-between' }}><span>{b.title} <span className="muted small">{b.subtitle}</span> {!b.is_active && <span className="badge warn">বন্ধ</span>}</span>
      <span className="row"><button className="btn ghost sm" onClick={() => a.run(async () => { await supabase.from('banners').update({ is_active: !b.is_active }).eq('id', b.id); load(); })}>{b.is_active ? 'বন্ধ করুন' : 'চালু করুন'}</button>
        <button className="btn ghost sm" onClick={() => confirm('মুছবেন?') && a.run(async () => { await supabase.from('banners').delete().eq('id', b.id); load(); })}>মুছুন</button></span></div>)}
    <form className="f" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); a.run(async () => {
      if (n.link_url && !/^(https:\/\/|\/)/.test(n.link_url)) throw new Error('লিংক / বা https:// দিয়ে শুরু হতে হবে।');
      const { error } = await supabase.from('banners').insert({ title: n.title, subtitle: n.subtitle || null, link_url: n.link_url || null, sort_order: (rows?.length ?? 0) + 1 }); if (error) throw new Error('যোগ করা যায়নি।'); setN({ title: '', subtitle: '', link_url: '' }); load(); }); }}>
      <div className="row"><input placeholder="শিরোনাম" value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} required /><input placeholder="উপশিরোনাম" value={n.subtitle} onChange={(e) => setN({ ...n, subtitle: e.target.value })} /><input placeholder="লিংক (/courses বা https://…)" value={n.link_url} onChange={(e) => setN({ ...n, link_url: e.target.value })} /></div>
      <Msg err={a.err} ok="" /><div><button className="btn sm" disabled={a.busy}>ব্যানার যোগ করুন</button></div></form></div>);
}
