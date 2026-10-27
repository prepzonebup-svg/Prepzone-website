import { createClient } from '@supabase/supabase-js';
// Anon key only. All privileged work happens in Netlify Functions.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
export const coverUrl = (path?: string | null) => (path ? supabase.storage.from('product-covers').getPublicUrl(path).data.publicUrl : null);
