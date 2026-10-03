import React, { useState } from 'react';
import { getValorAjustado, origemDe } from '../lib/finance';
import { categoriaInfo, TIPO_GASTO_POR_ID } from '../lib/categorias';
import { formatarData } from '../lib/format';
import { useValores, Vazio, Carregando } from './ui';

const POR_PAGINA = 50;

/**
 * Tabela de transações. Mostra a data da compra (competência) e, quando
 * diferente, a data em que ela é paga (vencimento da fatura do cartão).
 */
export default function TransactionTable({ transacoes, loading, onEditar, onExcluir, vazioTexto }) {
  const { fmt } = useValores();
  const [limite, setLimite] = useState(POR_PAGINA);

  if (loading) return <Carregando texto="Carregando transações..." />;
  if (!transacoes || transacoes.length === 0) {
    return <Vazio icone="🧾" titulo="Nenhuma transação encontrada" texto={vazioTexto || 'Ajuste os filtros ou adicione um lançamento.'} />;
  }

  const visiveis = transacoes.slice(0, limite);
  const editavel = Boolean(onEditar || onExcluir);

  return (
    <>
      <div className="tabela-wrapper">
        <table className="tabela">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Tipo de gasto</th>
              <th>Origem</th>
              <th className="num">Valor</th>
              {editavel && <th className="acoes"><span className="sr-only">Ações</span></th>}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((t) => {
              const val = getValorAjustado(t);
              const cat = categoriaInfo(t.categoria);
              const origem = origemDe(t);
              const dataCompra = t.data_competencia || t.data_transacao;
              const pagaEmOutraData = t.data_caixa && t.data_caixa !== dataCompra;
              const tipo = TIPO_GASTO_POR_ID[t.tipo_gasto];
              return (
                <tr key={t.id}>
                  <td>
                    {formatarData(dataCompra)}
                    {pagaEmOutraData && <div className="texto-suave texto-pequeno" title="Data em que o valor sai da conta (vencimento da fatura)">💳 paga em {formatarData(t.data_caixa)}</div>}
                  </td>
                  <td>
                    <strong>{t.descricao || t.estabelecimento || 'Não informado'}</strong>
                    {t.parcelas_total > 1 && <span className="tag" style={{ marginLeft: 6 }}>{t.parcela_atual}/{t.parcelas_total}</span>}
                    {t.observacao && <div className="texto-suave texto-pequeno">{t.observacao}</div>}
                  </td>
                  <td><span className="tag-categoria">{cat.icone} {t.categoria || 'Outros'}</span></td>
                  <td>{tipo ? <span className="tag" style={{ color: tipo.cor }}>{tipo.curto}</span> : <span className="texto-suave">—</span>}</td>
                  <td><span className={`tag ${origem.classe}`}>{origem.nome}</span></td>
                  <td className={`num ${val > 0 ? 'positivo' : val < 0 ? 'negativo' : ''}`} style={{ fontWeight: 700 }}>
                    {t.categoria === 'Transferências' ? '⇄ ' : val > 0 ? '+ ' : '− '}{fmt(Math.abs(val))}
                  </td>
                  {editavel && (
                    <td className="acoes">
                      {onEditar && <button type="button" className="btn btn-fantasma btn-icone" title="Editar" aria-label={`Editar ${t.descricao}`} onClick={() => onEditar(t)}>✏️</button>}
                      {onExcluir && !t.open_finance_id && <button type="button" className="btn btn-fantasma btn-icone" title="Excluir" aria-label={`Excluir ${t.descricao}`} onClick={() => onExcluir(t)}>🗑️</button>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="tabela-rodape">
        <span>Mostrando {visiveis.length} de {transacoes.length}</span>
        {limite < transacoes.length && (
          <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setLimite((l) => l + POR_PAGINA * 2)}>Mostrar mais</button>
        )}
      </div>
    </>
  );
}
