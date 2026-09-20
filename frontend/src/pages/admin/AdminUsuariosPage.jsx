import React, { useEffect, useState } from 'react';
import { fetchApi } from '../../lib/api';
import { getValorAjustado } from '../../lib/finance';
import MetricCard from '../../components/MetricCard';
import TransactionTable from '../../components/TransactionTable';
import PainelAnual from '../../components/PainelAnual';
import ObjetivosPage from '../ObjetivosPage';

/**
 * Página "Usuários" do admin: lista todo mundo cadastrado e, ao
 * selecionar um usuário, mostra a visão individual completa dele
 * (perfil, métricas, categorias e extrato) — dados que só o admin
 * consegue ver (o backend garante isso via requireAdmin).
 */
export default function AdminUsuariosPage({ usuarios, usuarioSelecionadoId, onSelecionar, onVoltar, formatCurrency }) {
  const [detalhe, setDetalhe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!usuarioSelecionadoId) {
      setDetalhe(null);
      return;
    }
    let ativo = true;
    setLoading(true);
    setErro('');
    fetchApi(`/admin/usuarios/${usuarioSelecionadoId}`)
      .then((data) => { if (ativo) setDetalhe(data); })
      .catch((err) => { if (ativo) setErro(err.message || 'Erro ao carregar usuário.'); })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [usuarioSelecionadoId]);

  if (!usuarioSelecionadoId) {
    return (
      <div className="table-card">
        <div className="card-header-flex" style={{ marginBottom: '16px' }}>
          <h3>👥 Todos os Usuários</h3>
          <span className="badge-count">{usuarios.length} usuários</span>
        </div>
        {usuarios.length === 0 ? (
          <div className="empty-state-box"><p>Nenhum usuário cadastrado além do administrador.</p></div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Telefone</th>
                <th>Banco</th>
                <th>Saldo Líquido</th>
                <th>Transações</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} onClick={() => onSelecionar(u.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <strong>{u.nome}</strong>
                    <br />
                    <small style={{ color: '#64748b' }}>{u.email}</small>
                  </td>
                  <td>{u.telefone || '—'}</td>
                  <td>{u.bancoConectado ? <span className="tag tag-bank">{u.bancoConectado}</span> : '—'}</td>
                  <td style={{ fontWeight: 700, color: u.saldoLiquido >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(u.saldoLiquido)}</td>
                  <td className="center-text">{u.totalTransacoes}</td>
                  <td className="center-text">🔍 Ver detalhes</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div>
      <button type="button" className="btn-secondary" onClick={onVoltar} style={{ marginBottom: '16px' }}>
        ← Voltar para a lista
      </button>

      {loading && <div className="empty-state-box"><p>Carregando dados do usuário...</p></div>}
      {erro && <div className="auth-alert error">{erro}</div>}

      {detalhe && (
        <>
          <div className="table-card" style={{ marginBottom: '20px', padding: '24px' }}>
            <h3>{detalhe.perfil.nome}</h3>
            <p style={{ color: '#64748b', marginTop: '4px' }}>{detalhe.perfil.email}</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
              {detalhe.perfil.telefone && <span className="tag tag-wa">📱 {detalhe.perfil.telefone}</span>}
              {detalhe.perfil.bancoConectado && <span className="tag tag-bank">🏦 {detalhe.perfil.bancoConectado}</span>}
              <span className="tag-category">
                Cadastrado em {detalhe.perfil.criadoEm ? new Date(detalhe.perfil.criadoEm).toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>
          </div>

          <div className="metrics-grid">
            <MetricCard label="SALDO LÍQUIDO" icon="💰" value={formatCurrency(detalhe.resumo.saldoLiquido)} color={detalhe.resumo.saldoLiquido >= 0 ? '#10b981' : '#ef4444'} />
            <MetricCard label="TOTAL ENTRADAS" icon="📥" value={formatCurrency(detalhe.resumo.totalEntradas)} color="#10b981" />
            <MetricCard label="TOTAL SAÍDAS" icon="📤" value={formatCurrency(detalhe.resumo.totalSaidas)} color="#ef4444" />
            <MetricCard label="TAXA DE POUPANÇA" icon="🎯" value={`${detalhe.resumo.taxaPoupanca.toFixed(1)}%`} color={detalhe.resumo.taxaPoupanca >= 20 ? '#10b981' : '#f59e0b'} />
          </div>

          <div style={{ marginTop: '20px' }}>
            <PainelAnual userId={detalhe.perfil.id} formatCurrency={formatCurrency} />
          </div>

          <div className="table-card" style={{ marginTop: '20px' }}>
            <ObjetivosPage userId={detalhe.perfil.id} editavel formatCurrency={formatCurrency} />
          </div>

          <div className="dashboard-grid-modern" style={{ marginTop: '20px' }}>
            <div className="chart-card">
              <div className="card-header-flex">
                <h3>📊 Despesas por Categoria</h3>
                <span className="badge-count">{detalhe.categorias.length} categorias</span>
              </div>
              {detalhe.categorias.length === 0 ? (
                <div className="empty-state-box"><p>Nenhuma despesa categorizada.</p></div>
              ) : (
                <div className="bar-list">
                  {detalhe.categorias.map(({ categoria, valor }) => {
                    const percentual = detalhe.resumo.totalSaidas > 0 ? (valor / detalhe.resumo.totalSaidas) * 100 : 0;
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
          </div>

          <div className="table-card" style={{ marginTop: '20px' }}>
            <div className="card-header-flex" style={{ marginBottom: '16px' }}>
              <h3>💳 Extrato Completo</h3>
              <span className="badge-count">{detalhe.transacoes.length} transações</span>
            </div>
            <TransactionTable
              transacoes={detalhe.transacoes}
              loading={false}
              userId={detalhe.perfil.id}
              formatCurrency={formatCurrency}
              getValorAjustado={getValorAjustado}
            />
          </div>
        </>
      )}
    </div>
  );
}
