/**
 * Roda UMA VEZ (ou sempre que a URL pública do backend mudar, ex: novo
 * link do ngrok) para registrar o endpoint de webhook na Pluggy,
 * incluindo o header de segredo que o backend valida em
 * routes/webhook.routes.js.
 *
 * Uso: npm run setup:webhook
 */
import 'dotenv/config';
import { PluggyClient } from 'pluggy-sdk';

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_WEBHOOK_SECRET, BACKEND_PUBLIC_URL } = process.env;

if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET || !PLUGGY_WEBHOOK_SECRET || !BACKEND_PUBLIC_URL) {
  console.error('❌ Preencha PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_WEBHOOK_SECRET e BACKEND_PUBLIC_URL no .env antes de rodar este script.');
  process.exit(1);
}

const pluggyClient = new PluggyClient({
  clientId: PLUGGY_CLIENT_ID,
  clientSecret: PLUGGY_CLIENT_SECRET,
});

async function main() {
  const apiKey = await pluggyClient.getApiKey();
  const url = `${BACKEND_PUBLIC_URL}/api/webhooks/pluggy`;

  const res = await fetch('https://api.pluggy.ai/webhooks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({
      url,
      event: 'all',
      headers: {
        // Esse é o header que routes/webhook.routes.js valida.
        Authorization: `Bearer ${PLUGGY_WEBHOOK_SECRET}`,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('❌ Erro ao registrar webhook na Pluggy:', data);
    process.exit(1);
  }

  console.log('✅ Webhook registrado com sucesso na Pluggy:');
  console.log(data);
  console.log(`\nApontando para: ${url}`);
  console.log('Lembre-se de rodar este script novamente sempre que a URL do ngrok mudar.');
}

main().catch((err) => {
  console.error('❌ Falha ao configurar webhook:', err);
  process.exit(1);
});
