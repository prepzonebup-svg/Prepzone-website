import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, coverUrl } from '../lib/supabase';
import { Loading, Empty } from '../components/ui';
import { taka, TYPE_LABEL } from '../lib/format';
import { api, useAction, Msg, Scroll } from './ui';

export function ProductList() {
  const [rows, setRows] = useState<any[] | null>(null); const [type, setType] = useState('');
  useEffect(() => { setRows(null); let q = supabase.from('products').select('id,title,slug,type,status,price_selling,is_featured,book_details(stock_quantity)').order('created_at', { ascending: false }).limit(200); if (type) q = q.eq('type', type); q.then(({ data }) => setRows(data ?? [])); }, [type]);
  return (<><h1>পণ্য</h1>
    <div className="row"><Link className="btn sm" to="/admin/products/new">+ নতুন পণ্য</Link>
      <select style={{ maxWidth: 200 }} value={type} onChange={(e) => setType(e.target.value)}><option value="">সব ধরন</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    {rows === null ? <Loading /> : rows.length === 0 ? <Empty>কোনো পণ্য নেই।</Empty> : <Scroll><table className="t"><tbody>{rows.map((p) => <tr key={p.id}>
      <td><Link to={`/admin/products/${p.id}`}><strong>{p.title}</strong></Link></td><td>{TYPE_LABEL[p.type]}</td><td>{taka(p.price_selling)}</td>
      <td><span className={`badge ${p.status === 'published' ? '' : 'warn'}`}>{p.status}</span></td><td>{p.book_details ? `স্টক ${p.book_details.stock_quantity}` : ''}</td>
      <td>{p.status === 'published' && <Link className="small" to={`/p/${p.slug}`}>প্রিভিউ</Link>}</td></tr>)}</tbody></table></Scroll>}</>);
}

const blank: any = { type: 'course', title: '', slug: '', short_desc: '', description: '', price_original: '', price_selling: '', status: 'draft', available_from: '', available_until: '',
  benefits: '', faqs: '', purchase_note: '', is_featured: false, seo_title: '', seo_description: '',
  author: '', sku: '', weight_grams: '', low_stock_threshold: '5', max_per_order: '10', initial_stock: '0', starts_on: '', ends_on: '',
  tg_enabled: false, tg_method: 'manual', tg_chat_id: '', tg_invite_link: '', tg_instructions: '' };
const toLocal = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 16) : '');
const num = (v: string) => (v === '' ? null : Number(v));

export function ProductForm() {
  const { id } = useParams(); const isNew = id === 'new'; const nav = useNavigate(); const a = useAction();
  const [f, setF] = useState<any>(blank); const [loaded, setLoaded] = useState(isNew); const [cover, setCover] = useState<string | null>(null); const [hasPdf, setHasPdf] = useState(false);
  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data: p } = await supabase.from('products').select('*, book_details(*), batch_details(*), product_assets(kind)').eq('id', id!).maybeSingle();
      const { data: t } = await supabase.from('telegram_access').select('*').eq('product_id', id!).maybeSingle();
      if (!p) return nav('/admin/products');
      setCover(p.cover_path); setHasPdf((p.product_assets ?? []).some((x: any) => x.kind === 'pdf_private'));
      setF({ ...blank, ...p, price_original: p.price_original ?? '', price_selling: String(p.price_selling), short_desc: p.short_desc ?? '', description: p.description ?? '', purchase_note: p.purchase_note ?? '',
        seo_title: p.seo_title ?? '', seo_description: p.seo_description ?? '', available_from: toLocal(p.available_from), available_until: toLocal(p.available_until),
        benefits: (p.benefits ?? []).join('\n'), faqs: (p.faqs ?? []).map((x: any) => `${x.q} || ${x.a}`).join('\n'),
        author: p.book_details?.author ?? '', sku: p.book_details?.sku ?? '', weight_grams: p.book_details?.weight_grams ?? '', low_stock_threshold: String(p.book_details?.low_stock_threshold ?? 5), max_per_order: String(p.book_details?.max_per_order ?? 10),
        starts_on: p.batch_details?.starts_on ?? '', ends_on: p.batch_details?.ends_on ?? '',
        tg_enabled: t?.is_enabled ?? false, tg_method: t?.method ?? 'manual', tg_chat_id: t?.chat_id ?? '', tg_invite_link: t?.invite_link ?? '', tg_instructions: t?.instructions ?? '' });
      setLoaded(true);
    })();
  }, [id]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const book = f.type === 'printed_book', batch = f.type === 'exam_batch', tg = f.type === 'course' || batch;

  const save = (e: React.FormEvent) => { e.preventDefault(); a.run(async () => {
    const row: any = { type: f.type, title: f.title.trim(), slug: f.slug.trim(), short_desc: f.short_desc || null, description: f.description || null,
      price_original: num(String(f.price_original)), price_selling: Number(f.price_selling), status: f.status,
      available_from: f.available_from ? new Date(f.available_from).toISOString() : null, available_until: f.available_until ? new Date(f.available_until).toISOString() : null,
      benefits: f.benefits.split('\n').map((x: string) => x.trim()).filter(Boolean),
      faqs: f.faqs.split('\n').map((l: string) => l.split('||')).filter((p: string[]) => p.length === 2 && p[0].trim() && p[1].trim()).map((p: string[]) => ({ q: p[0].trim(), a: p[1].trim() })),
      purchase_note: f.purchase_note || null, is_featured: f.is_featured, seo_title: f.seo_title || null, seo_description: f.seo_description || null };
    let pid = id!;
    if (isNew) { const { data, error } = await supabase.from('products').insert(row).select('id').single(); if (error) throw new Error('সংরক্ষণ করা যায়নি: স্লাগ ইউনিক (a-z, 0-9, -) ও দাম সঠিক কিনা দেখুন।'); pid = data.id; }
    else { const { type, ...upd } = row; const { error } = await supabase.from('products').update(upd).eq('id', pid); if (error) throw new Error('আপডেট করা যায়নি: স্লাগ ও দাম দেখুন।'); }
    if (book) {
      const d = { author: f.author || null, sku: f.sku || null, weight_grams: num(String(f.weight_grams)), low_stock_threshold: Number(f.low_stock_threshold), max_per_order: Number(f.max_per_order) };
      const { error } = isNew ? await supabase.from('book_details').insert({ product_id: pid, ...d }) : await supabase.from('book_details').update(d).eq('product_id', pid);
      if (error) throw new Error('বইয়ের তথ্য সংরক্ষণ করা যায়নি (SKU ইউনিক হতে হবে)।');
      if (isNew && Number(f.initial_stock) > 0) await api('admin-adjust-stock', { product_id: pid, delta: Number(f.initial_stock), reason: 'restock', note: 'initial stock' });
    }
    if (batch) { const { error } = await supabase.from('batch_details').upsert({ product_id: pid, starts_on: f.starts_on || null, ends_on: f.ends_on || null }); if (error) throw new Error('ব্যাচের তারিখ সঠিক নয়।'); }
    if (tg) { const { error } = await supabase.from('telegram_access').upsert({ product_id: pid, is_enabled: f.tg_enabled, method: f.tg_method, chat_id: f.tg_chat_id || null, invite_link: f.tg_invite_link || null, instructions: f.tg_instructions || null, updated_at: new Date().toISOString() }); if (error) throw new Error('টেলিগ্রাম সেটিংস সংরক্ষণ করা যায়নি।'); }
    if (isNew) nav(`/admin/products/${pid}`, { replace: true });
  }, 'সংরক্ষিত হয়েছে।'); };

  const upload = (kind: 'cover' | 'pdf') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || isNew) return;
    await a.run(async () => {
      const u = await api<{ bucket: string; path: string; token: string }>('admin-upload-url', { product_id: id, kind, content_type: file.type, size: file.size });
      const { error } = await supabase.storage.from(u.bucket).uploadToSignedUrl(u.path, u.token, file); if (error) throw new Error('আপলোড ব্যর্থ হয়েছে।');
      await api('admin-register-asset', { product_id: id, kind, path: u.path }); if (kind === 'cover') setCover(u.path); else setHasPdf(true);
    }, 'আপলোড সম্পন্ন।');
  };
  if (!loaded) return <Loading />;
  const L = (label: string, el: JSX.Element, hint?: string) => <label>{label}{hint && <span className="hint"> {hint}</span>}{el}</label>;
  return (<><p><Link to="/admin/products">← সব পণ্য</Link></p><h1>{isNew ? 'নতুন পণ্য' : f.title}</h1>
    <form className="f" onSubmit={save}>
      {L('ধরন', <select value={f.type} onChange={set('type')} disabled={!isNew}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>)}
      {L('শিরোনাম', <input value={f.title} onChange={set('title')} required maxLength={200} />)}
      {L('স্লাগ (URL)', <input value={f.slug} onChange={set('slug')} required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="english-challenge-course" />, '(ছোট হাতের ইংরেজি, সংখ্যা ও -)')}
      {L('সংক্ষিপ্ত বিবরণ', <input value={f.short_desc} onChange={set('short_desc')} maxLength={300} />)}
      {L('বিস্তারিত', <textarea rows={6} value={f.description} onChange={set('description')} />, '(Markdown: ## শিরোনাম, - তালিকা, **বোল্ড**; HTML চলবে না)')}
      <div className="row">{L('আগের দাম', <input inputMode="decimal" value={f.price_original} onChange={set('price_original')} />, '(ঐচ্ছিক)')}{L('বিক্রয় মূল্য', <input inputMode="decimal" value={f.price_selling} onChange={set('price_selling')} required />)}</div>
      {L('স্ট্যাটাস', <select value={f.status} onChange={set('status')}><option value="draft">draft</option><option value="published">published</option><option value="unpublished">unpublished</option><option value="archived">archived</option></select>)}
      <div className="row">{L('উপলব্ধ শুরু', <input type="datetime-local" value={f.available_from} onChange={set('available_from')} />)}{L('উপলব্ধ শেষ', <input type="datetime-local" value={f.available_until} onChange={set('available_until')} />)}</div>
      {L('যা যা পাবেন', <textarea rows={4} value={f.benefits} onChange={set('benefits')} />, '(প্রতি লাইনে একটি)')}
      {L('প্রশ্নোত্তর', <textarea rows={4} value={f.faqs} onChange={set('faqs')} />, '(প্রতি লাইনে: প্রশ্ন || উত্তর)')}
      {L('ক্রয় নির্দেশনা', <input value={f.purchase_note} onChange={set('purchase_note')} maxLength={300} />)}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input style={{ width: 'auto', minHeight: 0 }} type="checkbox" checked={f.is_featured} onChange={set('is_featured')} />হোমপেজে দেখান</label>
      {L('SEO শিরোনাম', <input value={f.seo_title} onChange={set('seo_title')} maxLength={70} />)}{L('SEO বিবরণ', <input value={f.seo_description} onChange={set('seo_description')} maxLength={160} />)}
      {batch && <div className="row">{L('ব্যাচ শুরু', <input type="date" value={f.starts_on} onChange={set('starts_on')} />)}{L('ব্যাচ শেষ', <input type="date" value={f.ends_on} onChange={set('ends_on')} />)}</div>}
      {book && <div className="panel"><h3>ছাপা বইয়ের তথ্য</h3>
        <div className="row">{L('লেখক', <input value={f.author} onChange={set('author')} />)}{L('SKU/ISBN', <input value={f.sku} onChange={set('sku')} />)}{L('ওজন (গ্রাম)', <input inputMode="numeric" value={f.weight_grams} onChange={set('weight_grams')} />)}</div>
        <div className="row">{L('কম স্টকের সীমা', <input inputMode="numeric" value={f.low_stock_threshold} onChange={set('low_stock_threshold')} />)}{L('প্রতি অর্ডারে সর্বোচ্চ', <input inputMode="numeric" value={f.max_per_order} onChange={set('max_per_order')} />)}
          {isNew ? L('প্রারম্ভিক স্টক', <input inputMode="numeric" value={f.initial_stock} onChange={set('initial_stock')} />) : <p className="small muted">স্টক পরিবর্তন করতে <Link to="/admin/inventory">ইনভেন্টরি</Link> ব্যবহার করুন।</p>}</div></div>}
      {tg && <div className="panel"><h3>টেলিগ্রাম অ্যাক্সেস</h3>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input style={{ width: 'auto', minHeight: 0 }} type="checkbox" checked={f.tg_enabled} onChange={set('tg_enabled')} />চালু</label>
        {L('পদ্ধতি', <select value={f.tg_method} onChange={set('tg_method')}><option value="manual">ম্যানুয়াল লিংক/নির্দেশনা</option><option value="bot_invite">বট দিয়ে একবার-ব্যবহারযোগ্য ইনভাইট</option></select>)}
        {f.tg_method === 'bot_invite' ? L('Chat ID', <input value={f.tg_chat_id} onChange={set('tg_chat_id')} placeholder="-100…" />, '(বটকে গ্রুপে অ্যাডমিন করতে হবে)') : L('ইনভাইট লিংক', <input value={f.tg_invite_link} onChange={set('tg_invite_link')} />, '(শুধু অনুমোদিত শিক্ষার্থীদের দেখানো হবে)')}
        {L('নির্দেশনা', <textarea rows={3} value={f.tg_instructions} onChange={set('tg_instructions')} />)}</div>}
      <Msg err={a.err} ok={a.ok} /><button className="btn" disabled={a.busy}>{isNew ? 'পণ্য তৈরি করুন' : 'সংরক্ষণ করুন'}</button>
    </form>
    {!isNew && <div className="panel"><h3>ফাইল</h3>
      <p>কভার ছবি (JPG/PNG/WebP, ≤৫MB)</p>{cover && <img className="cover" style={{ maxWidth: 260 }} src={coverUrl(cover)!} alt="" />}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload('cover')} />
      {f.type === 'pdf_book' && <><p style={{ marginTop: 16 }}>প্রাইভেট PDF (≤১০০MB) {hasPdf ? '— আপলোড করা আছে (নতুন ফাইল দিলে প্রতিস্থাপিত হবে)' : '— এখনো নেই'}</p><input type="file" accept="application/pdf" onChange={upload('pdf')} /></>}</div>}
  </>);
}
