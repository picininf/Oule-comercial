import React, { useRef, useState } from 'react';
import { Card, Metrica, Carregando, Alerta, Vazio, Barra, useValores } from '../components/ui';
import MenuExportar from '../components/MenuExportar';
import { useApi } from '../hooks/useApi';
import { categoriaInfo, TIPOS_GASTO } from '../lib/categorias';
import { formatarMoeda, formatarPct, qs } from '../lib/format';

/**
 * Análise de gastos por categoria, com comparação anônima contra pessoas
 * parecidas (mesmo estado, faixa etária e forma de trabalho).
 */
export default function AnalisesPage({ userId = null, onNavegar }) {
  const { fmt } = useValores();
  const [meses, setMeses] = useState(3);
  const ref = useRef(null);
  const { dados, carregando, erro } = useApi(`/analises/comparativo${qs({ meses, userId })}`);
  const [grupoId, setGrupoId] = useState(null);

  const grupos = dados?.grupos || [];
  const grupo = grupos.find((g) => g.id === grupoId && g.suficiente) || grupos.find((g) => g.suficiente);
  const meu = dados?.meu;
  const totalTipos = meu ? Object.values(meu.porTipoGasto).reduce((s, v) => s + v, 0) : 0;

  const dadosExportacao = () => ({
    subtitulo: `Média mensal dos últimos ${meses} meses${grupo ? ` · comparado com: ${grupo.nome}` : ''}`,
    resumo: meu ? [{ rotulo: 'Meu gasto mensal', valor: formatarMoeda(meu.gastoMensal) }, { rotulo: 'Grupo', valor: grupo ? formatarMoeda(grupo.gastoMensalMedio) : '—' }] : [],
    colunas: [
      { titulo: 'Categoria', chave: 'categoria', largura: 24 },
      { titulo: 'Meu gasto/mês', tipo: 'moeda', chave: 'meu' },
      { titulo: 'Meu % dos gastos', valor: (c) => formatarPct(c.meuPct) },
      { titulo: 'Média do grupo/mês', tipo: 'moeda', chave: 'media' },
      { titulo: '% do grupo', valor: (c) => formatarPct(c.pctDosGastos) },
    ],
    linhas: grupo?.categorias || [],
  });

  return (
    <div className="pilha" ref={ref}>
      <div className="linha-entre">
        <div className="segmentado" role="group" aria-label="Período">
          {[3, 6, 12].map((m) => <button key={m} type="button" className={meses === m ? 'ativo' : ''} onClick={() => setMeses(m)}>{m} meses</button>)}
        </div>
        <MenuExportar nome="analise-gastos" titulo="Análise de gastos" dados={dadosExportacao} alvoPng={ref} />
      </div>

      <Alerta>{erro}</Alerta>
      {carregando && !dados ? <Carregando texto="Comparando seus gastos..." /> : !meu ? (
        <Card><Vazio icone="📈" titulo="Ainda sem gastos no período" texto="Assim que houver transações, mostramos como você gasta por categoria e como isso se compara a pessoas com perfil parecido." /></Card>
      ) : (
        <>
          <div className="metricas">
            <Metrica rotulo="Meu gasto médio/mês" icone="📤" valor={fmt(meu.gastoMensal)} tom="negativo" />
            <Metrica rotulo="Minha renda média/mês" icone="📥" valor={fmt(meu.rendaMensal)} tom="positivo" />
            <Metrica rotulo="Minha taxa de poupança" icone="🎯" valor={meu.taxaPoupanca === null ? '—' : formatarPct(meu.taxaPoupanca)} tom={meu.taxaPoupanca >= 20 ? 'positivo' : 'atencao'} />
            {grupo && <Metrica rotulo={`Poupança média — ${grupo.nome}`} icone="👥" valor={grupo.taxaPoupancaMedia === null ? '—' : formatarPct(grupo.taxaPoupancaMedia)} detalhe={`${grupo.pessoas} pessoas`} />}
          </div>

          <Card titulo="Para onde vai meu dinheiro (tipos de gasto)" icone="🧩">
            <div className="lista-barras">
              {TIPOS_GASTO.map((t) => {
                const v = meu.porTipoGasto[t.id] || 0;
                const pct = totalTipos ? (v / totalTipos) * 100 : 0;
                return (
                  <div key={t.id}>
                    <div className="item-barra-topo"><span className="item-barra-nome">{t.nome}</span><span className="item-barra-valor">{fmt(v)}/mês <small>({formatarPct(pct, 0)})</small></span></div>
                    <Barra pct={pct} cor={t.cor} />
                  </div>
                );
              })}
            </div>
          </Card>

          <Card titulo="Eu x pessoas com perfil parecido" icone="👥">
            <div className="tags" style={{ marginBottom: 14 }}>
              {grupos.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`chip ${grupo?.id === g.id ? 'ativo' : ''}`}
                  disabled={!g.suficiente}
                  title={g.suficiente ? '' : `Só ${g.pessoas} pessoas com dados — mostramos grupos a partir de ${dados.tamanhoMinimoGrupo} para preservar a privacidade.`}
                  onClick={() => setGrupoId(g.id)}
                  style={!g.suficiente ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                  {g.nome}{g.suficiente ? ` (${g.pessoas})` : ' 🔒'}
                </button>
              ))}
            </div>
            {!grupo ? (
              <Vazio
                icone="🔒"
                titulo="Ainda não há pessoas suficientes para comparar"
                texto={`Por privacidade, só comparamos com grupos de pelo menos ${dados.tamanhoMinimoGrupo} pessoas. Complete seu cadastro (estado, nascimento e forma de trabalho) para entrar nos grupos.`}
                acao={onNavegar && <button type="button" className="btn btn-secundario" onClick={() => onNavegar('perfil')}>Completar cadastro</button>}
              />
            ) : (
              <div className="tabela-wrapper">
                <table className="tabela">
                  <thead>
                    <tr><th>Categoria</th><th className="num">Eu (R$/mês)</th><th className="num">Grupo (R$/mês)</th><th>Diferença</th></tr>
                  </thead>
                  <tbody>
                    {grupo.categorias.map((c) => {
                      const dif = c.media > 0 ? ((c.meu / c.media) - 1) * 100 : null;
                      return (
                        <tr key={c.categoria}>
                          <td><span className="tag-categoria">{categoriaInfo(c.categoria).icone} {c.categoria}</span></td>
                          <td className="num">{fmt(c.meu)} <span className="texto-suave texto-pequeno">({formatarPct(c.meuPct, 0)})</span></td>
                          <td className="num">{fmt(c.media)} <span className="texto-suave texto-pequeno">({formatarPct(c.pctDosGastos, 0)})</span></td>
                          <td>
                            {dif === null ? '—' : (
                              <span className={`tag ${dif > 25 ? 'tag-perigo' : dif < -25 ? 'tag-sucesso' : ''}`}>
                                {dif > 0 ? '▲' : '▼'} {formatarPct(Math.abs(dif), 0)} {dif > 0 ? 'acima' : 'abaixo'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="texto-suave texto-pequeno" style={{ marginTop: 10 }}>Comparação anônima: ninguém vê os seus dados individuais, e você também não vê os de ninguém.</p>
          </Card>
        </>
      )}
    </div>
  );
}
