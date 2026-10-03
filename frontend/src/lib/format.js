const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moedaCompacta = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

export const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const NOMES_MES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function formatarMoeda(valor) {
  return moeda.format(Number(valor) || 0);
}

export function formatarMoedaCompacta(valor) {
  return moedaCompacta.format(Number(valor) || 0);
}

/** "2026-03-05" -> "05/03/2026" sem passar por Date (evita erro de fuso). */
export function formatarData(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '—';
}

/** "2026-03" -> "Março/2026" (ou "Mar/26" no formato curto). */
export function formatarMes(mes, { curto = false } = {}) {
  if (!mes) return '';
  const [a, m] = mes.split('-').map(Number);
  return curto ? `${NOMES_MES_CURTO[m - 1]}/${String(a).slice(2)}` : `${NOMES_MES[m - 1]}/${a}`;
}

export function formatarPct(valor, casas = 1) {
  return `${(Number(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function mesAtual() {
  return hojeIso().slice(0, 7);
}

export function somarMeses(mes, quantidade) {
  const [ano, m] = mes.split('-').map(Number);
  const total = ano * 12 + (m - 1) + quantidade;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Monta "?a=1&b=2" ignorando valores vazios. */
export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Último dia válido do mês: "2026-02" -> "2026-02-28". */
export function ultimoDiaDoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
}
