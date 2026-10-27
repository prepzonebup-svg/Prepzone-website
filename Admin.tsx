import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useSeo } from '../lib/seo';
import { can } from './ui';
import Dashboard from './Dashboard';
import Payments from './Payments';
import Orders from './Orders';
import { ProductList, ProductForm } from './Products';
import Inventory from './Inventory';
import Coupons from './Coupons';
import SettingsPage from './SettingsPage';
import Content from './Content';
import Roles from './Roles';

export default function Admin() {
  const { roles } = useAuth();
  useSeo({ title: 'Admin | MasterMind', path: '/admin', noindex: true });
  const links: [string, string, boolean][] = [
    ['/admin', 'ড্যাশবোর্ড', true], ['/admin/payments', 'পেমেন্ট', can(roles, 'payment_verifier')], ['/admin/orders', 'অর্ডার', can(roles, 'product_order_manager', 'payment_verifier')],
    ['/admin/products', 'পণ্য', can(roles, 'product_order_manager')], ['/admin/inventory', 'ইনভেন্টরি', can(roles, 'product_order_manager')],
    ['/admin/coupons', 'কুপন', can(roles, 'product_order_manager')], ['/admin/content', 'কনটেন্ট', can(roles, 'product_order_manager')],
    ['/admin/settings', 'সেটিংস', can(roles)], ['/admin/roles', 'রোল', can(roles)],
  ];
  return (
    <div className="wrap section">
      <nav className="main" aria-label="অ্যাডমিন মেনু" style={{ flex: 'none', marginBottom: 16 }}>
        {links.filter((l) => l[2]).map(([to, label]) => <NavLink key={to} to={to} end={to === '/admin'}>{label}</NavLink>)}
      </nav>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="payments" element={<Payments />} />
        <Route path="orders" element={<Orders />} />
        <Route path="products" element={<ProductList />} />
        <Route path="products/:id" element={<ProductForm />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="coupons" element={<Coupons />} />
        <Route path="content" element={<Content />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="roles" element={<Roles />} />
      </Routes>
    </div>
  );
}
