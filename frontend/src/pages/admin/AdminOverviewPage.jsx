import React, { useRef } from 'react';
import { Card, Metrica, Vazio, Carregando, Barra, Alerta, useValores } from '../../components/ui';
import MenuExportar from '../../components/MenuExportar';
import { categoriaInfo } from '../../lib/categorias';
import { formatarMes, formatarMoeda, formatarPct } from '../../lib/format';

/**
 * Visão geral da equipe: oule vê todos os clientes; planejador, só os
 * dele (o backend já filtra).
 */
export default function AdminOverviewPage({ overview, loading, erro, onSelecionarUsuario }) {
  const { fmt } = useValores();
  const ref = useRef(null);

  if (loading && !overview) return <Carregando texto="Carregando dados consolidados..." />;
  if (!overview) return <Alerta>{erro || 'Não foi possível carregar os dados.'}</Alerta>;

  const { resumo, categorias, evolucaoMensal, usuarios } = overview;
  const maior = Math.max(1, ...evolucaoMensal.map((m) => Math.max(m.entradas, m.saidas)));

  const dadosExportacao = () => ({
    resumo: [
      { rotulo: 'Clientes', valor: String(resumo.totalUsuarios) },
      { rotulo: 'Entradas', valor: formatarMoeda(resumo.totalEntradas) },
      { rotulo: 'Saídas', valor: formatarMoeda(resumo.totalSaidas) },
    ],
    colunas: [
      { titulo: 'Código', chave: 'codigoCliente' },
      { titulo: 'Cliente', largura: 26, chave: 'nome' },
      { titulo: 'E-mail', largura: 28, chave: 'email' },
      { titulo: 'UF', chave: 'estado' },
      { titulo: 'Entradas', tipo: 'moeda', chave: 'totalEntradas' },
      { titulo: 'Saídas', tipo: 'moeda', chave: 'totalSaidas' },
      { titulo: 'Saldo', tipo: 'moeda', chave: 'saldoLiquido' },
      { titulo: 'Transações', chave: 'totalTransacoes' },
    ],
    linhas: usuarios,
  });

  return (
    <div className="pilha" ref={ref}>
      <div className="linha" style={{ justifyContent: 'flex-end' }}>
        <MenuExportar nome="visao-geral-clientes" titulo="Visão geral dos clientes" dados={dadosExportacao} alvoPng={ref} />
      </div>
      <div className="metricas">
        <Metrica rotulo="Clientes" icone="👥" valor={resumo.totalUsuarios} tom="roxo" />
        <Metrica rotulo="Saldo consolidado" icone="💰" valor={fmt(resumo.saldoConsolidado)} tom={resumo.saldoConsolidado >= 0 ? 'positivo' : 'negativo'} />
        <Metrica rotulo="Entradas" icone="📥" valor={fmt(resumo.totalEntradas)} tom="positivo" />
        <Metrica rotulo="Saídas" icone="📤" valor={fmt(resumo.totalSaidas)} tom="negativo" />
      </div>

      <div className="grade-lateral">
        <Card titulo="Despesas por categoria" icone="📊">
          {categorias.length === 0 ? <Vazio texto="Nenhuma despesa registrada ainda." /> : (
            <div className="lista-barras">
              {categorias.map(({ categoria, valor }) => {
                const pct = resumo.totalSaidas > 0 ? (valor / resumo.totalSaidas) * 100 : 0;
                const info = categoriaInfo(categoria);
                return (
                  <div key={categoria}>
                    <div className="item-barra-topo"><span className="item-barra-nome">{info.icone} {categoria}</span><span className="item-barra-valor">{fmt(valor)} <small>({formatarPct(pct)})</small></span></div>
                    <Barra pct={pct} cor={info.cor} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card titulo="Últimos 6 meses" icone="📈">
          {evolucaoMensal.length === 0 ? <Vazio texto="Sem histórico suficiente." /> : (
            <div className="lista-barras">
              {evolucaoMensal.map((m) => (
                <div key={m.mes}>
                  <div className="item-barra-topo"><span className="item-barra-nome">{formatarMes(m.mes, { curto: true })}</span><span className="item-barra-valor positivo">{fmt(m.entradas)}</span></div>
                  <Barra pct={(m.entradas / maior) * 100} cor="var(--sucesso)" />
                  <div style={{ height: 4 }} />
                  <Barra pct={(m.saidas / maior) * 100} cor="var(--perigo)" />
                  <div className="item-barra-topo" style={{ marginTop: 2 }}><span /><span className="item-barra-valor negativo">{fmt(m.saidas)}</span></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card titulo="Clientes por volume de gastos" icone="🏆" semPadding>
        {usuarios.length === 0 ? <Vazio icone="👥" texto="Nenhum cliente no seu escopo ainda." /> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr><th>Cliente</th><th>Código</th><th className="num">Entradas</th><th className="num">Saídas</th><th className="num">Saldo</th><th className="num">Transações</th></tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="clicavel" onClick={() => onSelecionarUsuario(u.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelecionarUsuario(u.id)}>
                    <td><strong>{u.nome}</strong><div className="texto-suave texto-pequeno">{u.email}</div></td>
                    <td>{u.codigoCliente ? <span className="codigo-cliente" style={{ fontSize: 11 }}>{u.codigoCliente}</span> : '—'}</td>
                    <td className="num positivo">{fmt(u.totalEntradas)}</td>
                    <td className="num negativo">{fmt(u.totalSaidas)}</td>
                    <td className={`num ${u.saldoLiquido >= 0 ? 'positivo' : 'negativo'}`}><strong>{fmt(u.saldoLiquido)}</strong></td>
                    <td className="num">{u.totalTransacoes}</td>
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
