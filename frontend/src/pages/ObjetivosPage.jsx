import React, { useMemo, useState } from 'react';
import { Card, Modal, Campo, Alerta, Vazio, Carregando, Barra, useValores, useToast, useConfirmacao } from '../components/ui';
import MenuExportar from '../components/MenuExportar';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { formatarData, formatarMoeda, qs } from '../lib/format';

const CATEGORIAS_SONHO = [
  { id: 'Financeira', icone: '💰' },
  { id: 'Reserva de emergência', icone: '🛟' },
  { id: 'Viagem', icone: '✈️' },
  { id: 'Casa', icone: '🏠' },
  { id: 'Carro', icone: '🚗' },
  { id: 'Eletrônicos', icone: '💻' },
  { id: 'Educação', icone: '🎓' },
  { id: 'Saúde', icone: '🩺' },
  { id: 'Casamento', icone: '💍' },
  { id: 'Outro', icone: '🌟' },
];
const ICONE = Object.fromEntries(CATEGORIAS_SONHO.map((c) => [c.id, c.icone]));

const FORM_VAZIO = { titulo: '', tipo: 'dinheiro', categoria: 'Financeira', descricao: '', valorAlvo: '', valorAtual: '', prazo: '' };

function mesesAte(prazo) {
  if (!prazo) return null;
  const hoje = new Date();
  const [a, m] = prazo.split('-').map(Number);
  return Math.max((a - hoje.getFullYear()) * 12 + (m - 1 - hoje.getMonth()), 0);
}

/**
 * Sonhos & Metas. `userId` = staff (planejador/oule) gerenciando os
 * sonhos de um cliente.
 */
export default function ObjetivosPage({ userId = null, editavel = true }) {
  const { fmt } = useValores();
  const toast = useToast();
  const [confirmar, modalConfirmacao] = useConfirmacao();
  const { dados, carregando, erro, recarregar } = useApi(`/objetivos${qs({ userId })}`);
  const [editando, setEditando] = useState(null); // null | 'novo' | objetivo
  const [aportando, setAportando] = useState(null);

  const objetivos = dados || [];
  const grupos = [
    { id: 'em_andamento', titulo: 'Em andamento' },
    { id: 'concluido', titulo: 'Realizados 🎉' },
    { id: 'cancelado', titulo: 'Cancelados' },
  ];
  const totais = useMemo(() => {
    const ativos = objetivos.filter((o) => o.status === 'em_andamento');
    return {
      alvo: ativos.reduce((s, o) => s + o.valorAlvo, 0),
      guardado: ativos.reduce((s, o) => s + o.valorAtual, 0),
      porMes: ativos.reduce((s, o) => {
        const meses = mesesAte(o.prazo);
        return meses ? s + Math.max(o.valorAlvo - o.valorAtual, 0) / meses : s;
      }, 0),
    };
  }, [objetivos]);

  const alterarStatus = async (obj, status) => {
    try {
      await api.put(`/objetivos/${obj.id}`, { status });
      toast(status === 'concluido' ? `Parabéns! “${obj.titulo}” realizado 🎉` : 'Sonho atualizado.');
      recarregar();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  const excluir = async (obj) => {
    const ok = await confirmar({ titulo: 'Excluir sonho', texto: `Excluir “${obj.titulo}”? Essa ação não pode ser desfeita.`, confirmar: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      await api.delete(`/objetivos/${obj.id}`);
      toast('Sonho excluído.');
      recarregar();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  const dadosExportacao = () => ({
    resumo: [
      { rotulo: 'Total dos sonhos ativos', valor: formatarMoeda(totais.alvo) },
      { rotulo: 'Já guardado', valor: formatarMoeda(totais.guardado) },
      { rotulo: 'Necessário por mês', valor: formatarMoeda(totais.porMes) },
    ],
    colunas: [
      { titulo: 'Sonho', largura: 30, chave: 'titulo' },
      { titulo: 'Categoria', chave: 'categoria' },
      { titulo: 'Valor alvo', tipo: 'moeda', chave: 'valorAlvo' },
      { titulo: 'Guardado', tipo: 'moeda', chave: 'valorAtual' },
      { titulo: 'Progresso', valor: (o) => `${o.progresso.toFixed(0)}%` },
      { titulo: 'Prazo', tipo: 'data', chave: 'prazo' },
      { titulo: 'Situação', valor: (o) => ({ em_andamento: 'Em andamento', concluido: 'Realizado', cancelado: 'Cancelado' })[o.status] },
    ],
    linhas: objetivos,
  });

  return (
    <div className="pilha">
      {modalConfirmacao}
      <Card
        titulo="Sonhos & Metas"
        icone="🎯"
        acoes={
          <>
            <MenuExportar nome="sonhos" titulo="Sonhos e metas" dados={dadosExportacao} formatos={['csv', 'xlsx', 'pdf']} />
            {editavel && <button type="button" className="btn btn-primario" onClick={() => setEditando('novo')}>+ Novo sonho</button>}
          </>
        }
      >
        {objetivos.some((o) => o.status === 'em_andamento') && (
          <p className="texto-suave">
            Sonhos ativos somam <strong>{fmt(totais.alvo)}</strong>, com <strong>{fmt(totais.guardado)}</strong> já guardados.
            {totais.porMes > 0 && <> Para cumprir os prazos, é preciso guardar cerca de <strong>{fmt(totais.porMes)}</strong> por mês — veja em “Futuro” se isso cabe no seu ritmo.</>}
          </p>
        )}
      </Card>

      <Alerta>{erro}</Alerta>
      {carregando && !dados ? <Carregando texto="Carregando sonhos..." /> : objetivos.length === 0 ? (
        <Card>
          <Vazio
            icone="🌟"
            titulo="Nenhum sonho cadastrado ainda"
            texto="Viagem, casa própria, reserva de emergência... Cadastre o primeiro e acompanhe quanto falta e quando ele chega."
            acao={editavel && <button type="button" className="btn btn-primario" onClick={() => setEditando('novo')}>Cadastrar meu primeiro sonho</button>}
          />
        </Card>
      ) : (
        grupos.map((g) => {
          const lista = objetivos.filter((o) => o.status === g.id);
          if (lista.length === 0) return null;
          return (
            <section key={g.id}>
              <h4 className="secao-titulo">{g.titulo} ({lista.length})</h4>
              <div className="objetivos-grid">
                {lista.map((obj) => {
                  const meses = mesesAte(obj.prazo);
                  const falta = Math.max(obj.valorAlvo - obj.valorAtual, 0);
                  return (
                    <article key={obj.id} className="objetivo-card">
                      <div className="objetivo-card-topo">
                        <span className="objetivo-icone" aria-hidden="true">{ICONE[obj.categoria] || '🏷️'}</span>
                        <span className="tag-categoria">{obj.categoria}</span>
                      </div>
                      <h4 className="objetivo-titulo">{obj.titulo}</h4>
                      {obj.descricao && <p className="objetivo-descricao">{obj.descricao}</p>}
                      <div className="objetivo-valores">
                        <span>{fmt(obj.valorAtual)}</span>
                        <span className="objetivo-valor-alvo">de {fmt(obj.valorAlvo)}</span>
                      </div>
                      <Barra pct={obj.progresso} cor={obj.progresso >= 100 ? 'var(--sucesso)' : undefined} />
                      <div className="objetivo-rodape">
                        <span>{obj.progresso.toFixed(0)}% concluído</span>
                        {obj.prazo && <span>🗓️ {formatarData(obj.prazo)}</span>}
                      </div>
                      {obj.status === 'em_andamento' && falta > 0 && meses !== null && (
                        <p className="texto-pequeno texto-suave">
                          {meses > 0 ? <>Guardar <strong>{fmt(falta / meses)}</strong>/mês por {meses} {meses === 1 ? 'mês' : 'meses'}.</> : <span className="negativo">Prazo chegou — faltam {fmt(falta)}.</span>}
                        </p>
                      )}
                      {editavel && (
                        <div className="objetivo-acoes">
                          {obj.status === 'em_andamento' && <button type="button" className="btn btn-primario btn-pequeno" onClick={() => setAportando(obj)}>💰 Guardar</button>}
                          <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setEditando(obj)}>✏️ Editar</button>
                          {obj.status === 'em_andamento' && <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => alterarStatus(obj, 'concluido')}>✅ Realizado</button>}
                          {obj.status !== 'em_andamento' && <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => alterarStatus(obj, 'em_andamento')}>↩️ Reabrir</button>}
                          {obj.status === 'em_andamento' && <button type="button" className="btn btn-perigo-contorno btn-pequeno" onClick={() => alterarStatus(obj, 'cancelado')}>Cancelar</button>}
                          <button type="button" className="btn btn-fantasma btn-icone" aria-label="Excluir" title="Excluir" onClick={() => excluir(obj)}>🗑️</button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {editando && (
        <SonhoModal
          objetivo={editando === 'novo' ? null : editando}
          userId={userId}
          categoriasExtras={objetivos.map((o) => o.categoria)}
          onFechar={() => setEditando(null)}
          onSalvo={recarregar}
        />
      )}
      {aportando && <AporteModal objetivo={aportando} onFechar={() => setAportando(null)} onSalvo={recarregar} />}
    </div>
  );
}

function SonhoModal({ objetivo, userId, categoriasExtras, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(
    objetivo
      ? {
          titulo: objetivo.titulo,
          tipo: objetivo.tipo,
          categoria: objetivo.categoria || 'Outro',
          descricao: objetivo.descricao || '',
          valorAlvo: String(objetivo.valorAlvo),
          valorAtual: String(objetivo.valorAtual),
          prazo: objetivo.prazo || '',
        }
      : FORM_VAZIO
  );
  const [novaCategoria, setNovaCategoria] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }));

  const categorias = useMemo(() => {
    const ids = new Set(CATEGORIAS_SONHO.map((c) => c.id));
    const extras = [...new Set([...categoriasExtras, form.categoria])].filter((c) => c && !ids.has(c)).map((id) => ({ id, icone: '🏷️' }));
    return [...CATEGORIAS_SONHO, ...extras];
  }, [categoriasExtras, form.categoria]);

  const adicionarCategoria = () => {
    const nome = novaCategoria.trim().slice(0, 60);
    if (nome) setForm((f) => ({ ...f, categoria: nome }));
    setNovaCategoria('');
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    const payload = {
      titulo: form.titulo,
      tipo: form.tipo,
      categoria: form.categoria,
      descricao: form.descricao || null,
      valorAlvo: Number(form.valorAlvo) || 0,
      valorAtual: Number(form.valorAtual) || 0,
      prazo: form.prazo || null,
    };
    try {
      if (objetivo) await api.put(`/objetivos/${objetivo.id}`, payload);
      else await api.post('/objetivos', { ...payload, ...(userId ? { userId } : {}) });
      toast(objetivo ? 'Sonho atualizado.' : 'Sonho cadastrado!');
      onSalvo();
      onFechar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={objetivo ? 'Editar sonho' : 'Novo sonho ou meta'}
      largura="lg"
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-sonho" className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando...' : objetivo ? 'Salvar alterações' : 'Criar sonho'}</button>
        </>
      }
    >
      <form id="form-sonho" onSubmit={salvar} className="pilha">
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Categoria">
          <div className="categoria-picker">
            {categorias.map((c) => (
              <button type="button" key={c.id} className={`chip ${form.categoria === c.id ? 'ativo' : ''}`} onClick={() => setForm((f) => ({ ...f, categoria: c.id }))}>
                <span aria-hidden="true">{c.icone}</span> {c.id}
              </button>
            ))}
          </div>
        </Campo>
        <div className="linha">
          <input
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="Outra categoria (opcional)"
            maxLength={60}
            value={novaCategoria}
            onChange={(e) => setNovaCategoria(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                adicionarCategoria();
              }
            }}
          />
          <button type="button" className="btn btn-secundario" onClick={adicionarCategoria} disabled={!novaCategoria.trim()}>Usar categoria</button>
        </div>
        <div className="grade-form">
          <Campo rotulo="Título" className="inteira">
            <input required maxLength={120} value={form.titulo} onChange={set('titulo')} placeholder="Ex.: Viagem para o Nordeste, Reserva de emergência..." />
          </Campo>
          <Campo rotulo="Tipo">
            <select value={form.tipo} onChange={set('tipo')}>
              <option value="dinheiro">Juntar um valor</option>
              <option value="produto">Comprar um produto</option>
            </select>
          </Campo>
          <Campo rotulo="Prazo (opcional)">
            <input type="date" value={form.prazo} onChange={set('prazo')} />
          </Campo>
          <Campo rotulo="Valor alvo (R$)">
            <input required type="number" min="0" step="0.01" inputMode="decimal" value={form.valorAlvo} onChange={set('valorAlvo')} />
          </Campo>
          <Campo rotulo="Já guardado (R$)">
            <input type="number" min="0" step="0.01" inputMode="decimal" value={form.valorAtual} onChange={set('valorAtual')} />
          </Campo>
          <Campo rotulo="Descrição (opcional)" className="inteira">
            <textarea maxLength={500} value={form.descricao} onChange={set('descricao')} placeholder="Motivação, detalhes, onde comprar..." />
          </Campo>
        </div>
      </form>
    </Modal>
  );
}

function AporteModal({ objetivo, onFechar, onSalvo }) {
  const toast = useToast();
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e) => {
    e.preventDefault();
    const v = Number(valor);
    if (!v) return;
    setSalvando(true);
    try {
      const novoTotal = Math.max(objetivo.valorAtual + v, 0);
      await api.put(`/objetivos/${objetivo.id}`, { valorAtual: novoTotal });
      toast(novoTotal >= objetivo.valorAlvo ? `Meta atingida! 🎉 Marque “${objetivo.titulo}” como realizado.` : 'Valor guardado no sonho.');
      onSalvo();
      onFechar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={`Guardar em “${objetivo.titulo}”`}
      subtitulo={`Hoje: ${formatarMoeda(objetivo.valorAtual)} de ${formatarMoeda(objetivo.valorAlvo)}`}
      largura="sm"
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-aporte" className="btn btn-primario" disabled={salvando || !Number(valor)}>{salvando ? 'Salvando...' : 'Confirmar'}</button>
        </>
      }
    >
      <form id="form-aporte" onSubmit={salvar} className="pilha">
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Quanto você guardou? (R$)" ajuda="Use um valor negativo para registrar uma retirada.">
          <input autoFocus type="number" step="0.01" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
      </form>
    </Modal>
  );
}
