import React, { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../lib/api';

const CATEGORIAS_ORCAMENTO = ['Alimentação', 'Transporte', 'Serviços', 'Lazer', 'Moradia', 'Saúde', 'Outros'];

export default function PainelAnual({ userId = null, formatCurrency }) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [painel, setPainel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [mesSelecionado, setMesSelecionado] = useState(null);

  const qs = (base) => {
    const params = new URLSearchParams(base);
    if (userId) params.set('userId', userId);
    return params.toString();
  };

  const carregarPainel = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const data = await fetchApi(`/plano/painel?${qs({ ano: String(ano) })}`);
      setPainel(data);
      const mesAtualChave = `${anoAtual}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      setMesSelecionado((atual) => atual || (data.meses.find((m) => m.mes === mesAtualChave) ? mesAtualChave : data.meses[0]?.mes));
    } catch (err) {
      setErro(err.message || 'Erro ao carregar o painel anual.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, userId]);

  useEffect(() => { carregarPainel(); }, [carregarPainel]);

  if (loading && !painel) {
    return <div className="chart-card"><p className="empty-text">Carregando linha do tempo do ano...</p></div>;
  }

  if (erro) {
    return <div className="chart-card"><div className="auth-alert error">{erro}</div></div>;
  }

  if (!painel) return null;

  const mesAtivo = painel.meses.find((m) => m.mes === mesSelecionado) || painel.meses[0];
  const maiorValor = Math.max(1, ...painel.meses.map((m) => Math.max(m.entradas, m.saidas)));

  return (
    <div className="chart-card painel-anual">
      <div className="card-header-flex">
        <h3>🗓️ Plano x Vida Real — {ano}</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button type="button" className="btn-secondary" onClick={() => setAno((a) => a - 1)}>← {ano - 1}</button>
          <button type="button" className="btn-secondary" onClick={() => setAno((a) => a + 1)} disabled={ano >= anoAtual}>
            {ano + 1} →
          </button>
        </div>
      </div>
      <p className="empty-text" style={{ margin: '4px 0 16px 0' }}>
        Cada barra mostra o quanto entrou e saiu naquele mês. Clique em um mês para ver os detalhes e ajustar o planejado.
      </p>

      <div className="timeline-meses">
        {painel.meses.map((m) => (
          <button
            type="button"
            key={m.mes}
            className={`timeline-mes ${m.mes === mesSelecionado ? 'active' : ''} ${m.saldo < 0 && m.temMovimento ? 'negativo' : ''}`}
            onClick={() => setMesSelecionado(m.mes)}
          >
            <span className="timeline-mes-label">{m.label}{m.ehMesAtual ? ' •' : ''}</span>
            <div className="timeline-mes-barras">
              <div className="timeline-barra entrada" style={{ height: `${(m.entradas / maiorValor) * 100}%` }} />
              <div className="timeline-barra saida" style={{ height: `${(m.saidas / maiorValor) * 100}%` }} />
            </div>
            <span className={`timeline-mes-saldo ${m.saldo < 0 ? 'neg' : 'pos'}`}>
              {m.temMovimento ? formatCurrency(m.saldo) : '—'}
            </span>
          </button>
        ))}
      </div>

      {mesAtivo && (
        <DetalheMes
          mes={mesAtivo}
          formatCurrency={formatCurrency}
          userId={userId}
          onOrcamentoSalvo={carregarPainel}
        />
      )}
    </div>
  );
}

function DetalheMes({ mes, formatCurrency, userId, onOrcamentoSalvo }) {
  const [orcamentoAberto, setOrcamentoAberto] = useState(false);

  return (
    <div className="detalhe-mes">
      <div className="detalhe-mes-metrics">
        <div>
          <span className="detalhe-mes-label">Entrou</span>
          <strong style={{ color: '#10b981' }}>{formatCurrency(mes.entradas)}</strong>
        </div>
        <div>
          <span className="detalhe-mes-label">Saiu</span>
          <strong style={{ color: '#ef4444' }}>{formatCurrency(mes.saidas)}</strong>
        </div>
        <div>
          <span className="detalhe-mes-label">Sobrou</span>
          <strong style={{ color: mes.saldo >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(mes.saldo)}</strong>
        </div>
        <div>
          <span className="detalhe-mes-label">Planejado</span>
          <strong>{formatCurrency(mes.planejadoTotal)}</strong>
        </div>
      </div>

      {mes.alertas.length > 0 && (
        <div className="alertas-mes">
          {mes.alertas.map((a, idx) => (
            <div key={idx} className="alerta-item">⚠️ {a}</div>
          ))}
        </div>
      )}

      {mes.categorias.length > 0 && (
        <div className="bar-list" style={{ marginTop: '14px' }}>
          {mes.categorias.map((c) => {
            const percentual = c.planejado > 0 ? Math.min(100, (c.real / c.planejado) * 100) : (c.real > 0 ? 100 : 0);
            const estourou = c.planejado > 0 && c.real > c.planejado;
            return (
              <div key={c.categoria} className="bar-item">
                <div className="bar-label">
                  <span className="cat-name">{c.categoria}</span>
                  <span className="cat-value" style={{ color: estourou ? '#ef4444' : '#334155' }}>
                    {formatCurrency(c.real)}{c.planejado > 0 ? ` / ${formatCurrency(c.planejado)}` : ''}
                  </span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${percentual}%`, background: estourou ? '#ef4444' : '#d97706' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className="btn-secondary" style={{ marginTop: '14px' }} onClick={() => setOrcamentoAberto((v) => !v)}>
        {orcamentoAberto ? 'Fechar orçamento do mês' : `✏️ Planejar orçamento de ${mes.label}`}
      </button>

      {orcamentoAberto && (
        <EditorOrcamento
          mes={mes.mes}
          label={mes.label}
          userId={userId}
          onSalvo={() => { setOrcamentoAberto(false); onOrcamentoSalvo(); }}
        />
      )}
    </div>
  );
}

function EditorOrcamento({ mes, label, userId, onSalvo }) {
  const [valores, setValores] = useState(() => Object.fromEntries(CATEGORIAS_ORCAMENTO.map((c) => [c, ''])));
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    const params = new URLSearchParams({ mes });
    if (userId) params.set('userId', userId);

    fetchApi(`/plano/orcamento?${params.toString()}`)
      .then((itens) => {
        if (!ativo) return;
        const novo = Object.fromEntries(CATEGORIAS_ORCAMENTO.map((c) => [c, '']));
        for (const item of itens) {
          novo[item.categoria] = String(item.valorPlanejado);
        }
        setValores(novo);
      })
      .catch((err) => ativo && setErro(err.message || 'Erro ao carregar orçamento.'))
      .finally(() => ativo && setCarregando(false));

    return () => { ativo = false; };
  }, [mes, userId]);

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const itens = Object.entries(valores)
        .filter(([, v]) => Number(v) > 0)
        .map(([categoria, v]) => ({ categoria, valorPlanejado: Number(v) }));

      await fetchApi('/plano/orcamento', {
        method: 'PUT',
        body: JSON.stringify({ mes, itens, ...(userId ? { userId } : {}) }),
      });
      onSalvo();
    } catch (err) {
      setErro(err.message || 'Erro ao salvar orçamento.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={salvar} className="orcamento-editor">
      <p className="empty-text">Quanto você planeja gastar em cada categoria em {label}?</p>
      {erro && <div className="auth-alert error">{erro}</div>}
      {carregando ? (
        <p className="empty-text">Carregando...</p>
      ) : (
        <div className="orcamento-grid">
          {CATEGORIAS_ORCAMENTO.map((cat) => (
            <div key={cat} className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600 }}>{cat}</label>
              <input
                type="number" min="0" step="0.01"
                className="search-input" style={{ width: '100%', padding: '8px' }}
                value={valores[cat]}
                onChange={(e) => setValores({ ...valores, [cat]: e.target.value })}
                placeholder="0,00"
              />
            </div>
          ))}
        </div>
      )}
      <button type="submit" className="btn-primary" disabled={salvando || carregando} style={{ marginTop: '12px' }}>
        {salvando ? 'Salvando...' : 'Salvar orçamento do mês'}
      </button>
    </form>
  );
}
