/**
 * Corrige o sinal de uma transação com base na categoria/estabelecimento.
 * Necessário porque nem toda origem de dado (ex.: lançamentos via bot do
 * WhatsApp) garante o sinal correto no campo `valor`. Usado tanto no
 * dashboard do usuário comum quanto nas telas do admin, para que os
 * números sempre batam entre as duas visões.
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
