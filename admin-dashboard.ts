import { z } from 'zod';
import { route, requireStaff } from './_lib/handler';
import { admin } from './_lib/supabase';

// Money totals come ONLY from approved payments; refunds and pending are reported separately.
export const handler = route(z.object({}).strict(), async ({ user }) => {
  await requireStaff(user, ['product_order_manager', 'payment_verifier']);
  const { data: s } = await admin.from('site_settings').select('value').eq('key', 'support').single();
  const waitMin = Number((s?.value as any)?.waiting_minutes ?? 60);
  const cutoff = new Date(Date.now() - waitMin * 60_000).toISOString();

  const count = async (q: any) => (await q).count ?? 0;
  const [totalOrders, pending, overdue, approved, refunded, items, books, recent] = await Promise.all([
    count(admin.from('orders').select('id', { count: 'exact', head: true })),
    count(admin.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending_verification')),
    count(admin.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending_verification').lt('submitted_at', cutoff)),
    admin.from('orders').select('total').eq('payment_status', 'payment_approved'),
    admin.from('orders').select('total').eq('payment_status', 'refunded'),
    admin.from('order_items').select('product_type, line_total, orders!inner(payment_status)').eq('orders.payment_status', 'payment_approved'),
    admin.from('book_details').select('product_id, stock_quantity, low_stock_threshold, products(title)'),
    admin.from('audit_logs').select('action, entity, created_at').order('created_at', { ascending: false }).limit(10),
  ]);
  const sum = (rows: any[] | null) => (rows ?? []).reduce((a, r) => a + Number(r.total ?? r.line_total), 0);
  const byType: Record<string, number> = {};
  for (const r of (items.data ?? []) as any[]) byType[r.product_type] = (byType[r.product_type] ?? 0) + Number(r.line_total);
  const delivered = await count(admin.from('orders').select('id', { count: 'exact', head: true }).eq('fulfillment_status', 'delivered'));
  return {
    total_orders: totalOrders, pending_payments: pending, overdue_pending: overdue, waiting_minutes: waitMin,
    gross_approved_sales: sum(approved.data), refunded_total: sum(refunded.data), delivered_orders: delivered,
    sales_by_type: byType,
    low_stock: ((books.data ?? []) as any[]).filter((b) => b.stock_quantity <= b.low_stock_threshold)
      .map((b) => ({ product_id: b.product_id, title: b.products?.title, stock: b.stock_quantity })),
    recent_activity: recent.data ?? [],
  };
});
