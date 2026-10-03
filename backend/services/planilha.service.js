import * as XLSX from 'xlsx';
import { semAcento } from '../utils/categorias.js';

/**
 * Leitura de extratos/faturas em planilha (CSV, XLS, XLSX) e OFX.
 *
 * Diferente do PDF/foto (que precisa de IA), esses formatos são
 * estruturados: lemos as colunas direto, sem custo de IA e sem risco de
 * "alucinação". Cada banco exporta com um layout diferente, então
 * detectamos as colunas pelo cabeçalho (Data, Descrição/Histórico,
 * Valor ou Débito/Crédito...) e, se não houver cabeçalho, pelo conteúdo.
 */

export const EXTENSOES_PLANILHA = ['csv', 'xls', 'xlsx', 'ofx', 'txt'];

export function ehPlanilha(nomeArquivo = '', mimeType = '') {
  const ext = String(nomeArquivo).toLowerCase().split('.').pop();
  if (EXTENSOES_PLANILHA.includes(ext)) return true;
  return /csv|excel|spreadsheet|ofx|text\/plain/.test(mimeType);
}

// ---------------------------------------------------------------------
// Conversões de valores e datas no padrão brasileiro (e internacional)
// ---------------------------------------------------------------------

export function parseValor(bruto) {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null;
  let s = String(bruto ?? '').trim();
  if (!s) return null;

  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  // Sufixo de débito/crédito usado por vários bancos: "150,00 D" / "150,00 C"
  const sufixo = s.match(/\s*([DC])$/i);
  if (sufixo) { if (sufixo[1].toUpperCase() === 'D') negativo = true; s = s.slice(0, -sufixo[0].length); }
  if (s.includes('-')) negativo = true;

  s = s.replace(/[R$\s+\-]/g, '').replace(/[^\d.,]/g, '');
  if (!s) return null;

  const ultimaVirgula = s.lastIndexOf(',');
  const ultimoPonto = s.lastIndexOf('.');
  if (ultimaVirgula > ultimoPonto) {
    s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  } else if (ultimoPonto > ultimaVirgula) {
    s = s.replace(/,/g, ''); // 1,234.56
  }

  const numero = Number(s);
  if (!Number.isFinite(numero)) return null;
  return negativo ? -Math.abs(numero) : numero;
}

function anoQuatroDigitos(ano) {
  const n = Number(ano);
  return n < 100 ? 2000 + n : n;
}

function dataValida(ano, mes, dia) {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 1990 || ano > 2100) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1) return null;
  return d.toISOString().slice(0, 10);
}

export function parseData(bruto, anoPadrao = new Date().getFullYear()) {
  if (bruto instanceof Date && !Number.isNaN(bruto.getTime())) {
    return dataValida(bruto.getFullYear(), bruto.getMonth() + 1, bruto.getDate());
  }
  if (typeof bruto === 'number' && bruto > 20000 && bruto < 80000) {
    // Número de série de data do Excel.
    const d = XLSX.SSF.parse_date_code(bruto);
    return d ? dataValida(d.y, d.m, d.d) : null;
  }
  const s = String(bruto ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return dataValida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) return dataValida(anoQuatroDigitos(m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})$/); // "15/03" (fatura sem ano)
  if (m) return dataValida(anoPadrao, +m[2], +m[1]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/); // OFX: 20240315120000
  if (m) return dataValida(+m[1], +m[2], +m[3]);
  return null;
}

// ---------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------

function detectarSeparador(texto) {
  const amostra = texto.split(/\r?\n/).slice(0, 15).join('\n');
  const contagem = { ';': 0, ',': 0, '\t': 0, '|': 0 };
  let dentroDeAspas = false;
  for (const ch of amostra) {
    if (ch === '"') dentroDeAspas = !dentroDeAspas;
    else if (!dentroDeAspas && ch in contagem) contagem[ch] += 1;
  }
  return Object.entries(contagem).sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(texto) {
  const sep = detectarSeparador(texto);
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
      continue;
    }
    if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  linha.push(campo);
  if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
  return linhas;
}

function decodificarTexto(buffer) {
  const utf8 = buffer.toString('utf8');
  // Arquivos de banco brasileiro costumam vir em Latin-1 (Windows-1252):
  // lidos como UTF-8 eles trazem o caractere de substituição U+FFFD.
  if (utf8.includes(String.fromCharCode(0xfffd))) return buffer.toString('latin1');
  return utf8.charCodeAt(0) === 0xfeff ? utf8.slice(1) : utf8; // remove BOM
}

// ---------------------------------------------------------------------
// OFX (padrão de "Exportar para Money/Quicken" dos bancos)
// ---------------------------------------------------------------------

function parseOfx(texto) {
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  const tag = (bloco, nome) => {
    const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  };
  return blocos
    .map((b) => {
      const data = parseData(tag(b, 'DTPOSTED'));
      const valor = parseValor(tag(b, 'TRNAMT').replace(',', '.'));
      const descricao = tag(b, 'MEMO') || tag(b, 'NAME') || 'Lançamento';
      return data && valor !== null ? { data, descricao, valor, categoria: null } : null;
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------
// Detecção de colunas
// ---------------------------------------------------------------------

const PADROES_COLUNA = {
  data: /^(data|date|dt)\b|data (do )?lanc|data mov|data da compra|^dia$/,
  descricao: /descri|historico|lancamento|estabelecimento|memo|detalhe|titulo|title|description|nome|favorecido|^item$/,
  valor: /^valor|amount|quantia|^montante|valor \(r\$\)|valor em r\$|^r\$$/,
  debito: /debito|saida|^saidas?$|valor debito/,
  credito: /credito|entrada|^entradas?$|valor credito/,
  categoria: /categoria|category/,
};

function acharCabecalho(linhas) {
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const cels = linhas[i].map((c) => semAcento(c));
    const idx = {};
    cels.forEach((c, j) => {
      if (!c || /saldo/.test(c)) return;
      for (const [chave, re] of Object.entries(PADROES_COLUNA)) {
        if (idx[chave] === undefined && re.test(c)) { idx[chave] = j; break; }
      }
    });
    const temValor = idx.valor !== undefined || idx.debito !== undefined || idx.credito !== undefined;
    if (idx.data !== undefined && temValor) return { linha: i, idx };
  }
  return null;
}

/** Sem cabeçalho: descobre as colunas pelo tipo de conteúdo. */
function inferirColunas(linhas) {
  const amostra = linhas.slice(0, 50);
  const largura = Math.max(...amostra.map((l) => l.length));
  const score = Array.from({ length: largura }, () => ({ datas: 0, numeros: 0, textoMedio: 0 }));
  for (const l of amostra) {
    l.forEach((c, j) => {
      if (parseData(c)) score[j].datas += 1;
      else if (parseValor(c) !== null && /\d/.test(String(c))) score[j].numeros += 1;
      else score[j].textoMedio += String(c).length;
    });
  }
  const melhor = (campo, excluir = []) => score
    .map((s, j) => ({ j, v: s[campo] }))
    .filter((x) => !excluir.includes(x.j))
    .sort((a, b) => b.v - a.v)[0];
  const data = melhor('datas');
  const valor = melhor('numeros', [data?.j]);
  const descricao = melhor('textoMedio', [data?.j, valor?.j]);
  if (!data?.v || !valor?.v) return null;
  return { linha: -1, idx: { data: data.j, valor: valor.j, descricao: descricao?.j } };
}

const LINHAS_IGNORADAS = /^(saldo|saldo anterior|saldo do dia|saldo final|total|subtotal|s a l d o|resumo)/;

function linhasParaTransacoes(linhas) {
  const estrutura = acharCabecalho(linhas) || inferirColunas(linhas);
  if (!estrutura) return [];
  const { idx } = estrutura;
  const anoPadrao = new Date().getFullYear();

  const resultado = [];
  for (const l of linhas.slice(estrutura.linha + 1)) {
    const data = parseData(l[idx.data], anoPadrao);
    if (!data) continue;

    const descricao = String(l[idx.descricao] ?? '').trim().replace(/\s+/g, ' ') || 'Lançamento';
    if (LINHAS_IGNORADAS.test(semAcento(descricao))) continue;

    let valor = null;
    if (idx.valor !== undefined) valor = parseValor(l[idx.valor]);
    if (valor === null && (idx.debito !== undefined || idx.credito !== undefined)) {
      const deb = idx.debito !== undefined ? parseValor(l[idx.debito]) : null;
      const cred = idx.credito !== undefined ? parseValor(l[idx.credito]) : null;
      if (deb) valor = -Math.abs(deb);
      else if (cred) valor = Math.abs(cred);
    }
    if (valor === null || valor === 0) continue;

    resultado.push({
      data,
      descricao: descricao.slice(0, 200),
      valor: Math.round(valor * 100) / 100,
      categoria: idx.categoria !== undefined ? String(l[idx.categoria] ?? '').trim() || null : null,
    });
  }
  return resultado;
}

/**
 * Lê o arquivo e devolve os lançamentos + o texto bruto (usado como
 * plano B pela IA quando o layout é irreconhecível).
 *
 * @param {Object} opcoes
 * @param {boolean} opcoes.ehFatura - extrato de cartão: as compras vêm
 *   como valores POSITIVOS na maioria das faturas; invertemos para que
 *   gasto seja sempre negativo no sistema.
 */
export function lerPlanilha(buffer, nomeArquivo = '', { ehFatura = false } = {}) {
  const ext = String(nomeArquivo).toLowerCase().split('.').pop();
  let transacoes = [];
  let textoBruto = '';

  if (ext === 'ofx' || /<OFX>/i.test(buffer.subarray(0, 2000).toString('latin1'))) {
    textoBruto = decodificarTexto(buffer);
    transacoes = parseOfx(textoBruto);
  } else if (ext === 'xls' || ext === 'xlsx') {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    for (const nomeAba of wb.SheetNames) {
      const ws = wb.Sheets[nomeAba];
      const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      const daAba = linhasParaTransacoes(linhas);
      if (daAba.length > transacoes.length) {
        transacoes = daAba;
        textoBruto = XLSX.utils.sheet_to_csv(ws, { FS: ';' });
      }
    }
  } else {
    textoBruto = decodificarTexto(buffer);
    transacoes = linhasParaTransacoes(parseCsv(textoBruto));
  }

  if (ehFatura && transacoes.length > 0) {
    const positivos = transacoes.filter((t) => t.valor > 0).length;
    if (positivos > transacoes.length / 2) {
      transacoes = transacoes.map((t) => ({ ...t, valor: -t.valor }));
    }
  }

  return { transacoes, textoBruto: textoBruto.slice(0, 200_000) };
}
