import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Loading } from './ui';

export default function Guard({ children, staff }: { children: JSX.Element; staff?: boolean }) {
  const { user, roles, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (staff && roles.length === 0) return <Navigate to="/" replace />; // UI hint; server enforces real access
  return children;
}
