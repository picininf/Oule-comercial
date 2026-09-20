import { Router } from 'express';
import crypto from 'crypto';
import { webhookLimiter } from '../middleware/rateLimit.js';
import { validateBody, pluggyWebhookSchema } from '../validators/schemas.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import {
  buscarItemAtualizado,
  buscarUserIdPorItemId,
  sincronizarTransacoesDoItem,
} from '../services/pluggy.service.js';

const router = Router();

// IP oficial informado pela Pluggy na documentação de webhooks
// (https://docs.pluggy.ai/docs/webhooks). Use como camada extra de
// defesa, não como única proteção — funciona bem se seu backend estiver
// atrás de um proxy que preserva o IP real do cliente.
const PLUGGY_IPS = new Set(['52.67.145.81']);

/**
 * IMPORTANTE sobre segurança de webhooks da Pluggy:
 * A Pluggy NÃO assina o payload com HMAC. A proteção recomendada por eles
 * é: (1) você define headers customizados (ex.: Authorization) na hora de
 * criar o Webhook via API — ver scripts/setup-pluggy-webhook.js — e valida
 * esse header aqui; (2) opcionalmente, whitelist de IP; (3) nunca confiar
 * cegamente no corpo do webhook — sempre buscar o dado real via GET
 * /items/{id} antes de agir.
 */
function segredoValido(req) {
  const recebido = req.headers['authorization'] || '';
  const esperado = `Bearer ${process.env.PLUGGY_WEBHOOK_SECRET || ''}`;

  if (!process.env.PLUGGY_WEBHOOK_SECRET) return false;

  // comparação em tempo constante evita timing attacks
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post('/pluggy', webhookLimiter, validateBody(pluggyWebhookSchema), async (req, res) => {
  // 1) Autenticação por segredo compartilhado (header customizado)
  if (!segredoValido(req)) {
    console.warn('⚠️ Webhook Pluggy recebido com segredo inválido. Descartando.');
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  // 2) Defesa extra: confere IP de origem quando disponível
  const ipOrigem = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  if (ipOrigem && !PLUGGY_IPS.has(ipOrigem)) {
    console.warn(`⚠️ Webhook Pluggy de IP fora da whitelist: ${ipOrigem}. Prosseguindo com cautela (log apenas).`);
    // Não bloqueamos automaticamente aqui porque em muitos setups de
    // ngrok/reverse proxy o IP real do cliente pode não chegar de forma
    // confiável. O segredo compartilhado acima é a proteção primária.
  }

  const { event, eventId, itemId } = req.body;

  // 3) Idempotência: a Pluggy pode reenviar o mesmo evento (retry).
  // Gravamos o eventId processado para nunca duplicar transações.
  const { error: dupError } = await supabaseAdmin
    .from('webhook_events')
    .insert({ event_id: eventId, event_type: event, item_id: itemId || null });

  if (dupError) {
    // violação de unique constraint = evento já processado antes
    if (dupError.code === '23505') {
      return res.status(200).json({ ok: true, deduplicated: true });
    }
    console.error('Erro ao registrar evento de webhook:', dupError.message);
  }

  // 4) Responde 2XX imediatamente (regra da Pluggy: até 10s) e processa
  // o restante depois, sem bloquear a resposta.
  res.status(200).json({ ok: true });

  processarEventoAssincrono(event, itemId).catch((err) => {
    console.error(`❌ Erro ao processar evento ${event} (item ${itemId}):`, err);
  });
});

async function processarEventoAssincrono(event, itemId) {
  if (!itemId) return;

  if (['item/updated', 'item/login_succeeded'].includes(event)) {
    // Nunca confiamos no payload puro: buscamos o item fresco na Pluggy.
    const itemAtual = await buscarItemAtualizado(itemId);
    if (itemAtual.status !== 'UPDATED' && itemAtual.status !== 'OUTDATED') {
      console.log(`ℹ️ Item ${itemId} com status ${itemAtual.status}, aguardando próxima notificação.`);
      return;
    }

    const userId = await buscarUserIdPorItemId(itemId);
    if (!userId) {
      console.warn(`⚠️ Webhook para item ${itemId} sem usuário vinculado no nosso banco.`);
      return;
    }

    const resultado = await sincronizarTransacoesDoItem(itemId, userId);
    console.log(`✅ Sincronizado item ${itemId} (usuário ${userId}): ${resultado.count} transações.`);
    return;
  }

  if (event === 'transactions/created' || event === 'transactions/updated') {
    const userId = await buscarUserIdPorItemId(itemId);
    if (!userId) return;
    await sincronizarTransacoesDoItem(itemId, userId);
    return;
  }

  if (event === 'item/error') {
    const userId = await buscarUserIdPorItemId(itemId);
    if (userId) {
      await supabaseAdmin
        .from('open_finance_items')
        .update({ status: 'ERRO' })
        .eq('item_id', itemId);
      console.warn(`⚠️ Item ${itemId} do usuário ${userId} entrou em erro.`);
    }
    return;
  }

  // outros eventos (payment_*, smart_transfer_*, connector/status_updated)
  // podem ser tratados aqui conforme o app evoluir.
}

export default router;
