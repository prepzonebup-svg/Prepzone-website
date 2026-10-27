import { supabase } from './supabase';
export class ApiError extends Error { constructor(public code: string, message: string) { super(message); } }

export async function api<T = unknown>(name: string, body: unknown = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new ApiError(json?.error ?? 'server_error', json?.message ?? 'কিছু ভুল হয়েছে। আবার চেষ্টা করুন।');
  return json.data as T;
}
