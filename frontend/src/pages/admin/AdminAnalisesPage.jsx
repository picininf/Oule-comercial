import React, { useRef, useState } from 'react';
import { Card, Metrica, Carregando, Alerta, Vazio, Barra, Abas, useValores } from '../../components/ui';
import MenuExportar from '../../components/MenuExportar';
import { useApi } from '../../hooks/useApi';
import { categoriaInfo } from '../../lib/categorias';
import { formatarMoeda, formatarPct, qs } from '../../lib/format';

const DIMENSOES = [
  { id: 'estado', nome: 'Por estado', icone: '🗺️' },
  { id: 'faixaEtaria', nome: 'Por faixa etária', icone: '🎂' },
  { id: 'formaTrabalho', nome: 'Por forma de trabalho', icone: '💼' },
];

/**
 * Análise de gastos por categoria cruzada por estado, faixa etária e
 * forma de trabalho (cartão "Análise de gastos por categoria por
 * completo"). Só com os clientes do escopo de quem consulta.
 */
export default function AdminAnalisesPage() {
  const { fmt } = useValores();
  const ref = useRef(null);
  const [meses, setMeses] = useState(3);
  const [dimensao, setDimensao] = useState('estado');
  const [filtros, setFiltros] = useState({ estado: '', faixa: '', formaTrabalho: '', tag: '' });
  const { dados: opcoes } = useApi('/perfil/opcoes');
  const { dados, carregando, erro } = useApi(`/analises/segmentos${qs({ meses, ...filtros })}`);

  const set = (c) => (e) => setFiltros((f) => ({ ...f, [c]: e.target.value }));
  const grupos = dados?.[dimensao] || [];

  const dadosExportacao = () => ({
    subtitulo: `Últimos ${meses} meses · ${DIMENSOES.find((d) => d.id === dimensao).nome.toLowerCase()}`,
    resumo: dados ? [{ rotulo: 'Clientes no filtro', valor: String(dados.clientesNoFiltro) }, { rotulo: 'Com dados', valor: String(dados.clientesComDados) }] : [],
    abas: dados ? [
      {
        nome: 'Segmentos',
        colunas: [
          { titulo: 'Grupo', chave: 'grupo', largura: 22 },
          { titulo: 'Clientes', chave: 'clientes' },
          { titulo: 'Renda média/mês', tipo: 'moeda', chave: 'rendaMensalMedia' },
          { titulo: 'Gasto médio/mês', tipo: 'moeda', chave: 'gastoMensalMedio' },
          { titulo: 'Poupança', valor: (g) => (g.taxaPoupanca === null ? '' : formatarPct(g.taxaPoupanca)) },
          { titulo: 'Maior categoria', largura: 22, valor: (g) => g.topCategorias[0]?.categoria || '' },
        ],
        linhas: grupos,
      },
      {
        nome: 'Categorias',
        colunas: [
          { titulo: 'Categoria', chave: 'categoria', largura: 24 },
          { titulo: 'Média por cliente/mês', tipo: 'moeda', chave: 'mediaPorCliente' },
          { titulo: '% dos gastos', valor: (c) => formatarPct(c.pct) },
        ],
        linhas: dados.categorias,
      },
    ] : null,
    colunas: [
      { titulo: 'Grupo', chave: 'grupo', largura: 22 },
      { titulo: 'Clientes', chave: 'clientes' },
      { titulo: 'Renda média/mês', tipo: 'moeda', chave: 'rendaMensalMedia' },
      { titulo: 'Gasto médio/mês', tipo: 'moeda', chave: 'gastoMensalMedio' },
      { titulo: 'Poupança', valor: (g) => (g.taxaPoupanca === null ? '' : formatarPct(g.taxaPoupanca)) },
    ],
    linhas: grupos,
  });

  return (
    <div className="pilha" ref={ref}>
      <Card titulo="Filtros" icone="🎛️" acoes={<MenuExportar nome="analise-por-perfil" titulo="Análise de gastos por perfil" dados={dadosExportacao} alvoPng={ref} />}>
        <div className="filtros">
          <select className="input" value={meses} onChange={(e) => setMeses(Number(e.target.value))} aria-label="Período">
            {[3, 6, 12].map((m) => <option key={m} value={m}>Últimos {m} meses</option>)}
          </select>
          <select className="input" value={filtros.estado} onChange={set('estado')} aria-label="Estado">
            <option value="">Todos os estados</option>
            {(opcoes?.ufs || []).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select className="input" value={filtros.faixa} onChange={set('faixa')} aria-label="Faixa etária">
            <option value="">Todas as idades</option>
            {(opcoes?.faixasEtarias || []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <select className="input" value={filtros.formaTrabalho} onChange={set('formaTrabalho')} aria-label="Forma de trabalho">
            <option value="">Todas as formas de trabalho</option>
            {(opcoes?.formasTrabalho || []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <input className="input" placeholder="TAG (ex.: MEI)" value={filtros.tag} onChange={set('tag')} aria-label="TAG" />
        </div>
      </Card>

      <Alerta>{erro}</Alerta>
      {carregando && !dados ? <Carregando texto="Cruzando os dados..." /> : dados && (
        <>
          <div className="metricas">
            <Metrica rotulo="Clientes no filtro" icone="👥" valor={dados.clientesNoFiltro} tom="roxo" />
            <Metrica rotulo="Com transações no período" icone="🧾" valor={dados.clientesComDados} />
            <Metrica rotulo="Gasto médio por cliente" icone="📤" valor={fmt(dados.categorias.reduce((s, c) => s + c.mediaPorCliente, 0))} tom="negativo" detalhe="por mês" />
          </div>

          <div className="grade-2">
            <Card titulo="Gasto médio por categoria" icone="📊">
              {dados.categorias.length === 0 ? <Vazio texto="Sem gastos no período." /> : (
                <div className="lista-barras">
                  {dados.categorias.slice(0, 12).map((c) => {
                    const info = categoriaInfo(c.categoria);
                    return (
                      <div key={c.categoria}>
                        <div className="item-barra-topo"><span className="item-barra-nome">{info.icone} {c.categoria}</span><span className="item-barra-valor">{fmt(c.mediaPorCliente)} <small>({formatarPct(c.pct)})</small></span></div>
                        <Barra pct={c.pct} cor={info.cor} />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
            <Card titulo="Tipos de gasto (média por cliente)" icone="🧩">
              <div className="lista-barras">
                {dados.porTipoGasto.map((t) => {
                  const total = dados.porTipoGasto.reduce((s, x) => s + x.mediaPorCliente, 0) || 1;
                  return (
                    <div key={t.tipo}>
                      <div className="item-barra-topo"><span className="item-barra-nome">{t.nome}</span><span className="item-barra-valor">{fmt(t.mediaPorCliente)}</span></div>
                      <Barra pct={(t.mediaPorCliente / total) * 100} />
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <Card titulo="Comparação entre grupos" icone="🔍" semPadding>
            <div style={{ padding: '12px 20px 0' }}><Abas abas={DIMENSOES} ativa={dimensao} onTrocar={setDimensao} /></div>
            {grupos.length === 0 ? <Vazio texto="Sem dados para este recorte. Complete o cadastro dos clientes (UF, nascimento, forma de trabalho)." /> : (
              <div className="tabela-wrapper">
                <table className="tabela">
                  <thead>
                    <tr><th>Grupo</th><th className="num">Clientes</th><th className="num">Renda/mês</th><th className="num">Gasto/mês</th><th className="num">Poupança</th><th>Principais categorias</th></tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <tr key={g.grupo}>
                        <td><strong>{g.grupo}</strong></td>
                        <td className="num">{g.clientes}</td>
                        <td className="num">{fmt(g.rendaMensalMedia)}</td>
                        <td className="num">{fmt(g.gastoMensalMedio)}</td>
                        <td className={`num ${g.taxaPoupanca >= 20 ? 'positivo' : g.taxaPoupanca < 0 ? 'negativo' : ''}`}>{g.taxaPoupanca === null ? '—' : formatarPct(g.taxaPoupanca)}</td>
                        <td>
                          <div className="tags">
                            {g.topCategorias.slice(0, 3).map((c) => <span key={c.categoria} className="tag" title={formatarMoeda(c.media)}>{categoriaInfo(c.categoria).icone} {c.categoria} {formatarPct(c.pct, 0)}</span>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
