import React, { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../lib/api';

const CATEGORIAS = [
  { id: 'Financeira', icone: '💰' },
  { id: 'Viagem', icone: '✈️' },
  { id: 'Casa', icone: '🏠' },
  { id: 'Produto', icone: '📦' },
  { id: 'Eletrônicos', icone: '💻' },
  { id: 'Educação', icone: '🎓' },
  { id: 'Saúde', icone: '🩺' },
  { id: 'Outro', icone: '🌟' },
];

const ICONE_POR_CATEGORIA = CATEGORIAS.reduce((acc, c) => ({ ...acc, [c.id]: c.icone }), {});

const ESTADO_INICIAL_FORM = {
  titulo: '',
  tipo: 'dinheiro',
  categoria: 'Financeira',
  descricao: '',
  valorAlvo: '',
  valorAtual: '',
  prazo: '',
};

/**
 * @param {string|null} userId - se null, opera sobre o próprio usuário
 *   logado (fluxo cliente). Se informado, staff (planejador/oule)
 *   vendo/editando os sonhos de um cliente específico.
 * @param {boolean} editavel - permite criar/editar/excluir metas.
 */
export default function ObjetivosPage({ userId = null, editavel = true, formatCurrency }) {
  const [objetivos, setObjetivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(ESTADO_INICIAL_FORM);
  const [salvando, setSalvando] = useState(false);

  const endpoint = userId ? `/objetivos?userId=${userId}` : '/objetivos';

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const data = await fetchApi(endpoint);
      setObjetivos(Array.isArray(data) ? data : []);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar metas.');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(ESTADO_INICIAL_FORM);
    setModalAberto(true);
  };

  const abrirEdicao = (obj) => {
    setEditandoId(obj.id);
    setForm({
      titulo: obj.titulo,
      tipo: obj.tipo,
      categoria: obj.categoria || 'Outro',
      descricao: obj.descricao || '',
      valorAlvo: String(obj.valorAlvo),
      valorAtual: String(obj.valorAtual),
      prazo: obj.prazo || '',
    });
    setModalAberto(true);
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const payload = {
        titulo: form.titulo,
        tipo: form.tipo,
        categoria: form.categoria,
        descricao: form.descricao || null,
        valorAlvo: Number(form.valorAlvo) || 0,
        valorAtual: Number(form.valorAtual) || 0,
        prazo: form.prazo || null,
        ...(userId && !editandoId ? { userId } : {}),
      };

      if (editandoId) {
        await fetchApi(`/objetivos/${editandoId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await fetchApi('/objetivos', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalAberto(false);
      await carregar();
    } catch (err) {
      setErro(err.message || 'Erro ao salvar meta.');
    } finally {
      setSalvando(false);
    }
  };

  const alterarStatus = async (obj, status) => {
    try {
      await fetchApi(`/objetivos/${obj.id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      await carregar();
    } catch (err) {
      setErro(err.message || 'Erro ao atualizar status.');
    }
  };

  const excluir = async (obj) => {
    if (!window.confirm(`Excluir a meta "${obj.titulo}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await fetchApi(`/objetivos/${obj.id}`, { method: 'DELETE' });
      await carregar();
    } catch (err) {
      setErro(err.message || 'Erro ao excluir meta.');
    }
  };

  const emAndamento = objetivos.filter((o) => o.status === 'em_andamento');
  const concluidas = objetivos.filter((o) => o.status === 'concluido');
  const canceladas = objetivos.filter((o) => o.status === 'cancelado');

  return (
    <div>
      {erro && <div className="auth-alert error" style={{ marginBottom: '16px' }}>{erro}</div>}

      <div className="card-header-flex" style={{ marginBottom: '16px' }}>
        <h3>🎯 Objetivos e Sonhos</h3>
        {editavel && (
          <button type="button" className="btn-primary" onClick={abrirNovo}>
            + Nova Meta
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty-state-box"><p>Carregando metas...</p></div>
      ) : objetivos.length === 0 ? (
        <div className="empty-state-box">
          <p>Nenhuma meta cadastrada ainda. {editavel && 'Que tal adicionar o primeiro sonho?'}</p>
        </div>
      ) : (
        <>
          <SecaoObjetivos
            titulo="Em andamento"
            lista={emAndamento}
            formatCurrency={formatCurrency}
            editavel={editavel}
            onEditar={abrirEdicao}
            onExcluir={excluir}
            onAlterarStatus={alterarStatus}
          />
          {concluidas.length > 0 && (
            <SecaoObjetivos
              titulo="Concluídas 🎉"
              lista={concluidas}
              formatCurrency={formatCurrency}
              editavel={editavel}
              onEditar={abrirEdicao}
              onExcluir={excluir}
              onAlterarStatus={alterarStatus}
            />
          )}
          {canceladas.length > 0 && (
            <SecaoObjetivos
              titulo="Canceladas"
              lista={canceladas}
              formatCurrency={formatCurrency}
              editavel={editavel}
              onEditar={abrirEdicao}
              onExcluir={excluir}
              onAlterarStatus={alterarStatus}
            />
          )}
        </>
      )}

      {modalAberto && (
        <div className="modal-overlay" onClick={() => setModalAberto(false)}>
          <div className="modal-content" style={{ height: 'auto', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editandoId ? '✏️ Editar Meta' : '🎯 Nova Meta ou Sonho'}</h3>
              <button className="close-btn" onClick={() => setModalAberto(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'block', overflowY: 'auto', padding: '20px' }}>
              <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label>Categoria</label>
                  <div className="categoria-picker">
                    {CATEGORIAS.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className={`categoria-chip ${form.categoria === c.id ? 'active' : ''}`}
                        onClick={() => setForm({ ...form, categoria: c.id })}
                      >
                        <span>{c.icone}</span> {c.id}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontWeight: 600 }}>Título da meta</label>
                  <input
                    type="text"
                    className="search-input"
                    style={{ width: '100%', padding: '10px' }}
                    placeholder="Ex.: Viagem para o Nordeste, PS5, Reserva de emergência..."
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontWeight: 600 }}>Tipo</label>
                  <select
                    className="select-filter"
                    style={{ width: '100%', padding: '10px' }}
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  >
                    <option value="dinheiro">Meta financeira (juntar dinheiro)</option>
                    <option value="produto">Comprar um produto específico</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontWeight: 600 }}>Valor alvo (R$)</label>
                    <input
                      type="number" min="0" step="0.01"
                      className="search-input" style={{ width: '100%', padding: '10px' }}
                      value={form.valorAlvo}
                      onChange={(e) => setForm({ ...form, valorAlvo: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontWeight: 600 }}>Já guardado (R$)</label>
                    <input
                      type="number" min="0" step="0.01"
                      className="search-input" style={{ width: '100%', padding: '10px' }}
                      value={form.valorAtual}
                      onChange={(e) => setForm({ ...form, valorAtual: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontWeight: 600 }}>Prazo (opcional)</label>
                  <input
                    type="date"
                    className="search-input" style={{ width: '100%', padding: '10px' }}
                    value={form.prazo}
                    onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontWeight: 600 }}>Descrição (opcional)</label>
                  <textarea
                    className="search-input"
                    style={{ width: '100%', padding: '10px', minHeight: '70px', resize: 'vertical' }}
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    placeholder="Detalhes, motivação, onde comprar..."
                  />
                </div>

                <button type="submit" className="btn-primary" disabled={salvando} style={{ marginTop: '6px' }}>
                  {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Criar meta'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SecaoObjetivos({ titulo, lista, formatCurrency, editavel, onEditar, onExcluir, onAlterarStatus }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h4 style={{ margin: '4px 0 12px 0', color: '#64748b', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {titulo} ({lista.length})
      </h4>
      <div className="objetivos-grid">
        {lista.map((obj) => (
          <div key={obj.id} className="objetivo-card">
            <div className="objetivo-card-topo">
              <span className="objetivo-icone">{ICONE_POR_CATEGORIA[obj.categoria] || '🌟'}</span>
              <span className="tag-category">{obj.categoria}</span>
            </div>
            <h4 className="objetivo-titulo">{obj.titulo}</h4>
            {obj.descricao && <p className="objetivo-descricao">{obj.descricao}</p>}

            <div className="objetivo-valores">
              <span>{formatCurrency(obj.valorAtual)}</span>
              <span className="objetivo-valor-alvo">de {formatCurrency(obj.valorAlvo)}</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${obj.progresso}%`, background: obj.progresso >= 100 ? '#10b981' : '#d97706' }}
              />
            </div>
            <div className="objetivo-rodape">
              <span>{obj.progresso.toFixed(0)}% concluído</span>
              {obj.prazo && <span>🗓️ {new Date(obj.prazo + 'T00:00:00').toLocaleDateString('pt-BR')}</span>}
            </div>

            {editavel && (
              <div className="objetivo-acoes">
                <button type="button" className="btn-secondary" onClick={() => onEditar(obj)}>✏️ Editar</button>
                {obj.status === 'em_andamento' && (
                  <button type="button" className="btn-secondary" onClick={() => onAlterarStatus(obj, 'concluido')}>✅ Concluir</button>
                )}
                {obj.status === 'em_andamento' && (
                  <button type="button" className="btn-danger-outline" onClick={() => onAlterarStatus(obj, 'cancelado')}>🚫 Cancelar</button>
                )}
                <button type="button" className="btn-danger-outline" onClick={() => onExcluir(obj)}>🗑️</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
