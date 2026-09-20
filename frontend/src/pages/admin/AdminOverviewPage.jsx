import React from 'react';
import MetricCard from '../../components/MetricCard';

/**
 * Visão geral do administrador: métricas consolidadas de TODOS os
 * usuários, despesas por categoria somadas e um ranking de usuários por
 * volume de gastos. Clicar em um usuário leva para a visão individual
 * dele (via onSelecionarUsuario).
 */
export default function AdminOverviewPage({ overview, loading, formatCurrency, onSelecionarUsuario }) {
  if (loading && !overview) {
    return (
      <div className="empty-state-box">
        <p>Carregando dados consolidados de todos os usuários...</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="empty-state-box">
        <p>Não foi possível carregar os dados administrativos.</p>
      </div>
    );
  }

  const { resumo, categorias, evolucaoMensal, usuarios } = overview;
  const maiorMovimento = evolucaoMensal.reduce((max, m) => Math.max(max, m.entradas, m.saidas), 0) || 1;

  return (
    <>
      <div className="metrics-grid">
        <MetricCard label="USUÁRIOS ATIVOS" icon="👥" value={resumo.totalUsuarios} color="#8b5cf6" />
        <MetricCard label="SALDO CONSOLIDADO" icon="💰" value={formatCurrency(resumo.saldoConsolidado)} color={resumo.saldoConsolidado >= 0 ? '#10b981' : '#ef4444'} />
        <MetricCard label="ENTRADAS (TODOS)" icon="📥" value={formatCurrency(resumo.totalEntradas)} color="#10b981" />
        <MetricCard label="SAÍDAS (TODOS)" icon="📤" value={formatCurrency(resumo.totalSaidas)} color="#ef4444" />
      </div>

      <div className="dashboard-grid-modern" style={{ marginTop: '20px' }}>
        <div className="chart-card">
          <div className="card-header-flex">
            <h3>📊 Despesas por Categoria — Todos os Usuários</h3>
            <span className="badge-count">{categorias.length} categorias</span>
          </div>
          {categorias.length === 0 ? (
            <div className="empty-state-box"><p>Nenhuma despesa registrada ainda.</p></div>
          ) : (
            <div className="bar-list">
              {categorias.map(({ categoria, valor }) => {
                const percentual = resumo.totalSaidas > 0 ? (valor / resumo.totalSaidas) * 100 : 0;
                return (
                  <div key={categoria} className="bar-item">
                    <div className="bar-label">
                      <span className="cat-name">{categoria}</span>
                      <span className="cat-value" style={{ color: '#ef4444' }}>
                        {formatCurrency(valor)} <small>({percentual.toFixed(1)}%)</small>
                      </span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${percentual}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="side-dashboard-column">
          <div className="chart-card">
            <h3>📈 Evolução Mensal (Todos)</h3>
            {evolucaoMensal.length === 0 ? (
              <p className="empty-text">Sem histórico suficiente ainda.</p>
            ) : (
              <div className="bar-list">
                {evolucaoMensal.map((m) => (
                  <div key={m.mes} className="bar-item">
                    <div className="bar-label">
                      <span className="cat-name">{m.mes}</span>
                      <span className="cat-value" style={{ color: '#10b981' }}>{formatCurrency(m.entradas)}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(m.entradas / maiorMovimento) * 100}%`, background: '#10b981' }}></div>
                    </div>
                    <div className="bar-track" style={{ marginTop: '4px' }}>
                      <div className="bar-fill" style={{ width: `${(m.saidas / maiorMovimento) * 100}%`, background: '#ef4444' }}></div>
                    </div>
                    <div className="bar-label" style={{ marginTop: '2px' }}>
                      <span></span>
                      <span className="cat-value" style={{ color: '#ef4444' }}>{formatCurrency(m.saidas)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="table-card" style={{ marginTop: '20px' }}>
        <div className="card-header-flex" style={{ marginBottom: '16px' }}>
          <h3>🏆 Ranking de Usuários por Gasto Total</h3>
          <span className="badge-count">{usuarios.length} usuários</span>
        </div>

        {usuarios.length === 0 ? (
          <div className="empty-state-box"><p>Nenhum usuário cadastrado além do administrador.</p></div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Banco</th>
                <th>Total Entradas</th>
                <th>Total Saídas</th>
                <th>Saldo Líquido</th>
                <th>Transações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} onClick={() => onSelecionarUsuario(u.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <strong>{u.nome}</strong>
                    <br />
                    <small style={{ color: '#64748b' }}>{u.email}</small>
                  </td>
                  <td>{u.bancoConectado ? <span className="tag tag-bank">{u.bancoConectado}</span> : '—'}</td>
                  <td style={{ color: '#10b981', fontWeight: 600 }}>{formatCurrency(u.totalEntradas)}</td>
                  <td style={{ color: '#ef4444', fontWeight: 600 }}>{formatCurrency(u.totalSaidas)}</td>
                  <td style={{ fontWeight: 700, color: u.saldoLiquido >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(u.saldoLiquido)}</td>
                  <td className="center-text">{u.totalTransacoes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
