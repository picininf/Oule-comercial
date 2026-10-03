import React, { useMemo, useState } from 'react';
import { Card, Abas, Vazio, useValores } from '../../components/ui';
import { formatarData } from '../../lib/format';
import DashboardPage from '../DashboardPage';
import PerfilPage from '../PerfilPage';
import ObjetivosPage from '../ObjetivosPage';
import ImportarExtratoPage from '../ImportarExtratoPage';
import { TransacoesAgrupada, ContasAgrupada, PlanejamentoAgrupada } from '../Agrupadas';

// Mesma organização que o cliente vê (sub-abas dentro de cada uma).
const ABAS_CLIENTE = [
  { id: 'resumo', nome: 'Início', icone: '🏠' },
  { id: 'transacoes', nome: 'Transações', icone: '💱' },
  { id: 'contas', nome: 'Contas & Cartões', icone: '💳' },
  { id: 'sonhos', nome: 'Sonhos', icone: '🎯' },
  { id: 'plano', nome: 'Planejamento', icone: '🗓️' },
  { id: 'importar', nome: 'Importar extrato', icone: '📄' },
  { id: 'cadastro', nome: 'Cadastro', icone: '👤' },
];

// Links do Início ("Ver pagamentos", "Completar cadastro"...) -> aba da ficha.
const DESTINO = { pagamentos: 'contas', cartoes: 'contas', perfil: 'cadastro', conta: 'cadastro', regras: 'transacoes', futuro: 'plano' };

/**
 * Clientes da equipe: lista com busca (nome, e-mail ou código) e, ao
 * abrir um cliente, todas as telas dele organizadas em abas — o
 * planejador planeja, importa e ajusta tudo em nome do cliente.
 */
export default function AdminUsuariosPage({ usuarios, usuarioSelecionadoId, onSelecionar, onVoltar, onAtualizarLista }) {
  const { fmt } = useValores();
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState('');
  const [aba, setAba] = useState('resumo');

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return usuarios
      .filter((u) => !uf || u.estado === uf)
      .filter((u) => !termo || [u.nome, u.email, u.codigoCliente, ...(u.tags || [])].some((c) => String(c || '').toLowerCase().includes(termo)))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [usuarios, busca, uf]);

  const ufs = [...new Set(usuarios.map((u) => u.estado).filter(Boolean))].sort();
  const cliente = usuarios.find((u) => u.id === usuarioSelecionadoId);

  if (usuarioSelecionadoId) {
    return (
      <div className="pilha">
        <div className="linha-entre">
          <button type="button" className="btn btn-secundario" onClick={() => { setAba('resumo'); onVoltar(); }}>← Clientes</button>
          {cliente && (
            <div className="linha">
              <strong style={{ color: 'var(--texto-forte)' }}>{cliente.nome}</strong>
              {cliente.codigoCliente && <span className="codigo-cliente">{cliente.codigoCliente}</span>}
            </div>
          )}
        </div>
        <Abas abas={ABAS_CLIENTE} ativa={aba} onTrocar={setAba} />
        {aba === 'resumo' && (
          <DashboardPage userId={usuarioSelecionadoId} onNavegar={(d) => setAba(DESTINO[d.split('/')[0]] || d.split('/')[0])} />
        )}
        {aba === 'transacoes' && <TransacoesAgrupada userId={usuarioSelecionadoId} />}
        {aba === 'contas' && <ContasAgrupada userId={usuarioSelecionadoId} />}
        {aba === 'sonhos' && <ObjetivosPage userId={usuarioSelecionadoId} />}
        {aba === 'plano' && <PlanejamentoAgrupada userId={usuarioSelecionadoId} />}
        {aba === 'importar' && <ImportarExtratoPage userId={usuarioSelecionadoId} />}
        {aba === 'cadastro' && <PerfilPage userId={usuarioSelecionadoId} ehStaff onAtualizado={onAtualizarLista} />}
      </div>
    );
  }

  return (
    <Card titulo="Clientes" icone="👥" semPadding acoes={<span className="tag">{filtrados.length} de {usuarios.length}</span>}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--borda)' }} className="filtros">
        <input className="input input-busca filtro-largo" placeholder="Buscar por nome, e-mail, código (OUL-...) ou TAG" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
        <select className="input" value={uf} onChange={(e) => setUf(e.target.value)} aria-label="Estado">
          <option value="">Todos os estados</option>
          {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      {filtrados.length === 0 ? <Vazio icone="🔎" titulo="Nenhum cliente encontrado" texto="Ajuste a busca ou os filtros." /> : (
        <div className="tabela-wrapper">
          <table className="tabela">
            <thead>
              <tr><th>Cliente</th><th>Código</th><th>Perfil</th><th className="num">Saldo</th><th>Última movimentação</th><th /></tr>
            </thead>
            <tbody>
              {filtrados.map((u) => (
                <tr key={u.id} className="clicavel" onClick={() => onSelecionar(u.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelecionar(u.id)}>
                  <td><strong>{u.nome}</strong><div className="texto-suave texto-pequeno">{u.email}{u.telefone ? ` · ${u.telefone}` : ''}</div></td>
                  <td>{u.codigoCliente ? <span className="codigo-cliente" style={{ fontSize: 11 }}>{u.codigoCliente}</span> : '—'}</td>
                  <td>
                    <div className="tags">
                      {u.estado && <span className="tag">{u.estado}</span>}
                      {u.faixaEtaria && <span className="tag">{u.faixaEtaria}</span>}
                      {(u.tags || []).slice(0, 2).map((t) => <span key={t} className="tag tag-extrato">{t}</span>)}
                    </div>
                  </td>
                  <td className={`num ${u.saldoLiquido >= 0 ? 'positivo' : 'negativo'}`}>{fmt(u.saldoLiquido)}</td>
                  <td>{u.ultimaTransacao ? formatarData(String(u.ultimaTransacao).slice(0, 10)) : <span className="texto-suave">sem dados</span>}</td>
                  <td className="acoes"><span className="btn btn-secundario btn-pequeno">Abrir →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
