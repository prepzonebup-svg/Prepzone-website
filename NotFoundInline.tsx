import { Link } from 'react-router-dom';
import { useSeo } from '../lib/seo';
export default function NotFoundInline() {
  useSeo({ title: 'পাতাটি পাওয়া যায়নি | MasterMind', path: '/404', noindex: true });
  return <div className="wrap section state"><h1>পাতাটি পাওয়া যায়নি</h1><p>লিংকটি ভুল হতে পারে বা পণ্যটি এখন প্রকাশিত নেই।</p><Link className="btn" to="/products">সব পণ্য দেখুন</Link></div>;
}
