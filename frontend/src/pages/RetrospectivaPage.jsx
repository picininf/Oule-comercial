import React, { useRef, useState } from 'react';
import { Carregando, Alerta, Card, Vazio, useValores } from '../components/ui';
import MenuExportar from '../components/MenuExportar';
import { useApi } from '../hooks/useApi';
import { formatarData, formatarMes, formatarPct, formatarMoeda, qs } from '../lib/format';

/**
 * Bônus | Ano — Retrospectiva no estilo "seu ano em números": cinema,
 * delivery, corridas de app, lugar favorito, mês mais caro...
 * Exporta como imagem para compartilhar.
 */
export default function RetrospectivaPage({ userId = null }) {
  const { fmt } = useValores();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const ref = useRef(null);
  const { dados: r, carregando, erro } = useApi(`/analises/retrospectiva${qs({ ano, userId })}`);

  const dadosExportacao = () => ({
    subtitulo: `Retrospectiva ${ano}`,
    resumo: r && !r.vazio ? [
      { rotulo: 'Entradas', valor: formatarMoeda(r.totais.entradas) },
      { rotulo: 'Saídas', valor: formatarMoeda(r.totais.saidas) },
      { rotulo: 'Guardado', valor: formatarMoeda(r.totais.saldo) },
    ] : [],
    colunas: [
      { titulo: 'Categoria', chave: 'categoria', largura: 24 },
      { titulo: 'Total no ano', tipo: 'moeda', chave: 'total' },
      { titulo: '% dos gastos', valor: (c) => formatarPct(c.pct) },
    ],
    linhas: r?.topCategorias || [],
  });

  return (
    <div className="pilha">
      <div className="linha-entre">
        <select className="input" style={{ width: 140 }} value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano">
          {Array.from({ length: 6 }, (_, i) => anoAtual - i).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <MenuExportar nome={`retrospectiva-${ano}`} titulo={`Retrospectiva ${ano}`} dados={dadosExportacao} alvoPng={ref} />
      </div>

      <Alerta>{erro}</Alerta>
      {carregando && !r ? <Carregando texto="Revivendo o seu ano..." /> : !r || r.vazio ? (
        <Card><Vazio icone="🎉" titulo={`Sem movimentações em ${ano}`} texto="A retrospectiva aparece assim que houver transações no ano." /></Card>
      ) : (
        <div className="pilha" ref={ref}>
          <div className="retro-cabecalho">
            <p className="texto-pequeno" style={{ letterSpacing: '0.2em', opacity: 0.8 }}>OULE APRESENTA</p>
            <div className="retro-ano">{ano}</div>
            <h2>o seu ano em números</h2>
            {ano === anoAtual && <p style={{ opacity: 0.8, marginTop: 6 }}>(até hoje)</p>}
          </div>

          <div className="retro">
            <div className="retro-card retro-1">
              <span className="retro-rotulo">Você guardou</span>
              <span className="retro-valor">{fmt(r.totais.saldo)}</span>
              <p>{formatarPct(r.totais.taxaPoupanca)} de tudo que entrou ({fmt(r.totais.entradas)}).</p>
            </div>
            <div className="retro-card retro-2">
              <span className="retro-rotulo">Gastou no ano</span>
              <span className="retro-valor">{fmt(r.totais.saidas)}</span>
              <p>
                Média de {fmt(r.totais.mediaMensalGastos)} por mês
                {r.variacaoGastosVsAnoAnterior !== null && <> · {r.variacaoGastosVsAnoAnterior >= 0 ? '▲' : '▼'} {formatarPct(Math.abs(r.variacaoGastosVsAnoAnterior), 0)} vs. {ano - 1}</>}.
              </p>
            </div>
            {r.topCategorias[0] && (
              <div className="retro-card retro-3">
                <span className="retro-rotulo">Categoria campeã</span>
                <span className="retro-valor">{r.topCategorias[0].icone} {r.topCategorias[0].categoria}</span>
                <p>{fmt(r.topCategorias[0].total)} — {formatarPct(r.topCategorias[0].pct)} dos seus gastos.</p>
              </div>
            )}
            {r.lugaresFavoritos[0] && (
              <div className="retro-card retro-4">
                <span className="retro-rotulo">Seu lugar favorito</span>
                <span className="retro-valor" style={{ fontSize: 22 }}>{r.lugaresFavoritos[0].nome}</span>
                <p>{r.lugaresFavoritos[0].vezes} visitas · {fmt(r.lugaresFavoritos[0].total)}</p>
              </div>
            )}
            {r.mesMaisCaro && (
              <div className="retro-card retro-5">
                <span className="retro-rotulo">Mês mais caro</span>
                <span className="retro-valor">{formatarMes(r.mesMaisCaro.mes)}</span>
                <p>{fmt(r.mesMaisCaro.total)} em gastos.{r.mesMaisEconomico && <> O mais econômico foi {formatarMes(r.mesMaisEconomico.mes)} ({fmt(r.mesMaisEconomico.total)}).</>}</p>
              </div>
            )}
            <div className="retro-card retro-6">
              <span className="retro-rotulo">Dias sem gastar nada</span>
              <span className="retro-valor">{r.diasSemGastar}</span>
              <p>{r.totais.transacoes} lançamentos registrados no ano.</p>
            </div>
            {r.diversao.map((d, i) => (
              <div key={d.id} className={`retro-card retro-${(i % 5) + 1}`}>
                <span className="retro-rotulo">{d.icone} {d.nome}</span>
                <span className="retro-valor">{d.vezes}x</span>
                <p>{fmt(d.total)} no total{d.id === 'cinema' ? ' — pipoca inclusa? 🍿' : ''}.</p>
              </div>
            ))}
            {r.maiorCompra && (
              <div className="retro-card retro-2">
                <span className="retro-rotulo">Maior compra</span>
                <span className="retro-valor">{fmt(r.maiorCompra.valor)}</span>
                <p>{r.maiorCompra.descricao} · {formatarData(r.maiorCompra.data)}</p>
              </div>
            )}
            {r.sonhosRealizados.length > 0 && (
              <div className="retro-card retro-3">
                <span className="retro-rotulo">Sonhos realizados</span>
                <span className="retro-valor">🎯 {r.sonhosRealizados.length}</span>
                <p>{r.sonhosRealizados.join(', ')}</p>
              </div>
            )}
            {r.topCategorias.length > 1 && (
              <div className="retro-card retro-6">
                <span className="retro-rotulo">Top categorias</span>
                <ol>{r.topCategorias.slice(0, 5).map((c) => <li key={c.categoria}>{c.icone} {c.categoria} — {fmt(c.total)}</li>)}</ol>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
