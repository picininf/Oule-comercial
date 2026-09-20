import { supabase } from './supabaseClient';

const DEFAULT_API_URL = import.meta.env.VITE_API_URL;
const OVERRIDE_KEY = 'gf_api_url_override';

/**
 * A URL do backend embutida no .env fica fixa dentro do APK a partir do
 * build (o Vite resolve VITE_API_URL em tempo de compilação). Como em
 * desenvolvimento essa URL costuma ser um túnel ngrok que muda toda vez
 * que ele é reiniciado, guardamos aqui um "override" gravável em tempo
 * de execução (tela Configurações) — assim dá pra apontar o app para uma
 * nova URL sem precisar recompilar/reinstalar o APK.
 */
export function getApiUrl() {
  return localStorage.getItem(OVERRIDE_KEY) || DEFAULT_API_URL || '';
}

export function setApiUrlOverride(url) {
  const limpa = (url || '').trim().replace(/\/+$/, '');
  if (limpa) {
    localStorage.setItem(OVERRIDE_KEY, limpa);
  } else {
    localStorage.removeItem(OVERRIDE_KEY);
  }
}

export function getDefaultApiUrl() {
  return DEFAULT_API_URL || '';
}

/**
 * Faz um GET em /health na URL informada (ou na URL ativa) para
 * confirmar que o backend está de pé e acessível a partir do celular.
 */
export async function testarConexaoApi(url = getApiUrl()) {
  // O backend expõe /health na raiz (fora do prefixo /api), então
  // removemos um eventual /api no final antes de montar a URL do teste.
  const base = url.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  const res = await fetch(`${base}/health`, {
    headers: { 'ngrok-skip-browser-warning': 'true' },
  });
  if (!res.ok) throw new Error(`Servidor respondeu com status ${res.status}`);
  return res.json();
}

/**
 * Wrapper de fetch para a nossa API. O token de acesso é lido sempre
 * da sessão atual do Supabase (nunca de uma cópia manual em
 * localStorage) — assim ele já vem renovado automaticamente e nunca
 * fica "preso" desatualizado.
 */
export async function fetchApi(endpoint, options = {}) {
  let { data: { session } } = await supabase.auth.getSession();

  // Defesa extra para o cenário de WebView (Android/Capacitor): se por
  // algum motivo a sessão local não trouxer um access_token válido (ex.:
  // corrida entre o lock de auth e a leitura do storage logo após o app
  // voltar do background), tenta uma renovação explícita antes de mandar
  // a requisição sem Authorization — isso evita 401 evitável quando a
  // pessoa já está logada.
  if (!session?.access_token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed?.session || session;
  }

  const token = session?.access_token;

  const headers = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${getApiUrl()}${endpoint}`, { ...options, headers });

  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const rawText = await res.text();
    console.error('⚠️ A API não retornou JSON:', rawText);
    throw new Error(`Erro no servidor (${res.status}).`);
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Erro no servidor (${res.status}).`);
  }
  return data;
}
