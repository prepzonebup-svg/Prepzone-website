import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

type S = Record<string, any>;
const Ctx = createContext<S>({});
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [s, setS] = useState<S>({});
  useEffect(() => { // RLS decides which keys this visitor may see (payment numbers need a login)
    supabase.from('site_settings').select('key, value').then(({ data }) =>
      setS(Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))));
  }, [user?.id]);
  return <Ctx.Provider value={s}>{children}</Ctx.Provider>;
}
