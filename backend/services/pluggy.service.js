import { PluggyClient } from 'pluggy-sdk';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { normalizarCategoria, tipoGastoPadrao, categoriaInfo } from '../utils/categorias.js';
import { dataCaixaDaParcela } from '../utils/fatura.js';
import { aplicarRegras } from './regras.service.js';
import { httpError } from '../utils/http.js';

// Criado sob demanda: sem as chaves da Pluggy o servidor continua de pé
// (só o Open Finance fica indisponível), em vez de cair na inicialização.
let clientePluggy = null;
function pluggy() {
  if (!clientePluggy) {
    if (!process.env.PLUGGY_CLIENT_ID || !process.env.PLUGGY_CLIENT_SECRET) {
      throw httpError(503, 'O Open Finance não está configurado neste servidor.');
    }
    clientePluggy = new PluggyClient({
      clientId: process.env.PLUGGY_CLIENT_ID,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET,
    });
  }
  return clientePluggy;
}

const TAMANHO_LOTE = 200;

function dividirEmLotes(lista, tamanho = TAMANHO_LOTE) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

function paraDataIso(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Gera um Connect Token para o Pluggy Connect.
 *
 * SEGURANÇA: passamos clientUserId = userId do nosso usuário autenticado.
 * A Pluggy grava esse valor no "item" criado durante o Connect — é a
 * fonte de verdade INDEPENDENTE que usamos em vincularItemAoUsuario()
 * para provar que o itemId pertence a quem está tentando vinculá-lo.
 */
export async function criarConnectToken({ includeSandbox = false, userId, itemId } = {}) {
  if (!userId) throw httpError(400, 'userId é obrigatório para criar o Connect Token.');

  const webhookUrl = process.env.BACKEND_PUBLIC_URL
    ? `${process.env.BACKEND_PUBLIC_URL.replace(/\/+$/, '')}/api/webhooks/pluggy`
    : undefined;

  // Com itemId o Connect abre no modo "atualizar conexão" (ex.: senha do
  // banco mudou e o item entrou em erro de login).
  const data = await pluggy().createConnectToken(itemId, {
    includeSandbox,
    webhookUrl,
    clientUserId: userId,
  });
  return data.accessToken;
}

/**
 * Registra a relação item da Pluggy -> usuário, validando a posse de
 * DUAS formas independentes (proteção contra IDOR / sequestro de conta
 * bancária de outra pessoa):
 *   1) o clientUserId gravado no item pela própria Pluggy tem que ser o
 *      usuário da sessão;
 *   2) um item já vinculado a outro usuário nunca é "roubado".
 */
export async function vincularItemAoUsuario({ itemId, userId }) {
  const itemPluggy = await pluggy().fetchItem(itemId);

  if (!itemPluggy || itemPluggy.clientUserId !== userId) {
    console.warn(`⚠️ Tentativa de vincular item ${itemId} sem correspondência de clientUserId (usuário solicitante: ${userId}).`);
    throw httpError(403, 'Esta conexão bancária não pertence a este usuário.');
  }

  const { data: vinculoExistente } = await supabaseAdmin
    .from('open_finance_items')
    .select('user_id')
    .eq('item_id', itemId)
    .maybeSingle();

  if (vinculoExistente && vinculoExistente.user_id !== userId) {
    console.warn(`⚠️ Item ${itemId} já vinculado a outro usuário. Vinculação bloqueada.`);
    throw httpError(403, 'Esta conexão bancária já está vinculada a outra conta.');
  }

  const { error } = await supabaseAdmin
    .from('open_finance_items')
    .upsert(
      { item_id: itemId, user_id: userId, status: 'ATIVO', updated_at: new Date().toISOString() },
      { onConflict: 'item_id' }
    );

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
  return pluggy().fetchItem(itemId);
}

/** Lista as conexões bancárias do usuário, com o status atual na Pluggy. */
export async function listarItensDoUsuario(userId) {
  const { data, error } = await supabaseAdmin
    .from('open_finance_items')
    .select('item_id, status, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return Promise.all(
    (data || []).map(async (linha) => {
      try {
        const item = await pluggy().fetchItem(linha.item_id);
        return {
          itemId: linha.item_id,
          banco: item.connector?.name || 'Instituição',
          logo: item.connector?.imageUrl || null,
          status: item.status,
          statusDetalhe: item.executionStatus || null,
          ultimaAtualizacao: item.lastUpdatedAt || linha.updated_at,
          conectadoEm: linha.created_at,
          precisaReconectar: ['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT'].includes(item.status),
        };
      } catch {
        return {
          itemId: linha.item_id,
          banco: 'Instituição',
          logo: null,
          status: linha.status,
          statusDetalhe: null,
          ultimaAtualizacao: linha.updated_at,
          conectadoEm: linha.created_at,
          precisaReconectar: true,
        };
      }
    })
  );
}

/** Remove a conexão na Pluggy e o vínculo local (transações já importadas ficam). */
export async function removerItem({ itemId, userId }) {
  const dono = await buscarUserIdPorItemId(itemId);
  if (dono !== userId) throw httpError(404, 'Conexão bancária não encontrada.');

  try {
    await pluggy().deleteItem(itemId);
  } catch (err) {
    console.warn(`⚠️ Falha ao excluir item ${itemId} na Pluggy (seguindo com a remoção local):`, err.message);
  }

  const { error } = await supabaseAdmin.from('open_finance_items').delete().eq('item_id', itemId).eq('user_id', userId);
  if (error) throw error;
}

/**
 * Garante um registro em `cartoes` para cada conta de cartão de crédito
 * vinda do Open Finance. Os dias de fechamento/vencimento vêm da Pluggy
 * só na criação — se a pessoa (ou o planejador) corrigir depois na tela
 * de Cartões, a correção prevalece nas próximas sincronizações.
 */
async function garantirCartaoDaConta(userId, account) {
  const { data: existente } = await supabaseAdmin
    .from('cartoes')
    .select('id, dia_fechamento, dia_vencimento')
    .eq('user_id', userId)
    .eq('open_finance_account_id', account.id)
    .maybeSingle();
  if (existente) return existente;

  const fechamento = account.creditData?.balanceCloseDate ? new Date(account.creditData.balanceCloseDate) : null;
  const vencimento = account.creditData?.balanceDueDate ? new Date(account.creditData.balanceDueDate) : null;

  const { data: criado, error } = await supabaseAdmin
    .from('cartoes')
    .insert({
      user_id: userId,
      nome: account.marketingName || account.name || 'Cartão de crédito',
      bandeira: account.creditData?.brand || null,
      final: account.number ? String(account.number).slice(-4) : null,
      // Sem a informação da instituição, usamos um ciclo comum (fecha 25,
      // vence 5) — editável depois na tela de Cartões.
      dia_fechamento: fechamento ? fechamento.getUTCDate() : 25,
      dia_vencimento: vencimento ? vencimento.getUTCDate() : 5,
      limite: account.creditData?.creditLimit ?? null,
      open_finance_account_id: account.id,
    })
    .select('id, dia_fechamento, dia_vencimento')
    .single();

  if (error) {
    console.warn('⚠️ Não foi possível registrar o cartão do Open Finance (rode o schema_v4_oule.sql?):', error.message);
    return null;
  }
  return criado;
}

function montarLinha({ t, userId, account, cartao }) {
  // O sinal pela coluna `type` é confiável para conta e cartão: na
  // Pluggy, compras no cartão chegam com amount POSITIVO, o que antes
  // fazia toda compra de cartão virar "entrada".
  const absoluto = Math.abs(Number(t.amount) || 0);
  const valor = t.type === 'CREDIT' ? absoluto : -absoluto;

  const dataLancamento = paraDataIso(t.date) || new Date().toISOString().slice(0, 10);
  const meta = t.creditCardMetadata || {};
  const dataCompra = paraDataIso(meta.purchaseDate) || dataLancamento;
  const ehCartao = account.type === 'CREDIT';

  const categoria = normalizarCategoria(t.category, t.description, valor);
  const despesa = valor < 0 && categoriaInfo(categoria).grupo === 'despesa';

  return {
    user_id: userId,
    descricao: (t.description || t.descriptionRaw || 'Não informado').slice(0, 200),
    categoria,
    categoria_original: t.category || null,
    tipo_gasto: despesa ? tipoGastoPadrao(categoria) : null,
    valor,
    tipo: valor < 0 ? 'despesa' : 'receita',
    data_transacao: dataLancamento,
    data_competencia: dataCompra,
    data_caixa: ehCartao && cartao
      ? dataCaixaDaParcela({
          dataLancamento,
          dataCompra,
          parcelaAtual: meta.installmentNumber || 1,
          diaFechamento: cartao.dia_fechamento,
          diaVencimento: cartao.dia_vencimento,
        })
      : dataLancamento,
    conta_tipo: ehCartao ? 'cartao_credito' : 'conta',
    cartao_id: ehCartao && cartao ? cartao.id : null,
    parcela_atual: meta.installmentNumber || null,
    parcelas_total: meta.totalInstallments || null,
    open_finance_id: t.id,
    origem: 'open_finance',
  };
}

/**
 * Busca TODAS as transações de todas as contas de um item (paginado —
 * antes só a primeira página vinha) e grava com upsert:
 *   - lançamentos novos entram completos;
 *   - lançamentos já existentes têm valor/datas/descrição atualizados,
 *     mas a categoria e o tipo de gasto NÃO são sobrescritos — se a
 *     pessoa recategorizou uma compra, a correção dela é mantida.
 */
export async function sincronizarTransacoesDoItem(itemId, userId) {
  const accountsResponse = await pluggy().fetchAccounts(itemId);
  const accounts = accountsResponse.results || [];
  if (accounts.length === 0) return { count: 0, novas: 0, atualizadas: 0 };

  const linhas = [];
  for (const account of accounts) {
    const cartao = account.type === 'CREDIT' ? await garantirCartaoDaConta(userId, account) : null;
    const transacoes = await pluggy().fetchAllTransactions(account.id);
    for (const t of transacoes) {
      if (t.status === 'PENDING') continue; // ainda não lançada pelo banco
      linhas.push(montarLinha({ t, userId, account, cartao }));
    }
  }

  if (linhas.length === 0) return { count: 0, novas: 0, atualizadas: 0 };
  // Regras do cliente: novas entram classificadas; nas existentes só o
  // nome amigável é mantido (categoria/tipo não são sobrescritos abaixo).
  await aplicarRegras(userId, linhas);

  const existentes = new Set();
  for (const lote of dividirEmLotes(linhas.map((l) => l.open_finance_id))) {
    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .select('open_finance_id')
      .eq('user_id', userId)
      .in('open_finance_id', lote);
    if (error) throw error;
    for (const r of data || []) existentes.add(r.open_finance_id);
  }

  const novas = linhas.filter((l) => !existentes.has(l.open_finance_id));
  const atualizar = linhas
    .filter((l) => existentes.has(l.open_finance_id))
    .map(({ categoria, tipo_gasto, ...resto }) => ({ ...resto, updated_at: new Date().toISOString() }));

  for (const lote of dividirEmLotes(novas)) {
    const { error } = await supabaseAdmin.from('transacoes').insert(lote);
    if (error) throw error;
  }
  for (const lote of dividirEmLotes(atualizar)) {
    const { error } = await supabaseAdmin.from('transacoes').upsert(lote, { onConflict: 'user_id,open_finance_id' });
    if (error) throw error;
  }

  await supabaseAdmin
    .from('open_finance_items')
    .update({ status: 'ATIVO', updated_at: new Date().toISOString() })
    .eq('item_id', itemId);

  return { count: novas.length, novas: novas.length, atualizadas: atualizar.length };
}

export { pluggy };
