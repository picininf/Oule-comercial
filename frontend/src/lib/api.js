import { supabase } from './supabaseClient';

const DEFAULT_API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const OVERRIDE_KEY = 'gf_api_url_override';
const TIMEOUT_MS = 60_000;

/**
 * A URL do backend embutida no .env fica fixa dentro do APK a partir do
 * build (o Vite resolve VITE_API_URL em tempo de compilação). O override
 * (tela Configurações → Avançado) permite apontar o app para outra URL
 * sem recompilar — útil em desenvolvimento com ngrok.
 */
export function getApiUrl() {
  try {
    return localStorage.getItem(OVERRIDE_KEY) || DEFAULT_API_URL;
  } catch {
    return DEFAULT_API_URL;
  }
}

export function setApiUrlOverride(url) {
  const limpa = (url || '').trim().replace(/\/+$/, '');
  if (limpa && !/^https?:\/\/[^\s]+$/i.test(limpa)) throw new Error('Informe uma URL começando com http:// ou https://');
  if (limpa) localStorage.setItem(OVERRIDE_KEY, limpa);
  else localStorage.removeItem(OVERRIDE_KEY);
}

export function getDefaultApiUrl() {
  return DEFAULT_API_URL;
}

/** GET /health para confirmar que o backend está acessível a partir do aparelho. */
export async function testarConexaoApi(url = getApiUrl()) {
  const base = url.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  const res = await fetch(`${base}/health`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
  if (!res.ok) throw new Error(`Servidor respondeu com status ${res.status}`);
  return res.json();
}

async function tokenAtual() {
  let { data: { session } } = await supabase.auth.getSession();
  // WebView do Android: logo após voltar do background a sessão pode vir
  // sem access_token; uma renovação explícita evita um 401 desnecessário.
  if (!session?.access_token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed?.session || session;
  }
  return session?.access_token || null;
}

async function requisitar(endpoint, { body, headers = {}, ...opcoes } = {}) {
  const token = await tokenAtual();
  const ehFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${getApiUrl()}${endpoint}`, {
      ...opcoes,
      body,
      signal: controle.signal,
      headers: {
        ...(ehFormData ? {} : { 'Content-Type': 'application/json' }),
        'ngrok-skip-browser-warning': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (err) {
    throw new Error(err.name === 'AbortError'
      ? 'O servidor demorou demais para responder. Tente novamente.'
      : 'Não foi possível falar com o servidor. Verifique sua conexão.');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    if (res.status === 401) {
      // Sessão expirada no servidor: força novo login em vez de deixar a
      // tela "meio logada" mostrando erros.
      supabase.auth.signOut().catch(() => {});
    }
    const err = new Error(data?.error || `Erro no servidor (${res.status}).`);
    err.status = res.status;
    err.requestId = data?.requestId;
    throw err;
  }
  return data;
}

/** Mantido com a assinatura antiga (body já em JSON string). */
export function fetchApi(endpoint, options = {}) {
  return requisitar(endpoint, options);
}

/** Envio multipart (upload de extrato). */
export function uploadApi(endpoint, formData) {
  return requisitar(endpoint, { method: 'POST', body: formData });
}

export const api = {
  get: (url) => requisitar(url),
  post: (url, corpo) => requisitar(url, { method: 'POST', body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
  put: (url, corpo) => requisitar(url, { method: 'PUT', body: JSON.stringify(corpo) }),
  patch: (url, corpo) => requisitar(url, { method: 'PATCH', body: JSON.stringify(corpo) }),
  delete: (url) => requisitar(url, { method: 'DELETE' }),
};
