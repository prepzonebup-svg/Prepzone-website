import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { supabase, coverUrl } from '../lib/supabase';

export default function Layout() {
  const { user, roles } = useAuth();
  const s = useSettings();
  const nav = useNavigate();
  const brand = s.brand ?? {};
  const social = s.social ?? {};
  return (
    <>
      {brand.announcement ? <div className="announce">{brand.announcement}</div> : null}
      <header className="top">
        <div className="wrap">
          <Link to="/" className="logo">{brand.logo_path ? <img src={coverUrl(brand.logo_path)!} alt={brand.name ?? 'MasterMind'} style={{ height: 36, width: 'auto' }} /> : <>{brand.name ? brand.name.split(' ')[0] : 'MasterMind'}<span className="small muted"> Admission</span></>}</Link>
          <nav className="main" aria-label="প্রধান মেনু">
            <NavLink to="/courses">কোর্স</NavLink><NavLink to="/exam-batches">এক্সাম ব্যাচ</NavLink>
            <NavLink to="/books">বই</NavLink><NavLink to="/pdfs">পিডিএফ</NavLink><NavLink to="/contact">সাপোর্ট</NavLink>
          </nav>
          <div className="row">
            {user ? (<>
              {roles.length > 0 && <Link className="btn sm ghost" to="/admin">অ্যাডমিন</Link>}
              <Link className="btn sm ghost" to="/account/purchases">আমার কেনা</Link>
              <button className="btn sm ghost" onClick={async () => { await supabase.auth.signOut(); nav('/'); }}>লগআউট</button>
            </>) : (<><Link className="btn sm ghost" to="/login">লগইন</Link><Link className="btn sm" to="/register">রেজিস্টার</Link></>)}
          </div>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="foot">
        <div className="wrap">
          <div className="cols">
            <div><strong>{brand.name ?? 'MasterMind University Admission Programme'}</strong><br /><span className="small">{brand.domain}</span></div>
            <div className="small"><Link to="/about">আমাদের সম্পর্কে</Link><br /><Link to="/faq">সাধারণ প্রশ্ন</Link><br /><Link to="/contact">যোগাযোগ</Link></div>
            <div className="small"><Link to="/terms">শর্তাবলি</Link><br /><Link to="/privacy">প্রাইভেসি পলিসি</Link><br /><Link to="/refund">রিফান্ড পলিসি</Link><br /><Link to="/shipping">ডেলিভারি পলিসি</Link></div>
            <div className="small">{['facebook', 'youtube', 'telegram'].filter((k) => social[k]).map((k) => (<div key={k}><a href={social[k]} rel="noopener noreferrer">{k}</a></div>))}</div>
          </div>
        </div>
      </footer>
    </>
  );
}
