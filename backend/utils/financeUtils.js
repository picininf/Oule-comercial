/**
 * Corrige o sinal de uma transação com base na categoria/estabelecimento.
 * Necessário porque nem toda origem de dado (ex.: lançamentos via bot do
 * WhatsApp) garante o sinal correto no campo `valor`. Espelha
 * frontend/src/lib/finance.js — mantenha os dois em sincronia.
 */
export function getValorAjustado(t) {
  const cat = (t.categoria || '').toLowerCase();
  const est = (t.estabelecimento || '').toLowerCase();
  const isEntrada =
    cat.includes('salário') || cat.includes('salario') || cat.includes('salary') ||
    cat.includes('renda') || cat.includes('receita') || cat.includes('investimento') ||
    cat.includes('cashback') || cat.includes('reembolso') ||
    est.includes('salário') || est.includes('salario') || est.includes('salary');

  const rawVal = Number(t.valor) || 0;
  if (isEntrada) return Math.abs(rawVal);
  return rawVal < 0 ? rawVal : -rawVal;
}
