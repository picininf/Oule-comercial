/**
 * "Minhas regras" no navegador — espelho de backend/services/regras.service.js
 * (sugestão do trecho e casamento). Mantenha os dois em sincronia.
 */

export const SENTIDOS = [
  { id: 'saida', nome: 'Saídas' },
  { id: 'entrada', nome: 'Entradas' },
  { id: 'ambos', nome: 'Ambos' },
];

export function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const PREFIXO_GENERICO = /^(transferencia|pix|ted|doc|compra|pagamento|pagto|pgto|debito|credito|envio|recebimento|boleto)\b/;
const TRECHO_TECNICO = /•|\*{2,}|agencia|conta:|\(\d{3,4}\)|^\d{2,3}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^[\d.\-/\s]+$/;

/**
 * Trecho estável de uma descrição de banco (normalmente o nome de quem
 * recebeu). "Transferência enviada pelo Pix - Pedro Veiga - •••.007..." -> "Pedro Veiga"
 */
export function sugerirPadrao(descricao) {
  const original = String(descricao || '').trim();
  const partes = original.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  const candidatas = partes.filter((p, i) => {
    const n = normalizarTexto(p);
    if (TRECHO_TECNICO.test(n) || TRECHO_TECNICO.test(p)) return false;
    if (i === 0 && partes.length > 1 && PREFIXO_GENERICO.test(n)) return false;
    return true;
  });
  return (candidatas[0] || original)
    .replace(/^\d{2}\.\d{3}\.\d{3}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function regraCasa(regra, descricao, valor) {
  if (!regra || regra.ativo === false) return false;
  const v = Number(valor) || 0;
  if (regra.sentido === 'saida' && v >= 0) return false;
  if (regra.sentido === 'entrada' && v <= 0) return false;
  const padrao = normalizarTexto(regra.padrao);
  return padrao.length >= 2 && normalizarTexto(descricao).includes(padrao);
}

/** Descrição do banco (antes de uma regra renomear o lançamento). */
export function descricaoDoBanco(t) {
  return t.descricao_original || t.descricao || '';
}
