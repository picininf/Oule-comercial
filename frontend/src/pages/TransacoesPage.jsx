import TransactionTable from '../components/TransactionTable';
import React from 'react';
export default function TransacoesPage({
  transacoes, loading, busca, setBusca, filtroCategoria, setFiltroCategoria,
  onAtualizar, formatCurrency, getValorAjustado, userId,
}) {
  const transacoesFiltradas = transacoes.filter((t) => {
    const combinaBusca = (t.estabelecimento || '').toLowerCase().includes(busca.toLowerCase());
    const combinaCategoria = filtroCategoria === 'Todas' || t.categoria === filtroCategoria;
    return combinaBusca && combinaCategoria;
  });

  return (
    <div className="table-card">
      <div className="table-toolbar">
        <input
          type="text"
          placeholder="🔍 Pesquisar por estabelecimento..."
          className="search-input"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select className="select-filter" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
          <option value="Todas">Todas Categorias</option>
          <option value="Salário">Salário</option>
          <option value="Alimentação">Alimentação</option>
          <option value="Transporte">Transporte</option>
          <option value="Serviços">Serviços</option>
          <option value="Lazer">Lazer</option>
        </select>
        <button className="btn-refresh" onClick={onAtualizar}>🔄 Atualizar</button>
      </div>

      <TransactionTable
        transacoes={transacoesFiltradas}
        loading={loading}
        userId={userId}
        formatCurrency={formatCurrency}
        getValorAjustado={getValorAjustado}
      />
    </div>
  );
}
