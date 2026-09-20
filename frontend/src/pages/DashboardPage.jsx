import React from 'react';
import PainelAnual from '../components/PainelAnual';

export default function DashboardPage({ transacoes, categoriasOrdenadas, totalSaidas, taxaPoupanca, formatCurrency, getValorAjustado, userId = null }) {
  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <PainelAnual userId={userId} formatCurrency={formatCurrency} />
      </div>

      <div className="dashboard-grid-modern">
      <div className="chart-card">
        <div className="card-header-flex">
          <h3>📊 Despesas por Categoria</h3>
          <span className="badge-count">{categoriasOrdenadas.length} categorias</span>
        </div>
        {categoriasOrdenadas.length === 0 ? (
          <div className="empty-state-box"><p>Nenhuma despesa categorizada no momento.</p></div>
        ) : (
          <div className="bar-list">
            {categoriasOrdenadas.map(([cat, valor]) => {
              const percentual = totalSaidas > 0 ? (valor / totalSaidas) * 100 : 0;
              return (
                <div key={cat} className="bar-item">
                  <div className="bar-label">
                    <span className="cat-name">{cat}</span>
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
        <div className="info-card-gradient">
          <h4>🎯 Saúde Financeira</h4>
          <p>Taxa de Poupança Atual</p>
          <div className="health-score" style={{ color: taxaPoupanca >= 20 ? '#10b981' : '#f59e0b' }}>
            {taxaPoupanca.toFixed(1)}%
          </div>
          <small>{taxaPoupanca >= 20 ? 'Excelente ritmo de retenção de capital!' : 'Atenção ao volume de gastos mensais.'}</small>
        </div>

        <div className="chart-card" style={{ marginTop: '20px' }}>
          <h3>⚡ Últimas Transações</h3>
          <div className="mini-trans-list">
            {transacoes.slice(0, 4).length === 0 ? (
              <p className="empty-text">Sem movimentações recentes.</p>
            ) : (
              transacoes.slice(0, 4).map((t, idx) => {
                const val = getValorAjustado(t);
                const isPos = val > 0;
                return (
                  <div key={t.id || idx} className="mini-trans-item">
                    <div>
                      <strong>{t.estabelecimento || 'Estabelecimento'}</strong>
                      <small>{t.categoria || 'Geral'}</small>
                    </div>
                    <span style={{ color: isPos ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                      {isPos ? '+' : '-'} {formatCurrency(Math.abs(val))}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
