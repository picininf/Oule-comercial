import { PluggyClient } from 'pluggy-sdk';
import { supabaseAdmin } from '../config/supabaseAdmin.js';

const pluggyClient = new PluggyClient({
  clientId: process.env.PLUGGY_CLIENT_ID || '',
  clientSecret: process.env.PLUGGY_CLIENT_SECRET || '',
});

/**
 * Gera um Connect Token para o Pluggy Connect.
 *
 * IMPORTANTE (correção de segurança): passamos clientUserId = userId do
 * nosso próprio usuário autenticado. A Pluggy grava esse valor dentro do
 * "item" criado durante o Connect. Isso nos dá uma fonte de verdade
 * INDEPENDENTE do que o frontend nos manda depois — é o que usamos em
 * vincularItemAoUsuario() para provar que o itemId realmente pertence a
 * quem está tentando vinculá-lo, e não a qualquer pessoa que descubra
 * (ex.: em um log, print de tela, HAR file, suporte) o UUID do item.
 */
export async function criarConnectToken({ includeSandbox = false, userId } = {}) {
  if (!userId) {
    const err = new Error('userId é obrigatório para criar o Connect Token.');
    err.status = 400;
    throw err;
  }

  const webhookUrl = process.env.BACKEND_PUBLIC_URL
    ? `${process.env.BACKEND_PUBLIC_URL}/api/webhooks/pluggy`
    : undefined;

  const data = await pluggyClient.createConnectToken(undefined, {
    includeSandbox,
    webhookUrl,
    clientUserId: userId,
  });
  return data.accessToken;
}

/**
 * Registra, no nosso banco, a relação item da Pluggy -> usuário.
 *
 * CORREÇÃO DE SEGURANÇA (IDOR / Broken Object Level Authorization):
 * A versão anterior confiava cegamente no itemId enviado pela URL e
 * REATRIBUÍA a conexão bancária para quem quer que chamasse este
 * endpoint autenticado — bastava conhecer (vazamento de log, captura de
 * rede, engenharia social) o UUID do item de outro usuário para
 * sequestrar a conta bancária vinculada dele: as próximas sincronizações
 * (inclusive via webhook) passariam a gravar as transações do banco da
 * VÍTIMA na conta do ATACANTE, e o histórico antigo da vítima seria
 * apagado (ver sincronizarTransacoesDoItem).
 *
 * Agora validamos a posse do item de DUAS formas independentes antes de
 * gravar qualquer coisa:
 *   1) Perguntamos à própria Pluggy (fonte de verdade externa) qual é o
 *      clientUserId gravado no item — tem que bater com o userId da
 *      sessão autenticada que está chamando esta função.
 *   2) Se o item já estiver vinculado no NOSSO banco a um userId
 *      diferente, recusamos — nunca "roubamos" um item já vinculado.
 */
export async function vincularItemAoUsuario({ itemId, userId }) {
  const itemPluggy = await pluggyClient.fetchItem(itemId);

  if (!itemPluggy || itemPluggy.clientUserId !== userId) {
    console.warn(`⚠️ Tentativa de vincular item ${itemId} sem correspondência de clientUserId (usuário solicitante: ${userId}).`);
    const err = new Error('Este item não pertence a este usuário.');
    err.status = 403;
    throw err;
  }

  const { data: vinculoExistente } = await supabaseAdmin
    .from('open_finance_items')
    .select('user_id')
    .eq('item_id', itemId)
    .maybeSingle();

  if (vinculoExistente && vinculoExistente.user_id !== userId) {
    console.warn(`⚠️ Item ${itemId} já vinculado a outro usuário. Vinculação bloqueada.`);
    const err = new Error('Este item já está vinculado a outra conta.');
    err.status = 403;
    throw err;
  }

  const { error } = await supabaseAdmin
    .from('open_finance_items')
    .upsert({ item_id: itemId, user_id: userId, status: 'ATIVO' }, { onConflict: 'item_id' });

  if (error) throw error;
}

export async function buscarUserIdPorItemId(itemId) {
  const { data, error } = await supabaseAdmin
    .from('open_finance_items')
    .select('user_id')
    .eq('item_id', itemId)
    .maybeSingle();

  if (error) throw error;
  return data?.user_id || null;
}

export async function buscarItemAtualizado(itemId) {
  return pluggyClient.fetchItem(itemId);
}

export async function sincronizarTransacoesDoItem(itemId, userId) {
  const accountsResponse = await pluggyClient.fetchAccounts(itemId);
  const accounts = accountsResponse.results || [];
  if (accounts.length === 0) return { count: 0 };

  const apiKey = await pluggyClient.getApiKey();
  let todasTransacoes = [];

  for (const account of accounts) {
    const url = new URL('https://api.pluggy.ai/v2/transactions');
    url.searchParams.append('accountId', account.id);

    const pluggyRes = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-API-KEY': apiKey },
    });
    const pluggyData = await pluggyRes.json();
    if (pluggyRes.ok && pluggyData.results) {
      todasTransacoes.push(...pluggyData.results);
    }
  }

  if (todasTransacoes.length === 0) return { count: 0 };

  const transacoesParaInserir = todasTransacoes.map((t) => ({
    user_id: userId,
    descricao: t.description || 'Não informado',
    categoria: t.category || 'Outros',
    valor: t.amount,
    tipo: t.amount < 0 ? 'despesa' : 'receita',
    data_transacao: t.date ? new Date(t.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    open_finance_id: t.id,
  }));

  // Remove transações anteriores duplicadas com base no open_finance_id para evitar conflitos.
  // DEFESA EM PROFUNDIDADE: sempre filtra também por user_id. Mesmo que
  // vincularItemAoUsuario já garanta a posse correta do item (ver
  // correção acima), este filtro extra impede que um bug futuro em
  // qualquer outro caller consiga apagar a transação de um usuário ao
  // sincronizar o item de outro.
  for (const t of transacoesParaInserir) {
    if (t.open_finance_id) {
      await supabaseAdmin
        .from('transacoes')
        .delete()
        .eq('open_finance_id', t.open_finance_id)
        .eq('user_id', userId);
    }
  }

  const { error } = await supabaseAdmin
    .from('transacoes')
    .insert(transacoesParaInserir);

  if (error) throw error;
  return { count: transacoesParaInserir.length };
}

export { pluggyClient };