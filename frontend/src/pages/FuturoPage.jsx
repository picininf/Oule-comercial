import React, { useEffect, useRef, useState } from 'react';
import { Card, Metrica, ListaConclusoes, Carregando, Alerta, Modal, Campo, Barra, Vazio, useValores, useToast } from '../components/ui';
import GraficoLinha from '../components/GraficoLinha';
import MenuExportar from '../components/MenuExportar';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { formatarData, formatarMes, formatarMoeda, formatarPct, qs } from '../lib/format';

const SITUACAO_SONHO = {
  no_prazo: { texto: 'No prazo', classe: 'tag-sucesso' },
  atrasado: { texto: 'Atrasa', classe: 'tag-atencao' },
  fora_do_horizonte: { texto: 'Fora do alcance', classe: 'tag-perigo' },
};

/** Debounce simples para o simulador não disparar uma requisição por tecla. */
function useAtrasado(valor, ms = 450) {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

/**
 * Futuro (próximos anos) + Sonhos x Vida Real x Plano + Aposentadoria /
 * Liberdade Financeira, com simulador "e se eu cortar X% / guardar mais R$ Y".
 */
export default function FuturoPage({ userId = null }) {
  const { fmt, ocultar } = useValores();
  const [anos, setAnos] = useState(10);
  const [cortePct, setCortePct] = useState(0);
  const [aporteExtra, setAporteExtra] = useState('');
  const [editandoAposentadoria, setEditandoAposentadoria] = useState(false);
  const ref = useRef(null);

  const corte = useAtrasado(cortePct);
  const extra = useAtrasado(Number(aporteExtra) || 0);
  const { dados, carregando, erro, recarregar } = useApi(`/plano/projecao${qs({ anos, cortePct: corte, aporteExtra: extra, userId })}`);

  const simulando = corte > 0 || extra > 0;

  const dadosExportacao = () => ({
    subtitulo: `Projeção de ${anos} anos${simulando ? ` · simulação: corte de ${corte}% e +${formatarMoeda(extra)}/mês` : ''}`,
    resumo: dados
      ? [
          { rotulo: 'Renda média', valor: formatarMoeda(dados.base.rendaMensal) },
          { rotulo: 'Gasto médio', valor: formatarMoeda(dados.base.gastoMensal) },
          { rotulo: 'Sobra mensal', valor: formatarMoeda(dados.base.sobraMensal) },
        ]
      : [],
    colunas: [
      { titulo: 'Ano', chave: 'ano' },
      { titulo: 'Idade', valor: (l) => l.idade ?? '' },
      { titulo: 'Entradas', tipo: 'moeda', chave: 'entradas' },
      { titulo: 'Saídas', tipo: 'moeda', chave: 'saidas' },
      { titulo: 'Guardado no ano', tipo: 'moeda', chave: 'aporte' },
      { titulo: 'Patrimônio', tipo: 'moeda', chave: 'patrimonio' },
    ],
    linhas: dados?.linhaDoTempo || [],
  });

  return (
    <div className="pilha" ref={ref}>
      <Card titulo="Simulador" icone="🔭" acoes={<MenuExportar nome="futuro" titulo="Visão de futuro" dados={dadosExportacao} alvoPng={ref} />}>
        <div className="grade-form-3">
          <Campo rotulo="Horizonte">
            <select className="input" value={anos} onChange={(e) => setAnos(Number(e.target.value))}>
              {[5, 10, 15, 20, 30].map((a) => <option key={a} value={a}>Próximos {a} anos</option>)}
            </select>
          </Campo>
          <Campo rotulo={`E se eu cortar ${cortePct}% dos gastos?`}>
            <input type="range" min="0" max="50" step="5" value={cortePct} onChange={(e) => setCortePct(Number(e.target.value))} style={{ accentColor: 'var(--primaria)' }} />
          </Campo>
          <Campo rotulo="E se eu guardar mais por mês? (R$)">
            <input className="input" type="number" min="0" step="50" value={aporteExtra} onChange={(e) => setAporteExtra(e.target.value)} placeholder="0,00" />
          </Campo>
        </div>
        <p className="texto-suave texto-pequeno" style={{ marginTop: 10 }}>
          Valores em reais de hoje (já descontada a inflação). Base: média dos últimos {dados?.base.mesesHistorico || 6} meses de transações.
        </p>
      </Card>

      <Alerta>{erro}</Alerta>
      {carregando && !dados && <Carregando texto="Projetando o futuro..." />}

      {dados && (
        <>
          <div className="metricas">
            <Metrica rotulo="Renda média mensal" icone="📥" valor={fmt(dados.base.rendaMensal)} tom="positivo" detalhe={`Ganho real de renda: ${formatarPct(dados.base.ganhoRealRendaAnualPct)} a.a.`} />
            <Metrica rotulo={simulando ? 'Gasto mensal (simulado)' : 'Gasto médio mensal'} icone="📤" valor={fmt(dados.base.gastoMensal)} tom="negativo" />
            <Metrica rotulo="Sobra por mês" icone="💰" valor={fmt(dados.base.sobraMensal)} tom={dados.base.sobraMensal >= 0 ? 'positivo' : 'negativo'} detalhe={`${formatarPct(dados.base.taxaPoupanca)} da renda`} />
            <Metrica
              rotulo={`Patrimônio em ${dados.linhaDoTempo.at(-1)?.ano}`}
              icone="🏦"
              valor={fmt(dados.linhaDoTempo.at(-1)?.patrimonio)}
              detalhe={`Rentabilidade real de ${formatarPct(dados.base.rentabilidadeRealAnual)} a.a.`}
            />
          </div>

          <Card titulo="Conclusões" icone="🧠"><ListaConclusoes itens={dados.conclusoes} /></Card>

          <Card titulo="Evolução do patrimônio" icone="📈">
            <GraficoLinha
              ocultarValores={ocultar}
              rotulos={dados.linhaDoTempo.map((l) => String(l.ano))}
              series={[
                { nome: 'Patrimônio projetado', cor: 'var(--primaria)', valores: dados.linhaDoTempo.map((l) => l.patrimonio) },
                ...(dados.aposentadoria?.patrimonioNecessario
                  ? [{ nome: 'Meta de liberdade financeira', cor: 'var(--sucesso)', tracejado: true, valores: dados.linhaDoTempo.map(() => dados.aposentadoria.patrimonioNecessario) }]
                  : []),
              ]}
            />
          </Card>

          <Card titulo="Sonhos x Vida Real x Plano" icone="🎯">
            {dados.sonhos.length === 0 ? (
              <Vazio icone="🎯" titulo="Nenhum sonho em andamento" texto="Cadastre seus sonhos em Sonhos & Metas para ver quando cada um cabe no seu ritmo atual." />
            ) : (
              <>
                <p className="texto-suave" style={{ marginBottom: 12 }}>A sobra de cada mês vai para os sonhos em ordem de prazo (o mais urgente primeiro).</p>
                <div className="tabela-wrapper">
                  <table className="tabela">
                    <thead>
                      <tr><th>Sonho</th><th className="num">Falta</th><th>Prazo</th><th>No seu ritmo, chega em</th><th>Situação</th></tr>
                    </thead>
                    <tbody>
                      {dados.sonhos.map((s) => (
                        <tr key={s.id}>
                          <td><strong>{s.titulo}</strong></td>
                          <td className="num">{fmt(Math.max(s.valorAlvo - s.valorAtual, 0))}</td>
                          <td>{s.prazo ? formatarData(s.prazo) : 'Sem prazo'}</td>
                          <td>{s.atingidoEm ? formatarMes(s.atingidoEm) : '—'}{s.atrasoMeses ? <span className="texto-suave texto-pequeno"> ({s.atrasoMeses} {s.atrasoMeses === 1 ? 'mês' : 'meses'} depois)</span> : null}</td>
                          <td><span className={`tag ${SITUACAO_SONHO[s.situacao].classe}`}>{SITUACAO_SONHO[s.situacao].texto}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <Aposentadoria dados={dados} onEditar={() => setEditandoAposentadoria(true)} />

          <Card titulo="Ano a ano" icone="📅" semPadding>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Ano</th><th>Idade</th><th className="num">Renda/mês</th><th className="num">Gasto/mês</th><th className="num">Guardado no ano</th><th className="num">Patrimônio</th></tr>
                </thead>
                <tbody>
                  {dados.linhaDoTempo.map((l) => (
                    <tr key={l.ano}>
                      <td><strong>{l.ano}</strong></td>
                      <td>{l.idade ?? '—'}</td>
                      <td className="num">{fmt(l.rendaMensal)}</td>
                      <td className="num">{fmt(l.gastoMensal)}</td>
                      <td className={`num ${l.aporte >= 0 ? 'positivo' : 'negativo'}`}>{fmt(l.aporte)}</td>
                      <td className="num"><strong>{fmt(l.patrimonio)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {editandoAposentadoria && dados && (
        <AposentadoriaModal config={dados.aposentadoriaConfig} userId={userId} onFechar={() => setEditandoAposentadoria(false)} onSalvo={recarregar} />
      )}
    </div>
  );
}

function Aposentadoria({ dados, onEditar }) {
  const { fmt, ocultar } = useValores();
  const r = dados.aposentadoria;
  const cfg = dados.aposentadoriaConfig;

  return (
    <Card titulo="Aposentadoria & Liberdade Financeira" icone="🏖️" acoes={<button type="button" className="btn btn-secundario btn-pequeno nao-exportar" onClick={onEditar}>{cfg.configurado ? '✏️ Ajustar' : 'Configurar'}</button>}>
      {!cfg.configurado ? (
        <Vazio
          icone="🏖️"
          titulo="Quanto você precisa para viver de renda?"
          texto="Informe a renda desejada, a idade em que quer parar e quanto já tem guardado. Calculamos o patrimônio necessário e quanto aportar por mês."
          acao={<button type="button" className="btn btn-primario" onClick={onEditar}>Configurar meu plano</button>}
        />
      ) : r?.precisaDataNascimento ? (
        <Alerta tipo="atencao">Informe a data de nascimento em “Minha conta” para calcular o tempo até a aposentadoria. Patrimônio necessário: <strong>{fmt(r.patrimonioNecessario)}</strong>.</Alerta>
      ) : (
        <div className="pilha">
          <div className="metricas">
            <Metrica rotulo="Patrimônio necessário" icone="🎯" valor={fmt(r.patrimonioNecessario)} detalhe={`Para ${fmt(cfg.rendaDesejada)}/mês a ${formatarPct(cfg.taxaRetiradaAnual)} a.a.`} />
            <Metrica rotulo={`Projetado aos ${cfg.idadeAposentadoria} anos`} icone="🏦" valor={fmt(r.patrimonioNaAposentadoria)} tom={r.noCaminho ? 'positivo' : 'atencao'} detalhe={`Em ${r.anosAteAposentadoria} anos, aportando ${fmt(cfg.aporteMensal)}/mês`} />
            <Metrica rotulo="Aporte ideal por mês" icone="📈" valor={fmt(r.aporteMensalNecessario)} tom={cfg.aporteMensal >= r.aporteMensalNecessario ? 'positivo' : 'atencao'} detalhe={`Hoje: ${fmt(cfg.aporteMensal)}`} />
            <Metrica rotulo="Liberdade financeira" icone="🕊️" valor={r.idadeLiberdadeFinanceira ? `${Math.floor(r.idadeLiberdadeFinanceira)} anos` : '—'} detalhe={`Renda possível: ${fmt(r.rendaMensalPossivel)}/mês`} />
          </div>
          <div>
            <div className="item-barra-topo"><span className="item-barra-nome">Caminho percorrido</span><span className="item-barra-valor">{formatarPct(r.progressoPct)}</span></div>
            <Barra pct={r.progressoPct} cor="var(--sucesso)" />
          </div>
          {r.curva.length > 1 && (
            <GraficoLinha
              ocultarValores={ocultar}
              altura={200}
              rotulos={r.curva.map((p) => `${p.idade}a`)}
              series={[
                { nome: 'Patrimônio com o aporte atual', cor: 'var(--primaria)', valores: r.curva.map((p) => p.patrimonio) },
                { nome: 'Necessário', cor: 'var(--sucesso)', tracejado: true, valores: r.curva.map((p) => p.necessario) },
              ]}
            />
          )}
        </div>
      )}
    </Card>
  );
}

function AposentadoriaModal({ config, userId, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState({
    idadeAposentadoria: String(config.idadeAposentadoria),
    rendaDesejada: config.rendaDesejada ? String(config.rendaDesejada) : '',
    outrasRendas: config.outrasRendas ? String(config.outrasRendas) : '',
    patrimonioAtual: config.patrimonioAtual ? String(config.patrimonioAtual) : '',
    aporteMensal: config.aporteMensal ? String(config.aporteMensal) : '',
    rentabilidadeRealAnual: String(config.rentabilidadeRealAnual),
    taxaRetiradaAnual: String(config.taxaRetiradaAnual),
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await api.put('/plano/aposentadoria', {
        ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v) || 0])),
        ...(userId ? { userId } : {}),
      });
      toast('Plano de aposentadoria salvo.');
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
      titulo="Aposentadoria & Liberdade Financeira"
      subtitulo="Tudo em valores de hoje (sem inflação)."
      largura="lg"
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-aposentadoria" className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando...' : 'Calcular e salvar'}</button>
        </>
      }
    >
      <form id="form-aposentadoria" onSubmit={salvar} className="pilha">
        <Alerta>{erro}</Alerta>
        <div className="grade-form">
          <Campo rotulo="Renda mensal desejada (R$)"><input required type="number" min="0" step="100" value={form.rendaDesejada} onChange={set('rendaDesejada')} /></Campo>
          <Campo rotulo="Idade para parar de trabalhar"><input required type="number" min="18" max="100" value={form.idadeAposentadoria} onChange={set('idadeAposentadoria')} /></Campo>
          <Campo rotulo="Outras rendas na aposentadoria (R$/mês)" ajuda="INSS, aluguéis, previdência já contratada..."><input type="number" min="0" step="100" value={form.outrasRendas} onChange={set('outrasRendas')} /></Campo>
          <Campo rotulo="Patrimônio investido hoje (R$)"><input type="number" min="0" step="100" value={form.patrimonioAtual} onChange={set('patrimonioAtual')} /></Campo>
          <Campo rotulo="Aporte mensal atual (R$)"><input type="number" min="0" step="50" value={form.aporteMensal} onChange={set('aporteMensal')} /></Campo>
          <Campo rotulo="Rentabilidade real (% a.a.)" ajuda="Acima da inflação. Conservador: 3–4%."><input type="number" min="-10" max="30" step="0.1" value={form.rentabilidadeRealAnual} onChange={set('rentabilidadeRealAnual')} /></Campo>
          <Campo rotulo="Taxa de retirada segura (% a.a.)" ajuda="Regra clássica: 4% ao ano."><input type="number" min="1" max="15" step="0.1" value={form.taxaRetiradaAnual} onChange={set('taxaRetiradaAnual')} /></Campo>
        </div>
      </form>
    </Modal>
  );
}
