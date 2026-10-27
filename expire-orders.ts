import type { Config } from '@netlify/functions';
import { admin } from './_lib/supabase';

// Scheduled (hourly). Cancels unpaid orders older than the configured hold time and returns their book stock.
export default async () => {
  const { data } = await admin.from('site_settings').select('value').eq('key', 'orders').maybeSingle();
  const hours = Math.min(720, Math.max(1, Number((data?.value as any)?.hold_hours ?? 48)));
  const { data: n, error } = await admin.rpc('expire_unpaid_orders', { p_hours: hours });
  if (error) { console.error('expire_orders_failed', error.code); return new Response('error', { status: 500 }); }
  console.log('expired_orders', n);
  return new Response('ok');
};
export const config: Config = { schedule: '@hourly' };
