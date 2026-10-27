const nf = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 0 });
export const taka = (n: number | string) => `৳${nf.format(Number(n))}`;
export const bnNum = (n: number) => nf.format(n);
export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' }).format(new Date(iso));
export const fmtDate = (iso: string) => new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeZone: 'Asia/Dhaka' }).format(new Date(iso));

export const TYPE_LABEL: Record<string, string> = { course: 'কোর্স', exam_batch: 'এক্সাম ব্যাচ', printed_book: 'ছাপা বই', pdf_book: 'পিডিএফ বই' };
export const TYPE_PATH: Record<string, string> = { course: '/courses', exam_batch: '/exam-batches', printed_book: '/books', pdf_book: '/pdfs' };
export const PAY_LABEL: Record<string, string> = {
  awaiting_payment: 'পেমেন্টের অপেক্ষায়', pending_verification: 'যাচাই চলছে', payment_approved: 'পেমেন্ট অনুমোদিত',
  payment_rejected: 'পেমেন্ট বাতিল', refunded: 'রিফান্ড হয়েছে',
};
export const FUL_LABEL: Record<string, string> = { not_applicable: '—', processing: 'প্রস্তুত হচ্ছে', shipped: 'পাঠানো হয়েছে', delivered: 'ডেলিভারি সম্পন্ন', cancelled: 'অর্ডার বাতিল' };

/** WhatsApp click-to-chat with an encoded, prefilled message. Returns null if no number is configured. */
export function whatsappLink(number: string | undefined, template: string, vars: Record<string, string>) {
  let d = (number ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('01')) d = '88' + d; // local BD format → international
  const text = template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
