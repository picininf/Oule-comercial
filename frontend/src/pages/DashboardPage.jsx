import React, { useMemo, useRef, useState } from 'react';
import { Card, Metrica, ListaConclusoes, Vazio, Carregando, Barra, Alerta, useValores } from '../components/ui';
import MenuExportar from '../components/MenuExportar';
import AvisoVencimentos from '../components/AvisoVencimentos';
import ResumoSonhos from '../components/ResumoSonhos';
import ComparativoPerfil from '../components/ComparativoPerfil';
import { useApi } from '../hooks/useApi';
import { resumir, getValorAjustado, ehTransferencia } from '../lib/finance';
import { categoriaInfo, TIPOS_GASTO } from '../lib/categorias';
import { formatarData, formatarMes, formatarMoeda, formatarPct, mesAtual, qs, somarMeses, ultimoDiaDoMes } from '../lib/format';

const VISOES = [
  { id: 'categorias', nome: 'Categorias' },
  { id: 'tipos', nome: 'Tipos' },
  { id: 'comparar', nome: 'Comparar' },
];

function variacao(atual, anterior) {
  if (!anterior) return null;
  return ((atual / anterior) - 1) * 100;
}

/**
 * Início do cliente (ou de um cliente, quando aberto pela equipe): o mês
 * em números, sonhos, para onde foi o dinheiro (inclui a antiga aba
 * "Análise de Gastos"), dicas e últimas movimentações.
 */
export default function DashboardPage({ userId = null, onNavegar }) {
  const { fmt } = useValores();
  const painelRef = useRef(null);
  const hoje = mesAtual();
  const [mes, setMes] = useState(hoje);
  const [visao, setVisao] = useState('categorias');
  const mesAnterior = somarMeses(mes, -1);

  const { dados: transacoes, carregando, erro } = useApi(`/transacoes${qs({ userId, de: `${mesAnterior}-01`, ate: ultimoDiaDoMes(mes) })}`);
  const { dados: dicas, carregando: carregandoDicas } = useApi(`/analises/dicas${qs({ userId })}`);

  const { doMes, doAnterior, transferenciasNoMes, ultimas } = useMemo(() => {
    const lista = transacoes || [];
    const doMesLista = lista.filter((t) => String(t.data_competencia || t.data_transacao).startsWith(mes));
    const anteriorLista = lista.filter((t) => String(t.data_competencia || t.data_transacao).startsWith(mesAnterior));
    return {
      doMes: resumir(doMesLista),
      doAnterior: resumir(anteriorLista),
      transferenciasNoMes: doMesLista.filter(ehTransferencia).length,
      ultimas: doMesLista
        .filter((t) => !ehTransferencia(t))
        .sort((a, b) => String(b.data_competencia || b.data_transacao).localeCompare(String(a.data_competencia || a.data_transacao)))
        .slice(0, 6),
    };
  }, [transacoes, mes, mesAnterior]);

  const categorias = Object.entries(doMes.porCategoria).sort((a, b) => b[1] - a[1]);
  const varSaidas = variacao(doMes.saidas, doAnterior.saidas);

  const dadosExportacao = () => ({
    subtitulo: `Resumo de ${formatarMes(mes)}`,
    resumo: [
      { rotulo: 'Entradas', valor: formatarMoeda(doMes.entradas) },
      { rotulo: 'Saídas', valor: formatarMoeda(doMes.saidas) },
      { rotulo: 'Saldo', valor: formatarMoeda(doMes.saldo) },
    ],
    colunas: [
      { titulo: 'Categoria', largura: 24, valor: (l) => l[0] },
      { titulo: 'Total no mês', tipo: 'moeda', valor: (l) => l[1] },
      { titulo: '% dos gastos', valor: (l) => formatarPct(doMes.saidas ? (l[1] / doMes.saidas) * 100 : 0) },
    ],
    linhas: categorias,
  });

  if (carregando && !transacoes) return <Carregando texto="Montando o seu resumo..." />;
  if (erro && !transacoes) return <Alerta>{erro}</Alerta>;

  return (
    <div className="pilha" ref={painelRef}>
      <AvisoVencimentos userId={userId} onVerTodas={onNavegar ? () => onNavegar('pagamentos') : undefined} />

      <div className="linha-entre nao-exportar">
        <div className="linha">
          <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setMes((m) => somarMeses(m, -1))} aria-label="Mês anterior">←</button>
          <h3 style={{ minWidth: 140, textAlign: 'center' }}>{formatarMes(mes)}{carregando ? ' ⏳' : ''}</h3>
          <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setMes((m) => somarMeses(m, 1))} disabled={mes >= hoje} aria-label="Próximo mês">→</button>
          {mes !== hoje && <button type="button" className="btn btn-fantasma btn-pequeno" onClick={() => setMes(hoje)}>Voltar para o mês atual</button>}
        </div>
        <MenuExportar nome="inicio" titulo={`Resumo — ${formatarMes(mes)}`} dados={dadosExportacao} alvoPng={painelRef} />
      </div>

      <div className="metricas">
        <Metrica rotulo="Entrou" icone="📥" valor={fmt(doMes.entradas)} tom="positivo" detalhe={`Mês anterior: ${fmt(doAnterior.entradas)}`} />
        <Metrica
          rotulo="Saiu"
          icone="📤"
          valor={fmt(doMes.saidas)}
          tom="negativo"
          detalhe={varSaidas === null ? `Mês anterior: ${fmt(doAnterior.saidas)}` : `${varSaidas >= 0 ? '▲' : '▼'} ${formatarPct(Math.abs(varSaidas), 0)} vs. mês anterior`}
        />
        <Metrica rotulo="Sobrou" icone="💰" valor={fmt(doMes.saldo)} tom={doMes.saldo >= 0 ? 'positivo' : 'negativo'} />
        <Metrica
          rotulo="Quanto guardei"
          icone="🐷"
          valor={formatarPct(doMes.taxaPoupanca)}
          tom={doMes.taxaPoupanca >= 20 ? 'positivo' : doMes.taxaPoupanca >= 0 ? 'atencao' : 'negativo'}
          detalhe="do que entrou · meta: 20% ou mais"
        />
      </div>

      <div className="grade-lateral">
        <Card
          titulo="Para onde foi o dinheiro"
          icone="📊"
          acoes={
            <div className="segmentado nao-exportar" role="group" aria-label="Ver por">
              {VISOES.map((v) => (
                <button key={v.id} type="button" className={visao === v.id ? 'ativo' : ''} onClick={() => setVisao(v.id)}>{v.nome}</button>
              ))}
            </div>
          }
        >
          {visao === 'comparar' ? (
            <ComparativoPerfil userId={userId} onNavegar={onNavegar} />
          ) : doMes.saidas === 0 ? (
            <Vazio
              icone="📊"
              titulo="Nenhum gasto neste mês"
              texto={
                transferenciasNoMes > 0
                  ? `Há ${transferenciasNoMes} lançamento(s) em Transferências, que não contam como gasto. Se foi um pagamento a outra pessoa, mude a categoria em Transações.`
                  : 'Conecte o banco, importe um extrato ou lance seus gastos.'
              }
              acao={
                doAnterior.saidas > 0 ? (
                  <button type="button" className="btn btn-secundario" onClick={() => setMes(mesAnterior)}>Ver {formatarMes(mesAnterior)}</button>
                ) : null
              }
            />
          ) : visao === 'tipos' ? (
            <div className="lista-barras">
              {TIPOS_GASTO.map((t) => {
                const v = doMes.porTipoGasto[t.id] || 0;
                const pct = (v / doMes.saidas) * 100;
                return (
                  <div key={t.id}>
                    <div className="item-barra-topo">
                      <span className="item-barra-nome">{t.nome}</span>
                      <span className="item-barra-valor">{fmt(v)} <small>({formatarPct(pct, 0)})</small></span>
                    </div>
                    <Barra pct={pct} cor={t.cor} />
                  </div>
                );
              })}
              {doMes.porTipoGasto.nao_classificado > 0 && (
                <p className="texto-suave texto-pequeno">{fmt(doMes.porTipoGasto.nao_classificado)} sem tipo definido — ajuste em Transações.</p>
              )}
            </div>
          ) : (
            <div className="lista-barras">
              {categorias.map(([cat, valor]) => {
                const info = categoriaInfo(cat);
                const pct = (valor / doMes.saidas) * 100;
                const antes = doAnterior.porCategoria[cat] || 0;
                return (
                  <div key={cat}>
                    <div className="item-barra-topo">
                      <span className="item-barra-nome">{info.icone} {cat}</span>
                      <span className="item-barra-valor">
                        {fmt(valor)} <small>({formatarPct(pct, 0)})</small>
                        {antes > 0 && Math.abs(valor - antes) / antes > 0.2 && (
                          <small className={valor > antes ? 'negativo' : 'positivo'} title={`Mês anterior: ${formatarMoeda(antes)}`}> {valor > antes ? '▲' : '▼'}</small>
                        )}
                      </span>
                    </div>
                    <Barra pct={pct} cor={info.cor} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <ResumoSonhos userId={userId} onNavegar={onNavegar} />
      </div>

      <div className="grade-lateral">
        <Card titulo="Dicas para você" icone="🧠">
          {carregandoDicas && !dicas ? <Carregando texto="Analisando seus hábitos..." /> : (dicas || []).length === 0 ? (
            <Vazio icone="🧠" texto="Com mais alguns lançamentos, aparecem dicas personalizadas aqui." />
          ) : <ListaConclusoes itens={dicas} />}
        </Card>

        <Card
          titulo="Últimas movimentações"
          icone="⚡"
          acoes={onNavegar && <button type="button" className="btn btn-fantasma btn-pequeno nao-exportar" onClick={() => onNavegar('transacoes')}>Ver todas →</button>}
        >
          {ultimas.length === 0 ? (
            <Vazio icone="⚡" texto="Sem movimentações neste mês." />
          ) : (
            <ul className="lista-contas">
              {ultimas.map((t) => {
                const v = getValorAjustado(t);
                return (
                  <li key={t.id} className="linha-entre" style={{ padding: '10px 0', borderBottom: '1px solid var(--borda)', flexWrap: 'nowrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: 'var(--texto-forte)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {categoriaInfo(t.categoria).icone} {t.descricao}
                      </strong>
                      <div className="texto-suave texto-pequeno">{formatarData(t.data_competencia || t.data_transacao)} · {t.categoria}</div>
                    </div>
                    <strong className={v > 0 ? 'positivo' : 'negativo'} style={{ whiteSpace: 'nowrap' }}>{v > 0 ? '+' : '−'} {fmt(Math.abs(v))}</strong>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
