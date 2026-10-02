import crypto from 'crypto';

/**
 * Origens cujo sinal do campo `valor` é confiável (negativo = saída,
 * positivo = entrada). Para elas usamos o valor como veio: uma
 * transferência recebida ou um estorno continuam sendo entrada, mesmo
 * que a categoria não pareça "renda".
 */
const ORIGENS_SINAL_CONFIAVEL = new Set(['open_finance', 'extrato_manual', 'extrato_planilha', 'lancamento']);

/**
 * Valor com o sinal correto (negativo = saída, positivo = entrada).
 *
 * Lançamentos antigos (bot do WhatsApp e registros anteriores à coluna
 * `origem`) nem sempre garantem o sinal, então para eles o sinal é
 * deduzido pela categoria/descrição. Espelha frontend/src/lib/finance.js
 * — mantenha os dois em sincronia.
 */
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

/** Transferências entre contas da própria pessoa não são gasto nem renda. */
export function ehTransferencia(t) {
  return (t.categoria || '') === 'Transferências';
}

/**
 * Data que vale para o regime escolhido:
 * - competência: quando o gasto aconteceu (data da compra no cartão);
 * - caixa: quando o dinheiro saiu de fato (vencimento da fatura).
 * Registros anteriores às colunas novas caem em `data_transacao`.
 */
export function dataNoRegime(t, regime = 'competencia') {
  if (regime === 'caixa') return t.data_caixa || t.data_transacao;
  return t.data_competencia || t.data_transacao;
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

// ---------------------------------------------------------------------
// Datas (sempre como string AAAA-MM-DD / AAAA-MM, sem fuso horário, para
// não "pular" um dia quando o servidor roda em UTC).
// ---------------------------------------------------------------------

export function mesDe(dataIso) {
  return String(dataIso || '').slice(0, 7);
}

export function somarMeses(mes, quantidade) {
  const [ano, m] = mes.split('-').map(Number);
  const total = ano * 12 + (m - 1) + quantidade;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function diasNoMes(mes) {
  const [ano, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

/** Dia `dia` do mês, limitado ao último dia (ex.: dia 31 em fevereiro -> 28/29). */
export function dataNoMes(mes, dia) {
  return `${mes}-${String(Math.min(dia, diasNoMes(mes))).padStart(2, '0')}`;
}

/** Data de hoje no fuso de Brasília (AAAA-MM-DD). */
export function hojeBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function diferencaEmDias(deIso, ateIso) {
  const a = Date.parse(`${deIso}T00:00:00Z`);
  const b = Date.parse(`${ateIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function idadeEmAnos(dataNascimento, referenciaIso = hojeBrasil()) {
  if (!dataNascimento) return null;
  const [an, mn, dn] = String(dataNascimento).split('-').map(Number);
  const [ar, mr, dr] = referenciaIso.split('-').map(Number);
  let idade = ar - an;
  if (mr < mn || (mr === mn && dr < dn)) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

export function formatarMoeda(valor) {
  return `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
