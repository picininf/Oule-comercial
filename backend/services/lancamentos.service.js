import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { normalizarCategoria, ehCategoriaValida, tipoGastoPadrao, categoriaInfo } from '../utils/categorias.js';
import { gerarParcelas, calcularFatura } from '../utils/fatura.js';
import { httpError } from '../utils/http.js';

/**
 * Ponto único de criação de lançamentos. Toda transação que entra no
 * sistema por aqui (extrato, planilha, lançamento manual, conta paga)
 * sai com: categoria Oule, tipo de gasto, data de competência e data de
 * caixa — esta última calculada pela fatura do cartão quando houver um.
 */

export async function carregarCartao(userId, cartaoId) {
  if (!cartaoId) return null;
  const { data, error } = await supabaseAdmin
    .from('cartoes')
    .select('id, nome, dia_fechamento, dia_vencimento, ativo')
    .eq('id', cartaoId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Cartão não encontrado para este cliente.');
  return data;
}

function categoriaFinal(categoria, descricao, valor) {
  return ehCategoriaValida(categoria) ? categoria : normalizarCategoria(categoria, descricao, valor);
}

function tipoGastoFinal(tipoGasto, categoria, valor) {
  if (valor >= 0 || categoriaInfo(categoria).grupo !== 'despesa') return null;
  return tipoGasto || tipoGastoPadrao(categoria);
}

/**
 * Monta a(s) linha(s) de `transacoes` de um lançamento. Compra no cartão
 * parcelada vira N linhas (uma por parcela), todas com a mesma
 * competência (dia da compra) e caixas diferentes (vencimento de cada
 * fatura), agrupadas pelo mesmo `compra_id`.
 *
 * @param {Object} l
 * @param {string} l.data - AAAA-MM-DD (dia da compra / do lançamento)
 * @param {number} l.valor - negativo = saída, positivo = entrada. Em
 *   compra parcelada, é o valor TOTAL da compra.
 */
export function montarLinhas({
  userId, data, descricao, valor, categoria, categoriaOriginal = null, tipoGasto = null,
  origem, cartao = null, parcelas = 1, metodoPagamento = null, observacao = null, extra = {},
}) {
  const cat = categoriaFinal(categoria, descricao, valor);
  const base = {
    user_id: userId,
    descricao: String(descricao || 'Lançamento').slice(0, 200),
    categoria: cat,
    categoria_original: categoriaOriginal,
    tipo_gasto: tipoGastoFinal(tipoGasto, cat, valor),
    tipo: valor < 0 ? 'despesa' : 'receita',
    origem,
    metodo_pagamento: metodoPagamento,
    observacao,
    ...extra,
  };

  // Sem cartão (ou entrada/estorno): competência = caixa = data.
  if (!cartao || valor >= 0) {
    return [{
      ...base,
      valor,
      data_transacao: data,
      data_competencia: data,
      data_caixa: data,
      conta_tipo: cartao ? 'cartao_credito' : 'conta',
      cartao_id: cartao?.id || null,
    }];
  }

  const compraId = parcelas > 1 ? crypto.randomUUID() : null;
  return gerarParcelas({
    dataCompra: data,
    valorTotal: Math.abs(valor),
    parcelas,
    diaFechamento: cartao.dia_fechamento,
    diaVencimento: cartao.dia_vencimento,
  }).map((p) => ({
    ...base,
    descricao: parcelas > 1 ? `${base.descricao} (${p.parcela}/${parcelas})`.slice(0, 200) : base.descricao,
    valor: -p.valor,
    data_transacao: p.dataCompetencia,
    data_competencia: p.dataCompetencia,
    data_caixa: p.dataCaixa,
    conta_tipo: 'cartao_credito',
    cartao_id: cartao.id,
    parcela_atual: parcelas > 1 ? p.parcela : null,
    parcelas_total: parcelas > 1 ? parcelas : null,
    compra_id: compraId,
  }));
}

/** Recalcula a data de caixa de lançamentos já gravados quando o cartão muda de ciclo. */
export async function recalcularCaixaDoCartao(userId, cartao) {
  const { data, error } = await supabaseAdmin
    .from('transacoes')
    .select('id, data_competencia, data_transacao, parcela_atual, compra_id, open_finance_id, valor')
    .eq('user_id', userId)
    .eq('cartao_id', cartao.id);
  if (error) throw error;

  let atualizados = 0;
  for (const t of data || []) {
    if (Number(t.valor) >= 0) continue;
    const dataCompra = t.data_competencia || t.data_transacao;
    // Parcelas criadas aqui (compra_id) deslocam pela parcela; as do Open
    // Finance já vêm com a data do lançamento na fatura certa.
    const parcela = t.compra_id && t.parcela_atual ? t.parcela_atual : 1;
    const base = t.open_finance_id ? t.data_transacao : dataCompra;
    const { dataVencimento } = calcularFatura({
      dataCompra: base,
      diaFechamento: cartao.dia_fechamento,
      diaVencimento: cartao.dia_vencimento,
      parcela,
    });
    const { error: erroUpd } = await supabaseAdmin.from('transacoes').update({ data_caixa: dataVencimento }).eq('id', t.id);
    if (erroUpd) throw erroUpd;
    atualizados += 1;
  }
  return atualizados;
}
