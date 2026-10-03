import React, { useMemo, useState } from 'react';
import { Card, Vazio, Carregando, Alerta, useToast, useConfirmacao } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';

/** Gestão de planejadores e do vínculo planejador ↔ cliente (só oule). */
export default function AdminPlanejadoresPage() {
  const toast = useToast();
  const [confirmar, modalConfirmacao] = useConfirmacao();
  const { dados, carregando, erro, recarregar } = useApi('/admin/planejadores');
  const [salvandoId, setSalvandoId] = useState(null);
  const [busca, setBusca] = useState('');

  const executar = async (id, fn, mensagem) => {
    setSalvandoId(id);
    try {
      await fn();
      toast(mensagem);
      await recarregar();
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvandoId(null);
    }
  };

  const promover = (c) => executar(c.id, () => api.patch(`/admin/planejadores/usuarios/${c.id}/papel`, { role: 'planejador' }), `${c.nome} agora é planejador.`);

  const rebaixar = async (p) => {
    const ok = await confirmar({
      titulo: 'Remover planejador',
      texto: `${p.nome} volta a ser cliente comum. ${p.clientes.length ? `Os ${p.clientes.length} clientes dele ficarão sem planejador até serem reatribuídos.` : ''}`,
      confirmar: 'Remover',
      perigo: true,
    });
    if (ok) executar(p.id, () => api.patch(`/admin/planejadores/usuarios/${p.id}/papel`, { role: 'cliente' }), 'Planejador removido.');
  };

  const atribuir = (c, planejadorId) =>
    executar(c.id, () => api.patch(`/admin/planejadores/clientes/${c.id}/vinculo`, { planejadorId: planejadorId || null }), 'Vínculo atualizado.');

  const clientes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (dados?.clientes || []).filter((c) => !termo || `${c.nome} ${c.email}`.toLowerCase().includes(termo));
  }, [dados, busca]);

  if (carregando && !dados) return <Carregando texto="Carregando planejadores..." />;
  if (!dados) return <Alerta>{erro || 'Não foi possível carregar os dados.'}</Alerta>;

  const semPlanejador = dados.clientes.filter((c) => !c.planejadorId).length;

  return (
    <div className="pilha">
      {modalConfirmacao}
      {semPlanejador > 0 && <Alerta tipo="atencao">{semPlanejador} {semPlanejador === 1 ? 'cliente está' : 'clientes estão'} sem planejador responsável.</Alerta>}

      <Card titulo="Planejadores" icone="🧭" semPadding acoes={<span className="tag">{dados.planejadores.length}</span>}>
        {dados.planejadores.length === 0 ? <Vazio icone="🧭" texto="Nenhum planejador ainda. Promova um cliente na lista abaixo." /> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead><tr><th>Planejador</th><th>Telefone</th><th>Clientes</th><th /></tr></thead>
              <tbody>
                {dados.planejadores.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.nome}</strong><div className="texto-suave texto-pequeno">{p.email}</div></td>
                    <td>{p.telefone || '—'}</td>
                    <td><div className="tags">{p.clientes.length === 0 ? <span className="texto-suave">Nenhum</span> : p.clientes.map((c) => <span key={c.id} className="tag tag-bank">{c.nome}</span>)}</div></td>
                    <td className="acoes"><button type="button" className="btn btn-perigo-contorno btn-pequeno" disabled={salvandoId === p.id} onClick={() => rebaixar(p)}>Remover planejador</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card titulo="Clientes e planejador responsável" icone="👥" semPadding acoes={<span className="tag">{dados.clientes.length}</span>}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--borda)' }}>
          <input className="input input-busca" placeholder="Buscar cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
        </div>
        {clientes.length === 0 ? <Vazio texto="Nenhum cliente encontrado." /> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead><tr><th>Cliente</th><th>Planejador</th><th /></tr></thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.nome}</strong><div className="texto-suave texto-pequeno">{c.email}</div></td>
                    <td style={{ minWidth: 200 }}>
                      <select className="input" value={c.planejadorId || ''} disabled={salvandoId === c.id} onChange={(e) => atribuir(c, e.target.value)} aria-label={`Planejador de ${c.nome}`}>
                        <option value="">— Sem planejador —</option>
                        {dados.planejadores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </td>
                    <td className="acoes"><button type="button" className="btn btn-secundario btn-pequeno" disabled={salvandoId === c.id} onClick={() => promover(c)}>Tornar planejador</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
