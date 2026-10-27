import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Guard from './components/Guard';
import { Loading } from './components/ui';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import { Login, Register, ResetRequest, ResetUpdate } from './pages/Auth';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Purchases from './pages/Purchases';
import Profile from './pages/Profile';
import { CmsPage, Contact, NotFound } from './pages/Static';

const Admin = lazy(() => import('./admin/Admin')); // staff bundle is not shipped to students

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="products" element={<Products type={null} title="সব পণ্য" path="/products" />} />
          <Route path="courses" element={<Products type="course" title="কোর্স" path="/courses" />} />
          <Route path="exam-batches" element={<Products type="exam_batch" title="এক্সাম ব্যাচ" path="/exam-batches" />} />
          <Route path="books" element={<Products type="printed_book" title="ছাপা বই" path="/books" />} />
          <Route path="pdfs" element={<Products type="pdf_book" title="পিডিএফ বই" path="/pdfs" />} />
          <Route path="p/:slug" element={<ProductDetail />} />
          <Route path="checkout/:slug" element={<Guard><Checkout /></Guard>} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="reset-password" element={<ResetRequest />} />
          <Route path="reset-password/update" element={<ResetUpdate />} />
          <Route path="account" element={<Guard><Profile /></Guard>} />
          <Route path="account/orders" element={<Guard><Orders /></Guard>} />
          <Route path="account/orders/:id" element={<Guard><OrderDetail /></Guard>} />
          <Route path="account/purchases" element={<Guard><Purchases /></Guard>} />
          <Route path="contact" element={<Contact />} />
          {['about', 'faq', 'privacy', 'terms', 'refund', 'shipping'].map((s) => <Route key={s} path={s} element={<CmsPage slug={s} />} />)}
          <Route path="admin/*" element={<Guard staff><Admin /></Guard>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
