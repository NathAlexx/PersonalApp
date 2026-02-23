import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Não persistir sessão no localStorage: evita armazenar tokens no navegador
    persistSession: false,
    // Sem auto refresh quando não persistimos sessão
    autoRefreshToken: false,
    detectSessionInUrl: true
  }
});
