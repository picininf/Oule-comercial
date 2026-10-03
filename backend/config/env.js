/**
 * Conferência das variáveis de ambiente na subida do servidor. Falha
 * cedo (e com mensagem clara) em vez de quebrar no meio de uma
 * requisição de cliente.
 */
const OBRIGATORIAS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ALLOWED_ORIGINS'];

const RECOMENDADAS = {
  ADMIN_EMAIL: 'sem ela nenhuma conta vira administrador automaticamente',
  GEMINI_API_KEY: 'leitura de comprovantes/extratos em PDF ou foto ficará indisponível',
  PLUGGY_CLIENT_ID: 'Open Finance ficará indisponível',
  PLUGGY_CLIENT_SECRET: 'Open Finance ficará indisponível',
  PLUGGY_WEBHOOK_SECRET: 'webhooks da Pluggy serão recusados',
};

export function validarAmbiente() {
  const faltando = OBRIGATORIAS.filter((nome) => !String(process.env[nome] || '').trim());
  if (faltando.length > 0) {
    console.error(`❌ Variáveis obrigatórias ausentes no .env: ${faltando.join(', ')}. Veja backend/.env.example.`);
    process.exit(1);
  }

  for (const [nome, impacto] of Object.entries(RECOMENDADAS)) {
    if (!String(process.env[nome] || '').trim()) {
      console.warn(`⚠️ ${nome} não definida — ${impacto}.`);
    }
  }

  if (process.env.NODE_ENV === 'production') {
    const origens = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    const inseguras = origens.filter((o) => o.startsWith('http://') && !o.includes('localhost'));
    if (inseguras.length > 0) {
      console.warn(`⚠️ Origens sem HTTPS liberadas em produção: ${inseguras.join(', ')}`);
    }
  }
}

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
