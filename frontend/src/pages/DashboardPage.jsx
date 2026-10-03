import React, { useMemo, useRef } from 'react';
import { Card, Metrica, ListaConclusoes, Vazio, Carregando, Barra, Alerta, useValores } from '../components/ui';
import MenuExportar from '../components/MenuExportar';
import AvisoVencimentos from '../components/AvisoVencimentos';
import { useApi } from '../hooks/useApi';
import { resumir, getValorAjustado, ehTransferencia } from '../lib/finance';
import { categoriaInfo, TIPOS_GASTO } from '../lib/categorias';
import { formatarData, formatarMes, formatarMoeda, formatarPct, mesAtual, qs, somarMeses } from '../lib/format';

function variacao(atual, anterior) {
  if (!anterior) return null;
  return ((atual / anterior) - 1) * 100;
}

/** Visão Geral do cliente (ou de um cliente, quando aberta pela equipe). */
export default function DashboardPage({ userId = null, onNavegar }) {
  const { fmt } = useValores();
  const painelRef = useRef(null);
  const mes = mesAtual();
  const mesAnterior = somarMeses(mes, -1);

  const { dados: transacoes, carregando, erro } = useApi(`/transacoes${qs({ userId, de: `${mesAnterior}-01` })}`);
  const { dados: dicas, carregando: carregandoDicas } = useApi(`/analises/dicas${qs({ userId })}`);

  const { doMes, doAnterior } = useMemo(() => {
    const lista = transacoes || [];
    const doMesLista = lista.filter((t) => String(t.data_competencia || t.data_transacao).startsWith(mes));
    const anteriorLista = lista.filter((t) => String(t.data_competencia || t.data_transacao).startsWith(mesAnterior));
    return { doMes: resumir(doMesLista), doAnterior: resumir(anteriorLista) };
  }, [transacoes, mes, mesAnterior]);

  const categorias = Object.entries(doMes.porCategoria).sort((a, b) => b[1] - a[1]);
  const ultimas = (transacoes || [])
    .filter((t) => !ehTransferencia(t))
    .sort((a, b) => String(b.data_competencia || b.data_transacao).localeCompare(String(a.data_competencia || a.data_transacao)))
    .slice(0, 6);
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

  if (carregando && !transacoes) return <Carregando texto="Montando sua visão geral..." />;
  if (erro && !transacoes) return <Alerta>{erro}</Alerta>;

  return (
    <div className="pilha" ref={painelRef}>
      <AvisoVencimentos userId={userId} onVerTodas={onNavegar ? () => onNavegar('pagamentos') : undefined} />

      <div className="linha-entre nao-exportar">
        <h3>{formatarMes(mes)}</h3>
        <MenuExportar nome="visao-geral" titulo={`Visão geral — ${formatarMes(mes)}`} dados={dadosExportacao} alvoPng={painelRef} />
      </div>

      <div className="metricas">
        <Metrica rotulo="Entradas do mês" icone="📥" valor={fmt(doMes.entradas)} tom="positivo" detalhe={`Mês passado: ${fmt(doAnterior.entradas)}`} />
        <Metrica
          rotulo="Saídas do mês"
          icone="📤"
          valor={fmt(doMes.saidas)}
          tom="negativo"
          detalhe={varSaidas === null ? `Mês passado: ${fmt(doAnterior.saidas)}` : `${varSaidas >= 0 ? '▲' : '▼'} ${formatarPct(Math.abs(varSaidas), 0)} vs. mês passado`}
        />
        <Metrica rotulo="Saldo do mês" icone="💰" valor={fmt(doMes.saldo)} tom={doMes.saldo >= 0 ? 'positivo' : 'negativo'} />
        <Metrica
          rotulo="Taxa de poupança"
          icone="🎯"
          valor={formatarPct(doMes.taxaPoupanca)}
          tom={doMes.taxaPoupanca >= 20 ? 'positivo' : doMes.taxaPoupanca >= 0 ? 'atencao' : 'negativo'}
          detalhe="Meta saudável: 20% ou mais"
        />
      </div>

      <div className="grade-lateral">
        <Card titulo="Dicas inteligentes" icone="🧠">
          {carregandoDicas && !dicas ? <Carregando texto="Analisando seus hábitos..." /> : <ListaConclusoes itens={dicas || []} />}
        </Card>

        <Card titulo="Tipos de gasto do mês" icone="🧩">
          {doMes.saidas === 0 ? (
            <Vazio icone="🧩" texto="Sem gastos neste mês ainda." />
          ) : (
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
          )}
        </Card>
      </div>

      <div className="grade-lateral">
        <Card titulo="Despesas por categoria" icone="📊" acoes={<span className="tag">{categorias.length} categorias</span>}>
          {categorias.length === 0 ? (
            <Vazio icone="📊" titulo="Nenhuma despesa neste mês" texto="Conecte o banco, importe um extrato ou lance seus gastos." />
          ) : (
            <div className="lista-barras">
              {categorias.map(([cat, valor]) => {
                const info = categoriaInfo(cat);
                const pct = doMes.saidas > 0 ? (valor / doMes.saidas) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="item-barra-topo">
                      <span className="item-barra-nome">{info.icone} {cat}</span>
                      <span className="item-barra-valor">{fmt(valor)} <small>({formatarPct(pct)})</small></span>
                    </div>
                    <Barra pct={pct} cor={info.cor} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card titulo="Últimas movimentações" icone="⚡">
          {ultimas.length === 0 ? (
            <Vazio icone="⚡" texto="Sem movimentações recentes." />
          ) : (
            <ul className="lista-contas">
              {ultimas.map((t) => {
                const v = getValorAjustado(t);
                return (
                  <li key={t.id} className="linha-entre" style={{ padding: '10px 0', borderBottom: '1px solid var(--borda)' }}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: 'var(--texto-forte)' }}>{categoriaInfo(t.categoria).icone} {t.descricao}</strong>
                      <div className="texto-suave texto-pequeno">{formatarData(t.data_competencia || t.data_transacao)} · {t.categoria}</div>
                    </div>
                    <strong className={v > 0 ? 'positivo' : 'negativo'}>{v > 0 ? '+' : '−'} {fmt(Math.abs(v))}</strong>
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
