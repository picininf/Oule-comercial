import React, { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../../lib/api';

export default function AdminPlanejadoresPage() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvandoId, setSalvandoId] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const data = await fetchApi('/admin/planejadores');
      setDados(data);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar planejadores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const avisar = (texto) => {
    setMensagem(texto);
    setTimeout(() => setMensagem(''), 3000);
  };

  const promoverParaPlanejador = async (userId) => {
    setSalvandoId(userId);
    try {
      await fetchApi(`/admin/planejadores/usuarios/${userId}/papel`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'planejador' }),
      });
      avisar('Usuário promovido a planejador.');
      await carregar();
    } catch (err) {
      setErro(err.message || 'Erro ao promover usuário.');
    } finally {
      setSalvandoId(null);
    }
  };

  const rebaixarParaCliente = async (userId) => {
    if (!window.confirm('Rebaixar este planejador para cliente comum? Os clientes dele ficarão sem planejador responsável.')) return;
    setSalvandoId(userId);
    try {
      await fetchApi(`/admin/planejadores/usuarios/${userId}/papel`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'cliente' }),
      });
      avisar('Planejador rebaixado para cliente.');
      await carregar();
    } catch (err) {
      setErro(err.message || 'Erro ao rebaixar planejador.');
    } finally {
      setSalvandoId(null);
    }
  };

  const atribuirPlanejador = async (clienteId, planejadorId) => {
    setSalvandoId(clienteId);
    try {
      await fetchApi(`/admin/planejadores/clientes/${clienteId}/vinculo`, {
        method: 'PATCH',
        body: JSON.stringify({ planejadorId: planejadorId || null }),
      });
      avisar('Vínculo atualizado.');
      await carregar();
    } catch (err) {
      setErro(err.message || 'Erro ao atualizar vínculo.');
    } finally {
      setSalvandoId(null);
    }
  };

  if (loading && !dados) {
    return <div className="empty-state-box"><p>Carregando planejadores...</p></div>;
  }

  if (!dados) {
    return <div className="empty-state-box"><p>Não foi possível carregar os dados.</p></div>;
  }

  const { planejadores, clientes } = dados;

  return (
    <div>
      {erro && <div className="auth-alert error" style={{ marginBottom: '16px' }}>{erro}</div>}
      {mensagem && (
        <div style={{ marginBottom: '16px', padding: '12px', background: '#d1fae5', color: '#065f46', borderRadius: '8px', fontSize: '14px' }}>
          {mensagem}
        </div>
      )}

      <div className="table-card" style={{ marginBottom: '20px' }}>
        <div className="card-header-flex" style={{ marginBottom: '16px' }}>
          <h3>🧭 Planejadores</h3>
          <span className="badge-count">{planejadores.length} planejadores</span>
        </div>

        {planejadores.length === 0 ? (
          <div className="empty-state-box"><p>Nenhum planejador cadastrado ainda. Promova um cliente na tabela abaixo.</p></div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>Planejador</th>
                <th>Telefone</th>
                <th>Clientes sob responsabilidade</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {planejadores.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.nome}</strong>
                    <br />
                    <small style={{ color: '#64748b' }}>{p.email}</small>
                  </td>
                  <td>{p.telefone || '—'}</td>
                  <td>
                    {p.clientes.length === 0 ? (
                      <span style={{ color: '#94a3b8' }}>Nenhum cliente ainda</span>
                    ) : (
                      p.clientes.map((c) => <span key={c.id} className="tag tag-bank" style={{ marginRight: '6px' }}>{c.nome}</span>)
                    )}
                  </td>
                  <td className="center-text">
                    <button
                      type="button"
                      className="btn-danger-outline"
                      disabled={salvandoId === p.id}
                      onClick={() => rebaixarParaCliente(p.id)}
                    >
                      Rebaixar p/ cliente
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="table-card">
        <div className="card-header-flex" style={{ marginBottom: '16px' }}>
          <h3>👥 Clientes — atribuir planejador responsável</h3>
          <span className="badge-count">{clientes.length} clientes</span>
        </div>

        {clientes.length === 0 ? (
          <div className="empty-state-box"><p>Nenhum cliente cadastrado.</p></div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Planejador responsável</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.nome}</strong>
                    <br />
                    <small style={{ color: '#64748b' }}>{c.email}</small>
                  </td>
                  <td>
                    <select
                      className="select-filter"
                      style={{ padding: '8px' }}
                      value={c.planejadorId || ''}
                      disabled={salvandoId === c.id}
                      onChange={(e) => atribuirPlanejador(c.id, e.target.value)}
                    >
                      <option value="">— Sem planejador —</option>
                      {planejadores.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </td>
                  <td className="center-text">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={salvandoId === c.id}
                      onClick={() => promoverParaPlanejador(c.id)}
                    >
                      Promover a planejador
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
