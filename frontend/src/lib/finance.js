/**
 * Valor com o sinal correto (negativo = saída, positivo = entrada).
 * Espelha backend/utils/financeUtils.js — mantenha os dois em sincronia.
 *
 * Origens novas (Open Finance, extrato, planilha, lançamento manual, bot)
 * já gravam o sinal certo. Só registros antigos precisam da dedução pela
 * categoria/descrição.
 */
const ORIGENS_SINAL_CONFIAVEL = new Set(['open_finance', 'extrato_manual', 'extrato_planilha', 'lancamento', 'whatsapp']);

export function getValorAjustado(t) {
  const rawVal = Number(t.valor) || 0;
  if (t.open_finance_id || ORIGENS_SINAL_CONFIAVEL.has(t.origem)) return rawVal;

  const cat = (t.categoria || '').toLowerCase();
  const est = (t.descricao || t.estabelecimento || '').toLowerCase();
  const isEntrada =
    cat.includes('salário') || cat.includes('salario') || cat.includes('salary') ||
    cat.includes('renda') || cat.includes('receita') || cat.includes('rendimento') ||
    cat.includes('cashback') || cat.includes('reembolso') ||
    est.includes('salário') || est.includes('salario') || est.includes('salary');

  if (isEntrada) return Math.abs(rawVal);
  return rawVal < 0 ? rawVal : -rawVal;
}

/** Transferência entre contas próprias / pagamento de fatura: nem gasto nem renda. */
export function ehTransferencia(t) {
  return t.categoria === 'Transferências';
}

export function dataNoRegime(t, regime = 'competencia') {
  return regime === 'caixa' ? t.data_caixa || t.data_transacao : t.data_competencia || t.data_transacao;
}

export const ORIGENS = {
  open_finance: { nome: 'Banco (Open Finance)', classe: 'tag-bank' },
  extrato_manual: { nome: 'Extrato (IA)', classe: 'tag-extrato' },
  extrato_planilha: { nome: 'Planilha', classe: 'tag-extrato' },
  lancamento: { nome: 'Manual', classe: 'tag-manual' },
  whatsapp: { nome: 'WhatsApp IA', classe: 'tag-wa' },
  manual: { nome: 'Registro antigo', classe: 'tag-manual' },
};

export function origemDe(t) {
  if (t.open_finance_id) return ORIGENS.open_finance;
  if (t.image_url && (!t.origem || t.origem === 'manual')) return ORIGENS.whatsapp;
  return ORIGENS[t.origem] || ORIGENS.manual;
}

/** Totais de uma lista de transações, ignorando transferências. */
export function resumir(transacoes) {
  let entradas = 0;
  let saidas = 0;
  const porCategoria = {};
  const porTipoGasto = {};
  for (const t of transacoes) {
    if (ehTransferencia(t)) continue;
    const v = getValorAjustado(t);
    if (v > 0) entradas += v;
    else if (v < 0) {
      saidas += -v;
      const cat = t.categoria || 'Outros';
      porCategoria[cat] = (porCategoria[cat] || 0) + -v;
      const tipo = t.tipo_gasto || 'nao_classificado';
      porTipoGasto[tipo] = (porTipoGasto[tipo] || 0) + -v;
    }
  }
  return {
    entradas,
    saidas,
    saldo: entradas - saidas,
    taxaPoupanca: entradas > 0 ? ((entradas - saidas) / entradas) * 100 : 0,
    porCategoria,
    porTipoGasto,
  };
}
