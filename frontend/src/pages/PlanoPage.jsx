import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Metrica, ListaConclusoes, Carregando, Alerta, Modal, Campo, useValores, useToast } from '../components/ui';
import MenuExportar from '../components/MenuExportar';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, categoriaInfo } from '../lib/categorias';
import { formatarMes, formatarMoeda, formatarPct, mesAtual, qs, somarMeses } from '../lib/format';

const ESTADO_ROTULO = { realizado: 'Realizado', em_andamento: 'Em andamento', futuro: 'Previsto' };
const FONTE_ROTULO = { plano: 'pelo plano', historico: 'pela média recente', sem_dados: 'sem dados', realizado: '' };

/**
 * Plano x Vida Real — ano atual, anos anteriores e ANOS SEGUINTES.
 * O planejador (ou o próprio cliente) monta o orçamento mês a mês,
 * incluindo receitas, e o sistema compara com o realizado, considera o
 * que já está comprometido (parcelas e contas fixas) e tira conclusões.
 */
export default function PlanoPage({ userId = null }) {
  const { fmt } = useValores();
  const anoAtual = Number(mesAtual().slice(0, 4));
  const [ano, setAno] = useState(anoAtual);
  const [regime, setRegime] = useState('competencia');
  const [mesSelecionado, setMesSelecionado] = useState(mesAtual());
  const [editandoMes, setEditandoMes] = useState(null);
  const [copiandoMes, setCopiandoMes] = useState(null);
  const [premissasAbertas, setPremissasAbertas] = useState(false);
  const painelRef = useRef(null);
  const timelineRef = useRef(null);

  const { dados: painel, carregando, erro, recarregar } = useApi(`/plano/painel${qs({ ano, regime, userId })}`);

  useEffect(() => {
    // Ao trocar de ano, seleciona o mês atual (se for o ano corrente) ou janeiro.
    setMesSelecionado(ano === anoAtual ? mesAtual() : `${ano}-01`);
  }, [ano, anoAtual]);

  const mes = painel?.meses.find((m) => m.mes === mesSelecionado) || painel?.meses[0];

  // No celular a linha do tempo rola na horizontal: mantém o mês
  // selecionado (ex.: o mês atual) visível em vez de sempre mostrar janeiro.
  useEffect(() => {
    const lista = timelineRef.current;
    const ativo = lista?.querySelector('.timeline-mes.active');
    // Rola só a faixa horizontal (scrollIntoView faria a página inteira pular).
    if (lista && ativo) lista.scrollLeft = ativo.offsetLeft - lista.offsetLeft - lista.clientWidth / 2 + ativo.clientWidth / 2;
  }, [mes?.mes, painel]);
  const maior = useMemo(
    () => Math.max(1, ...(painel?.meses || []).map((m) => Math.max(m.previstoEntradas, m.previstoSaidas, m.entradas, m.saidas))),
    [painel]
  );

  const dadosExportacao = () => ({
    subtitulo: `${ano} · regime de ${regime === 'caixa' ? 'caixa' : 'competência'}`,
    resumo: painel
      ? [
          { rotulo: 'Entradas previstas', valor: formatarMoeda(painel.resumo.entradasPrevistas) },
          { rotulo: 'Saídas previstas', valor: formatarMoeda(painel.resumo.saidasPrevistas) },
          { rotulo: 'Saldo do ano', valor: formatarMoeda(painel.resumo.saldoPrevisto) },
        ]
      : [],
    colunas: [
      { titulo: 'Mês', valor: (m) => formatarMes(m.mes) },
      { titulo: 'Situação', valor: (m) => ESTADO_ROTULO[m.estado] },
      { titulo: 'Entradas reais', tipo: 'moeda', chave: 'entradas' },
      { titulo: 'Saídas reais', tipo: 'moeda', chave: 'saidas' },
      { titulo: 'Receitas planejadas', tipo: 'moeda', chave: 'planejadoReceitas' },
      { titulo: 'Despesas planejadas', tipo: 'moeda', chave: 'planejadoDespesas' },
      { titulo: 'Parcelas comprometidas', tipo: 'moeda', chave: 'comprometidoParcelas' },
      { titulo: 'Saldo previsto', tipo: 'moeda', chave: 'saldoPrevisto' },
      { titulo: 'Acumulado no ano', tipo: 'moeda', chave: 'saldoAcumulado' },
    ],
    linhas: painel?.meses || [],
  });

  return (
    <div className="pilha" ref={painelRef}>
      <div className="linha-entre">
        <div className="linha">
          <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setAno((a) => a - 1)} aria-label="Ano anterior">←</button>
          <select className="input" style={{ width: 110 }} value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano">
            {Array.from({ length: 16 }, (_, i) => anoAtual - 5 + i).map((a) => (
              <option key={a} value={a}>{a}{a > anoAtual ? ' (plano)' : ''}</option>
            ))}
          </select>
          <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setAno((a) => Math.min(a + 1, anoAtual + 10))} aria-label="Próximo ano">→</button>
          <div className="segmentado" role="group" aria-label="Regime">
            <button type="button" className={regime === 'competencia' ? 'ativo' : ''} onClick={() => setRegime('competencia')} title="Gasto conta no mês da compra">Competência</button>
            <button type="button" className={regime === 'caixa' ? 'ativo' : ''} onClick={() => setRegime('caixa')} title="Gasto conta no mês em que o dinheiro sai (vencimento da fatura)">Caixa</button>
          </div>
        </div>
        <div className="linha nao-exportar">
          <button type="button" className="btn btn-secundario" onClick={() => setPremissasAbertas(true)}>⚙️ Premissas de {ano}</button>
          <MenuExportar nome={`plano-${ano}`} titulo={`Plano x Vida Real — ${ano}`} dados={dadosExportacao} alvoPng={painelRef} />
        </div>
      </div>

      <Alerta>{erro}</Alerta>
      {carregando && !painel && <Carregando texto="Montando a linha do tempo..." />}

      {painel && (
        <>
          <div className="metricas">
            <Metrica rotulo={ano < anoAtual ? 'Entradas do ano' : 'Entradas previstas'} icone="📥" valor={fmt(painel.resumo.entradasPrevistas)} tom="positivo" />
            <Metrica rotulo={ano < anoAtual ? 'Saídas do ano' : 'Saídas previstas'} icone="📤" valor={fmt(painel.resumo.saidasPrevistas)} tom="negativo" />
            <Metrica
              rotulo="Saldo do ano"
              icone="💰"
              valor={fmt(painel.resumo.saldoPrevisto)}
              tom={painel.resumo.saldoPrevisto >= 0 ? 'positivo' : 'negativo'}
              detalhe={`Poupança ${formatarPct(painel.resumo.taxaPoupancaPrevista)} · meta ${formatarPct(painel.premissas.metaPoupancaPct, 0)}`}
            />
            <Metrica
              rotulo={painel.resumo.patrimonioFimDoAno !== null ? 'Patrimônio no fim do ano' : 'Parcelas já comprometidas'}
              icone={painel.resumo.patrimonioFimDoAno !== null ? '🏦' : '💳'}
              valor={fmt(painel.resumo.patrimonioFimDoAno ?? painel.resumo.comprometidoParcelas)}
              detalhe={painel.resumo.patrimonioFimDoAno !== null ? 'Patrimônio inicial + saldo do ano' : 'Faturas de cartão a vencer neste ano'}
            />
          </div>

          <Card titulo={`Conclusões sobre ${ano}`} icone="🧠">
            <ListaConclusoes itens={painel.conclusoes} />
          </Card>

          <Card titulo={`Linha do tempo de ${ano}`} icone="🗓️">
            <div className="timeline-meses" role="list" ref={timelineRef}>
              {painel.meses.map((m) => {
                const real = m.estado === 'realizado';
                const ent = real ? m.entradas : m.previstoEntradas;
                const sai = real ? m.saidas : m.previstoSaidas;
                const saldo = real ? m.saldo : m.saldoPrevisto;
                return (
                  <button
                    type="button"
                    role="listitem"
                    key={m.mes}
                    className={`timeline-mes ${m.mes === mes?.mes ? 'active' : ''} ${m.estado === 'futuro' ? 'futuro' : ''}`}
                    onClick={() => setMesSelecionado(m.mes)}
                    aria-label={`${m.label}: saldo ${formatarMoeda(saldo)}`}
                  >
                    <span className="timeline-mes-label">{m.label}{m.ehMesAtual ? ' •' : ''}</span>
                    <div className="timeline-mes-barras" aria-hidden="true">
                      <div className={`timeline-barra entrada ${real ? '' : 'prevista'}`} style={{ height: `${(ent / maior) * 100}%` }} />
                      <div className={`timeline-barra saida ${real ? '' : 'prevista'}`} style={{ height: `${(sai / maior) * 100}%` }} />
                    </div>
                    <span className={`timeline-mes-saldo ${saldo < 0 ? 'neg' : 'pos'}`}>{ent || sai ? fmt(saldo) : '—'}</span>
                    {m.temPlano && <span className="tag tag-atencao" style={{ fontSize: 9 }}>plano</span>}
                  </button>
                );
              })}
            </div>
            <div className="timeline-legenda">
              <span><i className="legenda-cor" style={{ background: 'var(--sucesso)' }} />Entradas</span>
              <span><i className="legenda-cor" style={{ background: 'var(--perigo)' }} />Saídas</span>
              <span><i className="legenda-cor" style={{ background: 'var(--texto-fraco)', opacity: 0.5 }} />Barras claras = previsão</span>
            </div>

            {mes && (
              <DetalheMes
                mes={mes}
                regime={regime}
                onEditar={() => setEditandoMes(mes)}
                onCopiar={() => setCopiandoMes(mes)}
              />
            )}
          </Card>
        </>
      )}

      {editandoMes && (
        <EditorOrcamento
          mes={editandoMes}
          userId={userId}
          onFechar={() => setEditandoMes(null)}
          onSalvo={recarregar}
        />
      )}
      {copiandoMes && (
        <CopiarPlano mes={copiandoMes} userId={userId} onFechar={() => setCopiandoMes(null)} onSalvo={recarregar} />
      )}
      {premissasAbertas && (
        <PremissasModal ano={ano} userId={userId} onFechar={() => setPremissasAbertas(false)} onSalvo={recarregar} />
      )}
    </div>
  );
}

function DetalheMes({ mes, regime, onEditar, onCopiar }) {
  const { fmt } = useValores();
  const real = mes.estado === 'realizado';
  const despesas = mes.categorias.filter((c) => c.grupo === 'despesa');
  const receitas = mes.categorias.filter((c) => c.grupo === 'receita');

  return (
    <div className="detalhe-mes">
      <div className="linha-entre">
        <h3>
          {formatarMes(mes.mes)} <span className="tag">{ESTADO_ROTULO[mes.estado]}</span>
          {!real && mes.fontePrevisao !== 'realizado' && <span className="texto-suave texto-pequeno"> · previsão {FONTE_ROTULO[mes.fontePrevisao]}</span>}
        </h3>
        <div className="linha nao-exportar">
          <button type="button" className="btn btn-primario btn-pequeno" onClick={onEditar}>✏️ {mes.temPlano ? 'Editar plano' : 'Planejar mês'}</button>
          {mes.temPlano && <button type="button" className="btn btn-secundario btn-pequeno" onClick={onCopiar}>📋 Copiar para outros meses</button>}
        </div>
      </div>

      <div className="detalhe-mes-metricas">
        <div><span>Entrou</span><strong className="positivo">{fmt(mes.entradas)}</strong></div>
        <div><span>Saiu</span><strong className="negativo">{fmt(mes.saidas)}</strong></div>
        <div><span>Receita planejada</span><strong>{fmt(mes.planejadoReceitas)}</strong></div>
        <div><span>Despesa planejada</span><strong>{fmt(mes.planejadoDespesas)}</strong></div>
        {!real && <div><span>Saldo previsto</span><strong className={mes.saldoPrevisto >= 0 ? 'positivo' : 'negativo'}>{fmt(mes.saldoPrevisto)}</strong></div>}
        {(mes.comprometidoParcelas > 0 || mes.comprometidoContasFixas > 0) && (
          <div title={regime === 'competencia' ? 'No regime de competência as parcelas já foram contadas no mês da compra.' : ''}>
            <span>Já comprometido</span>
            <strong>{fmt(mes.comprometidoParcelas + mes.comprometidoContasFixas)}</strong>
            <span style={{ textTransform: 'none', fontWeight: 500 }}>parcelas {fmt(mes.comprometidoParcelas)} · contas {fmt(mes.comprometidoContasFixas)}</span>
          </div>
        )}
        <div><span>Acumulado no ano</span><strong className={mes.saldoAcumulado >= 0 ? 'positivo' : 'negativo'}>{fmt(mes.saldoAcumulado)}</strong></div>
      </div>

      {mes.alertas.length > 0 && (
        <div className="pilha" style={{ gap: 6 }}>
          {mes.alertas.map((a, i) => <div key={i} className="alerta-item">⚠️ {a}</div>)}
        </div>
      )}

      {(despesas.length > 0 || receitas.length > 0) ? (
        <div className="tabela-wrapper">
          <table className="tabela">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="num">Planejado</th>
                <th className="num">Realizado</th>
                <th className="num">Média recente</th>
                <th>Uso do plano</th>
              </tr>
            </thead>
            <tbody>
              {[...receitas, ...despesas].map((c) => {
                const pct = c.planejado > 0 ? (c.real / c.planejado) * 100 : null;
                const estourou = c.grupo === 'despesa' && pct !== null && pct > 100;
                return (
                  <tr key={c.categoria}>
                    <td><span className="tag-categoria">{categoriaInfo(c.categoria).icone} {c.categoria}</span>{c.grupo === 'receita' && <span className="tag tag-sucesso" style={{ marginLeft: 6 }}>receita</span>}</td>
                    <td className="num">{c.planejado ? fmt(c.planejado) : '—'}</td>
                    <td className={`num ${estourou ? 'negativo' : ''}`}>{c.real ? fmt(c.real) : '—'}</td>
                    <td className="num texto-suave">{c.mediaHistorica ? fmt(c.mediaHistorica) : '—'}</td>
                    <td style={{ minWidth: 120 }}>
                      {pct === null ? <span className="texto-suave texto-pequeno">sem plano</span> : (
                        <div className="linha" style={{ flexWrap: 'nowrap' }}>
                          <div style={{ flex: 1 }}><div className="barra"><div className={`barra-preenchida ${estourou ? 'barra-alerta' : ''}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div></div>
                          <span className="texto-pequeno">{formatarPct(pct, 0)}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="texto-suave">Nenhum plano nem movimento neste mês. Use “Planejar mês” para definir quanto deve entrar e sair.</p>
      )}
    </div>
  );
}

function EditorOrcamento({ mes, userId, onFechar, onSalvo }) {
  const toast = useToast();
  const { fmt } = useValores();
  const [valores, setValores] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sugerindo, setSugerindo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    api.get(`/plano/orcamento${qs({ mes: mes.mes, userId })}`)
      .then((itens) => ativo && setValores(Object.fromEntries((itens || []).map((i) => [i.categoria, String(i.valorPlanejado)]))))
      .catch((e) => ativo && setErro(e.message))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [mes.mes, userId]);

  const media = Object.fromEntries(mes.categorias.map((c) => [c.categoria, c.mediaHistorica]));
  const somar = (lista) => lista.reduce((s, c) => s + (Number(valores[c.id]) || 0), 0);
  const totalReceitas = somar(CATEGORIAS_RECEITA);
  const totalDespesas = somar(CATEGORIAS_DESPESA);

  const sugerir = async () => {
    setSugerindo(true);
    try {
      const itens = await api.get(`/plano/orcamento/sugestao${qs({ meses: 3, userId })}`);
      if (!itens.length) {
        toast('Ainda não há histórico suficiente para sugerir valores.', 'info');
        return;
      }
      setValores((v) => ({ ...v, ...Object.fromEntries(itens.map((i) => [i.categoria, String(i.valorPlanejado)])) }));
      toast('Preenchido com a média dos últimos 3 meses. Ajuste o que quiser antes de salvar.', 'info');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSugerindo(false);
    }
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const itens = Object.entries(valores)
        .filter(([, v]) => Number(v) > 0)
        .map(([categoria, v]) => ({ categoria, valorPlanejado: Number(v) }));
      await api.put('/plano/orcamento', { mes: mes.mes, itens, ...(userId ? { userId } : {}) });
      toast(`Plano de ${formatarMes(mes.mes)} salvo.`);
      onSalvo();
      onFechar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const secao = (titulo, categorias) => (
    <div className="orcamento-secao">
      <h4>{titulo}</h4>
      <div className="orcamento-grid">
        {categorias.map((c) => (
          <label key={c.id} className="orcamento-item">
            <span className="campo-rotulo">{c.icone} {c.id}</span>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={valores[c.id] || ''}
              placeholder="0,00"
              onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))}
            />
            {media[c.id] > 0 && <small>média real: {fmt(media[c.id])}</small>}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Modal
      titulo={`Plano de ${formatarMes(mes.mes)}`}
      subtitulo="Quanto deve entrar e sair em cada categoria neste mês."
      largura="lg"
      onFechar={onFechar}
      rodape={
        <>
          <span className="texto-suave texto-pequeno" style={{ marginRight: 'auto' }}>
            Receitas {fmt(totalReceitas)} − Despesas {fmt(totalDespesas)} = <strong className={totalReceitas - totalDespesas >= 0 ? 'positivo' : 'negativo'}>{fmt(totalReceitas - totalDespesas)}</strong>
          </span>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-orcamento" className="btn btn-primario" disabled={salvando || carregando}>{salvando ? 'Salvando...' : 'Salvar plano'}</button>
        </>
      }
    >
      {carregando ? <Carregando /> : (
        <form id="form-orcamento" onSubmit={salvar} className="pilha">
          <Alerta>{erro}</Alerta>
          <div className="linha-entre">
            <p className="texto-suave">Deixe em branco o que não quiser planejar.</p>
            <button type="button" className="btn btn-secundario btn-pequeno" onClick={sugerir} disabled={sugerindo}>
              {sugerindo ? 'Calculando...' : '✨ Sugerir pela média dos últimos meses'}
            </button>
          </div>
          {secao('Receitas planejadas', CATEGORIAS_RECEITA)}
          {secao('Despesas planejadas', CATEGORIAS_DESPESA)}
        </form>
      )}
    </Modal>
  );
}

function CopiarPlano({ mes, userId, onFechar, onSalvo }) {
  const toast = useToast();
  const ano = Number(mes.mes.slice(0, 4));
  const [modo, setModo] = useState('resto_do_ano');
  const [reajuste, setReajuste] = useState('0');
  const [sobrescrever, setSobrescrever] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const destinos = useMemo(() => {
    if (modo === 'resto_do_ano') {
      const lista = [];
      for (let m = somarMeses(mes.mes, 1); m.startsWith(String(ano)); m = somarMeses(m, 1)) lista.push(m);
      return lista;
    }
    if (modo === 'proximo_ano') return Array.from({ length: 12 }, (_, i) => `${ano + 1}-${String(i + 1).padStart(2, '0')}`);
    return [somarMeses(mes.mes, 1)];
  }, [modo, mes.mes, ano]);

  const copiar = async () => {
    setSalvando(true);
    setErro('');
    try {
      const r = await api.post('/plano/orcamento/copiar', {
        origem: mes.mes,
        destinos,
        reajustePct: Number(reajuste) || 0,
        sobrescrever,
        ...(userId ? { userId } : {}),
      });
      toast(`Plano copiado para ${r.copiados} ${r.copiados === 1 ? 'mês' : 'meses'}.`);
      onSalvo();
      onFechar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={`Copiar o plano de ${formatarMes(mes.mes)}`}
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn btn-primario" onClick={copiar} disabled={salvando || destinos.length === 0}>{salvando ? 'Copiando...' : `Copiar para ${destinos.length} ${destinos.length === 1 ? 'mês' : 'meses'}`}</button>
        </>
      }
    >
      <Alerta>{erro}</Alerta>
      <Campo rotulo="Para onde">
        <select className="input" value={modo} onChange={(e) => setModo(e.target.value)}>
          <option value="resto_do_ano">Meses restantes de {ano}</option>
          <option value="proximo_mes">Só o mês seguinte</option>
          <option value="proximo_ano">Todos os meses de {ano + 1}</option>
        </select>
      </Campo>
      <Campo rotulo="Reajuste aplicado (%)" ajuda="Ex.: 4,5 para corrigir pela inflação prevista. Use negativo para reduzir.">
        <input className="input" type="number" step="0.1" value={reajuste} onChange={(e) => setReajuste(e.target.value)} />
      </Campo>
      <label className="check">
        <input type="checkbox" checked={sobrescrever} onChange={(e) => setSobrescrever(e.target.checked)} />
        <span>Substituir meses que já têm plano (sem marcar, eles são mantidos)</span>
      </label>
      {destinos.length > 0 && <p className="texto-suave texto-pequeno">Destinos: {destinos.map((d) => formatarMes(d, { curto: true })).join(', ')}</p>}
    </Modal>
  );
}

function PremissasModal({ ano, userId, onFechar, onSalvo }) {
  const toast = useToast();
  const { dados, carregando } = useApi(`/plano/premissas${qs({ ano, userId })}`);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (dados) {
      setForm({
        inflacaoAnual: String(dados.inflacaoAnual),
        reajusteRendaAnual: String(dados.reajusteRendaAnual),
        metaPoupancaPct: String(dados.metaPoupancaPct),
        patrimonioInicial: dados.patrimonioInicial === null ? '' : String(dados.patrimonioInicial),
        observacoes: dados.observacoes || '',
      });
    }
  }, [dados]);

  const set = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await api.put('/plano/premissas', {
        ano,
        inflacaoAnual: Number(form.inflacaoAnual),
        reajusteRendaAnual: Number(form.reajusteRendaAnual),
        metaPoupancaPct: Number(form.metaPoupancaPct),
        patrimonioInicial: form.patrimonioInicial === '' ? null : Number(form.patrimonioInicial),
        observacoes: form.observacoes,
        ...(userId ? { userId } : {}),
      });
      toast('Premissas salvas.');
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
      titulo={`Premissas de ${ano}`}
      subtitulo="Hipóteses usadas para prever os meses sem plano e tirar as conclusões."
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-premissas" className="btn btn-primario" disabled={salvando || !form}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      {carregando || !form ? <Carregando /> : (
        <form id="form-premissas" onSubmit={salvar} className="pilha">
          <Alerta>{erro}</Alerta>
          <div className="grade-form">
            <Campo rotulo="Inflação esperada (% a.a.)"><input type="number" step="0.1" value={form.inflacaoAnual} onChange={set('inflacaoAnual')} /></Campo>
            <Campo rotulo="Reajuste de renda (% a.a.)"><input type="number" step="0.1" value={form.reajusteRendaAnual} onChange={set('reajusteRendaAnual')} /></Campo>
            <Campo rotulo="Meta de poupança (% da renda)"><input type="number" step="1" min="0" max="90" value={form.metaPoupancaPct} onChange={set('metaPoupancaPct')} /></Campo>
            <Campo rotulo="Patrimônio no início do ano (R$)" ajuda="Opcional: permite estimar o patrimônio no fim do ano.">
              <input type="number" step="0.01" min="0" value={form.patrimonioInicial} onChange={set('patrimonioInicial')} />
            </Campo>
            <Campo rotulo="Observações do planejamento" className="inteira">
              <textarea maxLength={2000} value={form.observacoes} onChange={set('observacoes')} placeholder="Ex.: troca de carro em julho, 13º salário em dezembro..." />
            </Campo>
          </div>
        </form>
      )}
    </Modal>
  );
}
