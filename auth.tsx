import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type Ctx = { user: User | null; session: Session | null; roles: string[]; loading: boolean };
const AuthCtx = createContext<Ctx>({ user: null, session: null, roles: [], loading: true });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { // UI hint only; every admin action is re-checked on the server
    if (!session) { setRoles([]); return; }
    supabase.from('admin_roles').select('role').eq('user_id', session.user.id).then(({ data }) => setRoles((data ?? []).map((r) => r.role)));
  }, [session?.user.id]);

  return <AuthCtx.Provider value={{ user: session?.user ?? null, session, roles, loading }}>{children}</AuthCtx.Provider>;
}
