import React, { useMemo, useState } from 'react';
import TransactionTable from '../components/TransactionTable';
import MenuExportar from '../components/MenuExportar';
import { NovaTransacaoModal, EditarTransacaoModal } from '../components/TransacaoModais';
import RegraModal from '../components/RegraModal';
import { Card, Metrica, Alerta, useValores, useToast, useConfirmacao } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { CATEGORIAS, TIPOS_GASTO, TIPO_GASTO_POR_ID } from '../lib/categorias';
import { getValorAjustado, origemDe, resumir, dataNoRegime, ORIGENS } from '../lib/finance';
import { formatarMes, formatarMoeda, mesAtual, qs, somarMeses, ultimoDiaDoMes } from '../lib/format';

const PERIODOS = [
  { id: 'mes', nome: 'Este mês' },
  { id: 'mes_anterior', nome: 'Mês passado' },
  { id: '3m', nome: 'Últimos 3 meses' },
  { id: '12m', nome: 'Últimos 12 meses' },
  { id: 'tudo', nome: 'Tudo' },
];

function intervalo(periodo) {
  const atual = mesAtual();
  if (periodo === 'mes') return { de: `${atual}-01`, ate: ultimoDiaDoMes(atual) };
  if (periodo === 'mes_anterior') {
    const m = somarMeses(atual, -1);
    return { de: `${m}-01`, ate: ultimoDiaDoMes(m) };
  }
  if (periodo === '3m') return { de: `${somarMeses(atual, -2)}-01`, ate: null };
  if (periodo === '12m') return { de: `${somarMeses(atual, -11)}-01`, ate: null };
  return { de: null, ate: null };
}

/**
 * Extrato completo com filtros, edição de categoria/tipo de gasto,
 * lançamento manual e exportação. `userId` = staff vendo um cliente.
 */
export default function TransacoesPage({ userId = null }) {
  const { fmt } = useValores();
  const toast = useToast();
  const [confirmar, modalConfirmacao] = useConfirmacao();

  const [periodo, setPeriodo] = useState('3m');
  const [regime, setRegime] = useState('competencia');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tipoGasto, setTipoGasto] = useState('');
  const [origem, setOrigem] = useState('');
  const [novoAberto, setNovoAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [regraDe, setRegraDe] = useState(null);

  const { de, ate } = intervalo(periodo);
  const { dados, carregando, erro, recarregar } = useApi(`/transacoes${qs({ userId, de, ate, regime })}`);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (dados || [])
      .filter((t) => !termo || (t.descricao || '').toLowerCase().includes(termo))
      .filter((t) => !categoria || t.categoria === categoria)
      .filter((t) => !tipoGasto || (tipoGasto === 'sem' ? !t.tipo_gasto : t.tipo_gasto === tipoGasto))
      .filter((t) => !origem || origemDe(t) === ORIGENS[origem])
      .sort((a, b) => String(dataNoRegime(b, regime)).localeCompare(String(dataNoRegime(a, regime))));
  }, [dados, busca, categoria, tipoGasto, origem, regime]);

  const totais = resumir(filtradas);
  // A escolha "data da compra x data do pagamento" só muda algo quando há
  // compra no cartão paga em outro dia — sem isso, nem aparece.
  const temCartao = regime === 'caixa' || (dados || []).some((t) => t.data_caixa && t.data_caixa !== (t.data_competencia || t.data_transacao));

  const excluir = async (t) => {
    const parcelada = t.compra_id && t.parcelas_total > 1;
    const ok = await confirmar({
      titulo: 'Excluir lançamento',
      texto: parcelada
        ? `“${t.descricao}” é uma parcela de uma compra em ${t.parcelas_total}x. Todas as parcelas serão excluídas.`
        : `Excluir “${t.descricao}” (${formatarMoeda(Math.abs(t.valor))})? Essa ação não pode ser desfeita.`,
      confirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/transacoes/${t.id}${parcelada ? '?compraInteira=1' : ''}`);
      toast('Lançamento excluído.');
      recarregar();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  const dadosExportacao = () => ({
    subtitulo: `${PERIODOS.find((p) => p.id === periodo).nome}${temCartao ? ` · por ${regime === 'caixa' ? 'data do pagamento' : 'data da compra'}` : ''}`,
    resumo: [
      { rotulo: 'Entradas', valor: formatarMoeda(totais.entradas) },
      { rotulo: 'Saídas', valor: formatarMoeda(totais.saidas) },
      { rotulo: 'Saldo', valor: formatarMoeda(totais.saldo) },
    ],
    colunas: [
      { titulo: 'Data da compra', tipo: 'data', valor: (t) => t.data_competencia || t.data_transacao },
      { titulo: 'Data de pagamento', tipo: 'data', valor: (t) => t.data_caixa || t.data_transacao },
      { titulo: 'Descrição', largura: 36, valor: (t) => `${t.descricao || ''}` },
      { titulo: 'Categoria', largura: 18, chave: 'categoria' },
      { titulo: 'Tipo de gasto', largura: 26, valor: (t) => TIPO_GASTO_POR_ID[t.tipo_gasto]?.nome || '' },
      { titulo: 'Origem', valor: (t) => origemDe(t).nome },
      { titulo: 'Valor', tipo: 'moeda', valor: (t) => getValorAjustado(t) },
    ],
    linhas: filtradas,
  });

  return (
    <div className="pilha">
      {modalConfirmacao}
      <div className="metricas">
        <Metrica rotulo="Entradas" icone="📥" valor={fmt(totais.entradas)} tom="positivo" />
        <Metrica rotulo="Saídas" icone="📤" valor={fmt(totais.saidas)} tom="negativo" />
        <Metrica rotulo="Saldo do período" icone="💰" valor={fmt(totais.saldo)} tom={totais.saldo >= 0 ? 'positivo' : 'negativo'} />
        <Metrica rotulo="Lançamentos" icone="🧾" valor={filtradas.length} detalhe="Transferências não entram nos totais" />
      </div>

      <Card
        semPadding
        titulo="Extrato"
        icone="💳"
        acoes={
          <>
            <MenuExportar nome="transacoes" titulo="Extrato de transações" dados={dadosExportacao} formatos={['csv', 'xlsx', 'pdf']} />
            <button type="button" className="btn btn-primario" onClick={() => setNovoAberto(true)}>+ Novo lançamento</button>
          </>
        }
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--borda)' }} className="pilha">
          <div className="filtros">
            <input className="input input-busca filtro-largo" placeholder="Buscar pela descrição..." value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
            <select className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período">
              {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.id}</option>)}
            </select>
            <select className="input" value={tipoGasto} onChange={(e) => setTipoGasto(e.target.value)} aria-label="Tipo de gasto">
              <option value="">Todos os tipos de gasto</option>
              {TIPOS_GASTO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              <option value="sem">Sem tipo definido</option>
            </select>
            <select className="input" value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem">
              <option value="">Todas as origens</option>
              {Object.entries(ORIGENS).map(([id, o]) => <option key={id} value={id}>{o.nome}</option>)}
            </select>
          </div>
          {temCartao && <div className="linha-entre">
            <div className="segmentado" role="group" aria-label="Organizar por">
              <button type="button" className={regime === 'competencia' ? 'ativo' : ''} onClick={() => setRegime('competencia')}>Data da compra</button>
              <button type="button" className={regime === 'caixa' ? 'ativo' : ''} onClick={() => setRegime('caixa')}>Data do pagamento</button>
            </div>
            <span className="texto-suave texto-pequeno">
              {regime === 'caixa' ? 'Compras no cartão aparecem no dia em que a fatura vence.' : 'Compras no cartão aparecem no dia em que foram feitas.'}
            </span>
          </div>}
          <Alerta>{erro}</Alerta>
        </div>
        <TransactionTable
          transacoes={filtradas}
          loading={carregando && !dados}
          onEditar={setEditando}
          onExcluir={excluir}
          onCriarRegra={setRegraDe}
        />
      </Card>

      {novoAberto && <NovaTransacaoModal userId={userId} onFechar={() => setNovoAberto(false)} onSalvo={recarregar} />}
      {regraDe && <RegraModal transacao={regraDe} userId={userId} onFechar={() => setRegraDe(null)} onSalvo={recarregar} />}
      {editando && <EditarTransacaoModal transacao={editando} onFechar={() => setEditando(null)} onSalvo={recarregar} />}
      {periodo === 'mes' && <p className="texto-suave texto-pequeno centro">Mostrando {formatarMes(mesAtual())}.</p>}
    </div>
  );
}
