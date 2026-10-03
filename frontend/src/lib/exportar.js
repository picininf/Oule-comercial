import { Capacitor } from '@capacitor/core';
import { formatarData, formatarMoeda, hojeIso } from './format';

/**
 * Exportação de dados em CSV, Excel (XLSX), PDF e PNG.
 *
 * As bibliotecas pesadas (SheetJS, jsPDF, html-to-image) são carregadas
 * só quando a pessoa clica em exportar — não pesam na abertura do app.
 *
 * No navegador o arquivo é baixado normalmente. No app Android (WebView
 * do Capacitor) um link de download não funciona: o arquivo é salvo no
 * cache do app e aberto na folha de compartilhamento do sistema (salvar
 * no Drive, mandar no WhatsApp, e-mail...).
 */

function nomeArquivo(base, extensao) {
  const limpo = String(base || 'oule').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase();
  return `${limpo}-${hojeIso()}.${extensao}`;
}

function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(',')[1]);
    leitor.onerror = reject;
    leitor.readAsDataURL(blob);
  });
}

async function entregarArquivo(blob, nome) {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const { uri } = await Filesystem.writeFile({ path: nome, data: await blobParaBase64(blob), directory: Directory.Cache });
    await Share.share({ title: nome, url: uri, dialogTitle: 'Salvar ou compartilhar' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @param {Array<{chave: string, titulo: string, tipo?: 'moeda'|'data'|'texto'|'numero', largura?: number}>} colunas
 */
function valorCelula(linha, coluna, { paraPlanilha = false } = {}) {
  const bruto = typeof coluna.valor === 'function' ? coluna.valor(linha) : linha[coluna.chave];
  if (bruto === null || bruto === undefined) return '';
  if (coluna.tipo === 'moeda') return paraPlanilha ? Number(bruto) : formatarMoeda(bruto);
  if (coluna.tipo === 'data') return formatarData(bruto);
  return bruto;
}

export async function exportarCSV({ nome, colunas, linhas }) {
  const escapar = (v) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cabecalho = colunas.map((c) => escapar(c.titulo)).join(';');
  const corpo = linhas.map((l) =>
    colunas
      .map((c) => {
        const v = valorCelula(l, c, { paraPlanilha: true });
        // Excel em português espera vírgula decimal no CSV com ";".
        return escapar(typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v);
      })
      .join(';')
  );
  // BOM UTF-8: sem ele o Excel abre os acentos quebrados.
  const blob = new Blob(['﻿' + [cabecalho, ...corpo].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  await entregarArquivo(blob, nomeArquivo(nome, 'csv'));
}

export async function exportarExcel({ nome, colunas, linhas, abas = null }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const montar = (cols, dados) => {
    const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c.titulo), ...dados.map((l) => cols.map((c) => valorCelula(l, c, { paraPlanilha: true })))]);
    ws['!cols'] = cols.map((c) => ({ wch: c.largura || Math.max(12, c.titulo.length + 2) }));
    // Formato de moeda brasileiro nas colunas de valor.
    cols.forEach((c, j) => {
      if (c.tipo !== 'moeda') return;
      for (let i = 1; i <= dados.length; i++) {
        const cel = ws[XLSX.utils.encode_cell({ r: i, c: j })];
        if (cel && typeof cel.v === 'number') cel.z = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
      }
    });
    return ws;
  };
  if (abas) {
    for (const aba of abas) XLSX.utils.book_append_sheet(wb, montar(aba.colunas, aba.linhas), aba.nome.slice(0, 31));
  } else {
    XLSX.utils.book_append_sheet(wb, montar(colunas, linhas), 'Dados');
  }
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  await entregarArquivo(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nomeArquivo(nome, 'xlsx'));
}

/**
 * PDF de relatório: cabeçalho com a marca, bloco de resumo (pares
 * rótulo/valor) e tabela paginada.
 */
export async function exportarPDF({ nome, titulo, subtitulo = '', resumo = [], colunas, linhas }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: colunas.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const largura = doc.internal.pageSize.getWidth();

  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, largura, 64, 'F');
  doc.setTextColor(217, 119, 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('OULE', 40, 40);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(titulo, 110, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitulo || `Gerado em ${formatarData(hojeIso())}`, 110, 50);

  let y = 88;
  if (resumo.length > 0) {
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(10);
    const porLinha = 3;
    resumo.forEach((r, i) => {
      const x = 40 + (i % porLinha) * ((largura - 80) / porLinha);
      if (i > 0 && i % porLinha === 0) y += 34;
      doc.setFont('helvetica', 'normal');
      doc.text(String(r.rotulo), x, y);
      doc.setFont('helvetica', 'bold');
      doc.text(String(r.valor), x, y + 14);
    });
    y += 36;
  }

  autoTable(doc, {
    startY: y,
    head: [colunas.map((c) => c.titulo)],
    body: linhas.map((l) => colunas.map((c) => String(valorCelula(l, c)))),
    styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
    headStyles: { fillColor: [217, 119, 6], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(colunas.map((c, i) => [i, c.tipo === 'moeda' ? { halign: 'right' } : {}])),
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Oule | App — página ${doc.internal.getNumberOfPages()}`, 40, doc.internal.pageSize.getHeight() - 20);
    },
  });

  await entregarArquivo(doc.output('blob'), nomeArquivo(nome, 'pdf'));
}

/** Imagem PNG de um trecho da tela (gráfico, painel, retrospectiva...). */
export async function exportarPNG({ nome, elemento }) {
  if (!elemento) throw new Error('Nada para exportar.');
  const { toBlob } = await import('html-to-image');
  const fundo = getComputedStyle(document.body).backgroundColor || '#ffffff';
  const blob = await toBlob(elemento, {
    pixelRatio: 2,
    backgroundColor: fundo,
    cacheBust: true,
    // Botões de ação não fazem sentido na imagem.
    filter: (no) => !(no.classList && no.classList.contains('nao-exportar')),
  });
  await entregarArquivo(blob, nomeArquivo(nome, 'png'));
}

/** Backup completo em JSON (mesmo fluxo de download/compartilhamento). */
export async function exportarJSON({ nome, dados }) {
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  await entregarArquivo(blob, nomeArquivo(nome, 'json'));
}
