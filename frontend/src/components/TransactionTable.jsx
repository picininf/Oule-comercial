
import React from 'react';
export default function TransactionTable({ transacoes, loading, userId, formatCurrency, getValorAjustado }) {
  if (loading) {
    return (
      <table className="custom-table">
        <tbody><tr><td className="center-text">Carregando dados...</td></tr></tbody>
      </table>
    );
  }

  if (transacoes.length === 0) {
    return (
      <table className="custom-table">
        <tbody><tr><td className="center-text">Nenhuma transação localizada.</td></tr></tbody>
      </table>
    );
  }

  return (
    <table className="custom-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Origem</th>
          <th>Estabelecimento</th>
          <th>Categoria</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        {transacoes.map((t) => {
          const val = getValorAjustado(t);
          const isPos = val > 0;
          return (
            <tr key={t.id || `${t.estabelecimento}-${t.data_transacao}`}>
              <td>{t.data_transacao ? new Date(t.data_transacao).toLocaleDateString('pt-BR') : '-'}</td>
              <td>
                <span className={`tag ${t.open_finance_id ? 'tag-bank' : 'tag-wa'}`}>
                  {t.open_finance_id ? 'Banco Real' : 'WhatsApp IA'}
                </span>
              </td>
              <td><strong>{t.estabelecimento || 'Não informado'}</strong></td>
              <td><span className="tag-category">{t.categoria || 'Outros'}</span></td>
              <td style={{ fontWeight: '700', color: isPos ? '#10b981' : '#ef4444' }}>
                {isPos ? '+' : '-'} {formatCurrency(Math.abs(val))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
