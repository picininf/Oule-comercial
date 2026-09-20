import { createClient, processLock } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configurados no .env do frontend.');
}

// Adaptador de storage nativo para o Capacitor
const CapacitorStorage = {
  getItem: async (key) => {
    const { value } = await Preferences.get({ key });
    return value;
  },
  setItem: async (key, value) => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key) => {
    await Preferences.remove({ key });
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: CapacitorStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Por padrão o supabase-js usa a Web Locks API (navigator.locks) para
    // coordenar leitura/renovação da sessão. Dentro da WebView do
    // Android (Capacitor) esse lock pode falhar/travar de forma
    // intermitente, fazendo getSession() voltar sem token válido mesmo
    // com o usuário logado — causando 401 aleatório só no app, nunca no
    // navegador do PC. `processLock` é a implementação que o próprio
    // Supabase recomenda para apps nativos/WebView, sem depender dessa API.
    lock: processLock,
  },
});