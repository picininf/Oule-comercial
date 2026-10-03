import React, { useEffect, useRef, useState } from 'react';
import { exportarCSV, exportarExcel, exportarPDF, exportarPNG } from '../lib/exportar';
import { useToast } from './ui';

/**
 * Botão "Exportar" com as opções CSV, Excel, PDF e PNG.
 *
 * @param {string} nome - base do nome do arquivo
 * @param {string} titulo - título do relatório em PDF
 * @param {Function} dados - () => ({ colunas, linhas, resumo?, abas? }) — chamado
 *   só na hora de exportar, para pegar o estado atual (filtros aplicados).
 * @param {React.RefObject} alvoPng - elemento da tela a virar imagem (opcional)
 */
export default function MenuExportar({ nome, titulo, dados, alvoPng, formatos = ['csv', 'xlsx', 'pdf', 'png'] }) {
  const [aberto, setAberto] = useState(false);
  const [gerando, setGerando] = useState(null);
  const ref = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => !ref.current?.contains(e.target) && setAberto(false);
    const esc = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const opcoes = [
    { id: 'csv', nome: 'CSV (planilha simples)', icone: '📄' },
    { id: 'xlsx', nome: 'Excel (.xlsx)', icone: '📊' },
    { id: 'pdf', nome: 'PDF (relatório)', icone: '🧾' },
    { id: 'png', nome: 'Imagem (PNG)', icone: '🖼️', disponivel: Boolean(alvoPng) },
  ].filter((o) => formatos.includes(o.id) && o.disponivel !== false);

  const exportar = async (formato) => {
    setGerando(formato);
    setAberto(false);
    try {
      if (formato === 'png') {
        await exportarPNG({ nome, elemento: alvoPng.current });
      } else {
        const d = await dados();
        if (!d.abas && (!d.linhas || d.linhas.length === 0)) {
          toast('Não há dados para exportar com os filtros atuais.', 'info');
          return;
        }
        if (formato === 'csv') await exportarCSV({ nome, colunas: d.colunas, linhas: d.linhas });
        if (formato === 'xlsx') await exportarExcel({ nome, colunas: d.colunas, linhas: d.linhas, abas: d.abas });
        if (formato === 'pdf') await exportarPDF({ nome, titulo, subtitulo: d.subtitulo, resumo: d.resumo || [], colunas: d.colunas, linhas: d.linhas });
      }
      toast('Arquivo gerado.');
    } catch (err) {
      console.error(err);
      toast('Não foi possível gerar o arquivo. Tente novamente.', 'erro');
    } finally {
      setGerando(null);
    }
  };

  return (
    <div className="menu-exportar nao-exportar" ref={ref}>
      <button type="button" className="btn btn-secundario" aria-haspopup="menu" aria-expanded={aberto} disabled={Boolean(gerando)} onClick={() => setAberto((v) => !v)}>
        {gerando ? 'Gerando...' : '⬇️ Exportar'}
      </button>
      {aberto && (
        <div className="menu-flutuante" role="menu">
          {opcoes.map((o) => (
            <button key={o.id} type="button" role="menuitem" onClick={() => exportar(o.id)}>
              <span aria-hidden="true">{o.icone}</span> {o.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
