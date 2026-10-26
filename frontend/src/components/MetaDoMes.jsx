import React, { useState } from 'react';
import { Card, Modal, Campo, Alerta, Barra, Carregando, useValores, useToast } from './ui';
import { EditorOrcamento } from '../pages/PlanoPage';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { categoriaInfo } from '../lib/categorias';
import { formatarMes, formatarPct, qs } from '../lib/format';

const ICONE_AVISO = { positivo: '✅', atencao: '⚠️', alerta: '🚨', info: 'ℹ️' };
const TOM_STATUS = { estourou: 'var(--perigo)', atencao: 'var(--atencao)', ok: 'var(--sucesso)' };

/**
 * Meta do mês no Início, recalculada a cada lançamento: gastos x meta,
 * ritmo até hoje, quanto ainda dá para gastar por dia, contas fixas que
 * ainda vão sair e se a meta de guardar será batida. "Atualizar meta"
 * muda o % de poupança do ano e o plano de gastos por categoria do mês.
 */
export default function MetaDoMes({ userId = null, mes, onNavegar }) {
  const { fmt } = useValores();
  const { dados: meta, carregando, erro, recarregar } = useApi(`/plano/meta-mes${qs({ mes, userId })}`);
  const [editando, setEditando] = useState(false);
  const [editorCategorias, setEditorCategorias] = useState(false);

  if (carregando && !meta) return <Card titulo="Meta do mês" icone="🎯"><Carregando texto="Calculando a meta..." /></Card>;
  if (!meta) return erro ? <Card titulo="Meta do mês" icone="🎯"><Alerta>{erro}</Alerta></Card> : null;

  const temMeta = meta.metaGastos !== null;
  const pctGasto = temMeta && meta.metaGastos > 0 ? (meta.saidas / meta.metaGastos) * 100 : 0;
  const pctRitmo = meta.fracaoDoMes * 100;
  const pctGuardado = meta.metaGuardar > 0 ? (Math.max(meta.guardado, 0) / meta.metaGuardar) * 100 : 0;
  const categoriasComMeta = meta.categorias.filter((c) => c.planejado > 0).slice(0, 5);
  const foraDoPlano = meta.categorias.filter((c) => c.status === 'fora_do_plano');

  return (
    <Card
      titulo={`Meta do mês${meta.estado === 'em_andamento' ? ` · dia ${meta.diaHoje} de ${meta.totalDias}` : ''}`}
      icone="🎯"
      acoes={
        <button type="button" className="btn btn-secundario btn-pequeno nao-exportar" onClick={() => setEditando(true)}>✏️ Atualizar meta</button>
      }
    >
      <div className="pilha" style={{ gap: 14 }}>
        <div>
          <div className="item-barra-topo">
            <span className="item-barra-nome">📤 Gastos</span>
            <span className="item-barra-valor">
              {fmt(meta.saidas)}{temMeta && <> de {fmt(meta.metaGastos)} <small>({formatarPct(pctGasto, 0)})</small></>}
            </span>
          </div>
          {temMeta ? (
            <>
              <div style={{ position: 'relative' }}>
                <Barra pct={pctGasto} alerta={meta.saidas > meta.metaGastos} cor={meta.saidas > meta.metaGastos ? undefined : pctGasto > pctRitmo * 1.1 ? 'var(--atencao)' : undefined} />
                {meta.estado === 'em_andamento' && (
                  <span
                    title={`Ritmo esperado até hoje: ${fmt(meta.ritmoEsperado)}`}
                    style={{ position: 'absolute', top: -3, bottom: -3, left: `${Math.min(pctRitmo, 100)}%`, width: 2, background: 'var(--texto-forte)', opacity: 0.6 }}
                  />
                )}
              </div>
              <p className="texto-suave texto-pequeno" style={{ marginTop: 4 }}>
                {meta.fonteMetaGastos === 'plano' ? 'Meta = plano do mês.' : 'Sem plano para este mês: a referência é a média dos últimos 3 meses.'}
                {meta.disponivel !== null && meta.estado !== 'encerrado' && (
                  <> {meta.disponivel >= 0 ? <>Ainda dá para gastar <strong>{fmt(meta.disponivel)}</strong>{meta.aindaVaiSair > 0 ? ' (já descontadas as contas fixas a pagar)' : ''}.</> : <>Passou <strong className="negativo">{fmt(-meta.disponivel)}</strong> da meta, contando as contas fixas a pagar.</>}</>
                )}
              </p>
            </>
          ) : (
            <p className="texto-suave texto-pequeno">Defina uma meta de gastos para acompanhar o ritmo do mês.</p>
          )}
        </div>

        <div>
          <div className="item-barra-topo">
            <span className="item-barra-nome">🐷 Guardar {formatarPct(meta.metaPoupancaPct, 0)}</span>
            <span className="item-barra-valor">{fmt(Math.max(meta.guardado, 0))} de {fmt(meta.metaGuardar)}</span>
          </div>
          <Barra pct={pctGuardado} cor="var(--sucesso)" />
          {meta.estado !== 'encerrado' && meta.rendaReferencia > 0 && (
            <p className="texto-suave texto-pequeno" style={{ marginTop: 4 }}>
              Previsão para o fim do mês: sobrar <strong className={meta.sobraPrevista >= meta.metaGuardar ? 'positivo' : 'negativo'}>{fmt(meta.sobraPrevista)}</strong>.
            </p>
          )}
        </div>

        {categoriasComMeta.length > 0 && (
          <div className="lista-barras">
            {categoriasComMeta.map((c) => (
              <div key={c.categoria}>
                <div className="item-barra-topo">
                  <span className="item-barra-nome">{categoriaInfo(c.categoria).icone} {c.categoria}</span>
                  <span className="item-barra-valor">{fmt(c.real)} / {fmt(c.planejado)}</span>
                </div>
                <Barra pct={c.pct} cor={TOM_STATUS[c.status]} alerta={c.status === 'estourou'} />
              </div>
            ))}
            {foraDoPlano.length > 0 && (
              <p className="texto-suave texto-pequeno">
                Fora do plano: {foraDoPlano.map((c) => `${c.categoria} (${fmt(c.real)})`).join(', ')}.
              </p>
            )}
          </div>
        )}

        {meta.avisos.length > 0 && (
          <ul className="lista-contas" style={{ margin: 0 }}>
            {meta.avisos.map((a, i) => (
              <li key={i} className="texto-pequeno" style={{ padding: '4px 0' }}>{ICONE_AVISO[a.tipo] || '💡'} {a.texto}</li>
            ))}
          </ul>
        )}
      </div>

      {editando && (
        <EditarMeta
          meta={meta}
          userId={userId}
          onFechar={() => setEditando(false)}
          onSalvo={recarregar}
          onEditarCategorias={() => { setEditando(false); setEditorCategorias(true); }}
          onNavegar={onNavegar}
        />
      )}
      {editorCategorias && (
        <EditorOrcamento
          mes={{
            mes: meta.mes,
            categorias: Object.entries(meta.mediaPorCategoria || {}).map(([categoria, mediaHistorica]) => ({ categoria, mediaHistorica })),
          }}
          userId={userId}
          onFechar={() => setEditorCategorias(false)}
          onSalvo={recarregar}
        />
      )}
    </Card>
  );
}

function EditarMeta({ meta, userId, onFechar, onSalvo, onEditarCategorias }) {
  const toast = useToast();
  const { fmt } = useValores();
  const ano = Number(meta.mes.slice(0, 4));
  const { dados: premissas, carregando } = useApi(`/plano/premissas${qs({ ano, userId })}`);
  const [pct, setPct] = useState(String(meta.metaPoupancaPct));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await api.put('/plano/premissas', {
        ...(userId ? { userId } : {}),
        ano,
        inflacaoAnual: premissas.inflacaoAnual,
        reajusteRendaAnual: premissas.reajusteRendaAnual,
        metaPoupancaPct: Number(pct),
        patrimonioInicial: premissas.patrimonioInicial,
        observacoes: premissas.observacoes,
      });
      toast('Meta atualizada.');
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
      titulo={`Meta de ${formatarMes(meta.mes)}`}
      subtitulo="A meta se atualiza sozinha a cada lançamento. Aqui você muda os alvos."
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-meta-mes" className="btn btn-primario" disabled={salvando || carregando || !premissas}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      {carregando && !premissas ? <Carregando /> : (
        <form id="form-meta-mes" onSubmit={salvar} className="pilha" style={{ gap: 16 }}>
          <Alerta>{erro}</Alerta>
          <Campo rotulo="Quanto guardar por mês (% do que entra)" ajuda={`Vale para todos os meses de ${ano}. Com a renda deste mês (${fmt(meta.rendaReferencia)}), são ${fmt(meta.rendaReferencia * (Number(pct) || 0) / 100)}.`}>
            <input className="input" type="number" min="0" max="90" step="1" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} required />
          </Campo>
          <div className="linha-entre">
            <span className="texto-suave texto-pequeno">
              Meta de gastos: {meta.metaGastos !== null ? fmt(meta.metaGastos) : 'não definida'}
              {meta.fonteMetaGastos === 'media' ? ' (média dos últimos meses)' : ''}
            </span>
            <button type="button" className="btn btn-secundario btn-pequeno" onClick={onEditarCategorias}>Ajustar gastos por categoria</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
