import crypto from 'crypto';

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

/**
 * Gera uma "impressão digital" estável para um lançamento vindo de um
 * extrato importado (data + descrição + valor, sempre do mesmo usuário).
 * Usada para não duplicar transações quando a pessoa reenvia o mesmo
 * extrato por engano, ou quando dois meses se sobrepõem parcialmente.
 * Não é criptográfico — é só deduplicação, por isso sha1 é suficiente.
 */
export function gerarHashExtrato({ userId, data, descricao, valor }) {
  const base = [
    userId,
    data,
    String(descricao || '').trim().toLowerCase(),
    Number(valor).toFixed(2),
  ].join('|');
  return crypto.createHash('sha1').update(base).digest('hex');
}
