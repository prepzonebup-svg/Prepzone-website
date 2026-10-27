import { Link } from 'react-router-dom';
import { coverUrl } from '../lib/supabase';
import { taka, TYPE_LABEL } from '../lib/format';

export const Loading = () => <div className="state" role="status">লোড হচ্ছে…</div>;
export const Empty = ({ children }: { children: React.ReactNode }) => <div className="state">{children}</div>;
export const ErrorBox = ({ msg }: { msg: string }) => <div className="panel bad" role="alert">{msg}</div>;

export function Price({ selling, original }: { selling: number; original?: number | null }) {
  return <span className="price"><b>{taka(selling)}</b>{original && original > selling ? <s>{taka(original)}</s> : null}</span>;
}

export function ProductCard({ p }: { p: any }) {
  const img = coverUrl(p.cover_path);
  return (
    <Link to={`/p/${p.slug}`} className="pcard">
      <div className="img">{img ? <img src={img} alt={p.title} loading="lazy" width={400} height={300} /> : <span>{TYPE_LABEL[p.type]}</span>}</div>
      <div className="body">
        <span className="tag">{TYPE_LABEL[p.type]}</span>
        <h3 style={{ margin: 0 }}>{p.title}</h3>
        <Price selling={p.price_selling} original={p.price_original} />
      </div>
    </Link>
  );
}
