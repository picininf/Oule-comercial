import React, { useEffect, useState } from 'react';
import { Card, Metrica, Modal, Campo, Alerta, Vazio, Carregando, useValores, useToast, useConfirmacao } from '../components/ui';
import MenuExportar from '../components/MenuExportar';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { CATEGORIAS_DESPESA, TIPOS_GASTO, TIPO_GASTO_POR_ID, categoriaInfo } from '../lib/categorias';
import { formatarData, formatarMes, formatarMoeda, mesAtual, qs, somarMeses, hojeIso } from '../lib/format';

const STATUS = {
  pago: { texto: 'Pago', classe: 'tag-sucesso' },
  atrasado: { texto: 'Atrasado', classe: 'tag-perigo' },
  vence_hoje: { texto: 'Vence hoje', classe: 'tag-atencao' },
  vence_em_breve: { texto: 'Vence em breve', classe: 'tag-atencao' },
  pendente: { texto: 'A vencer', classe: '' },
};

const FORMAS = ['Boleto', 'Pix', 'Débito automático', 'Cartão', 'Dinheiro', 'Transferência'];

/**
 * Aba de Pagamentos mensais + Lembretes de vencimento.
 * Contas fixas (aluguel, luz, escola, assinaturas...) com dia de
 * vencimento; a cada mês a pessoa marca o que já pagou.
 */
export default function PagamentosPage({ userId = null }) {
  const { fmt } = useValores();
  const toast = useToast();
  const [confirmar, modalConfirmacao] = useConfirmacao();
  const [mes, setMes] = useState(mesAtual());
  const [editando, setEditando] = useState(null);
  const [pagando, setPagando] = useState(null);
  const [lembretesAbertos, setLembretesAbertos] = useState(false);

  const { dados, carregando, erro, recarregar } = useApi(`/pagamentos/mes${qs({ mes, userId })}`);
  const contas = dados?.contas || [];

  const desfazer = async (conta) => {
    const ok = await confirmar({
      titulo: 'Desfazer pagamento',
      texto: `Marcar “${conta.descricao}” como não paga em ${formatarMes(mes)}?${conta.pago?.transacaoId ? ' O lançamento criado nas transações também será removido.' : ''}`,
      confirmar: 'Desfazer',
    });
    if (!ok) return;
    try {
      await api.delete(`/pagamentos/${conta.id}/pagar?mes=${mes}`);
      toast('Pagamento desfeito.');
      recarregar();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  const excluir = async (conta) => {
    const ok = await confirmar({ titulo: 'Excluir conta', texto: `Excluir “${conta.descricao}” e todo o histórico de pagamentos dela?`, confirmar: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      await api.delete(`/pagamentos/${conta.id}`);
      toast('Conta excluída.');
      recarregar();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  const dadosExportacao = () => ({
    subtitulo: formatarMes(mes),
    resumo: dados
      ? [
          { rotulo: 'Total do mês', valor: formatarMoeda(dados.resumo.total) },
          { rotulo: 'Pago', valor: formatarMoeda(dados.resumo.pago) },
          { rotulo: 'Pendente', valor: formatarMoeda(dados.resumo.pendente) },
        ]
      : [],
    colunas: [
      { titulo: 'Vencimento', tipo: 'data', chave: 'vencimento' },
      { titulo: 'Conta', largura: 28, chave: 'descricao' },
      { titulo: 'Categoria', chave: 'categoria' },
      { titulo: 'Tipo de gasto', largura: 26, valor: (c) => TIPO_GASTO_POR_ID[c.tipoGasto]?.nome || '' },
      { titulo: 'Valor', tipo: 'moeda', chave: 'valor' },
      { titulo: 'Situação', valor: (c) => STATUS[c.status].texto },
      { titulo: 'Pago em', tipo: 'data', valor: (c) => c.pago?.pagoEm },
    ],
    linhas: contas,
  });

  return (
    <div className="pilha">
      {modalConfirmacao}
      <div className="linha-entre">
        <div className="linha">
          <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setMes((m) => somarMeses(m, -1))} aria-label="Mês anterior">←</button>
          <strong style={{ minWidth: 140, textAlign: 'center', color: 'var(--texto-forte)' }}>{formatarMes(mes)}</strong>
          <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setMes((m) => somarMeses(m, 1))} aria-label="Próximo mês">→</button>
          {mes !== mesAtual() && <button type="button" className="btn btn-fantasma btn-pequeno" onClick={() => setMes(mesAtual())}>Hoje</button>}
        </div>
        <div className="linha">
          <button type="button" className="btn btn-secundario" onClick={() => setLembretesAbertos(true)}>🔔 Lembretes</button>
          <MenuExportar nome={`pagamentos-${mes}`} titulo="Pagamentos do mês" dados={dadosExportacao} formatos={['csv', 'xlsx', 'pdf']} />
          <button type="button" className="btn btn-primario" onClick={() => setEditando('nova')}>+ Nova conta</button>
        </div>
      </div>

      {dados && (
        <div className="metricas">
          <Metrica rotulo="Total do mês" icone="🧾" valor={fmt(dados.resumo.total)} detalhe={`${dados.resumo.quantidade} contas`} />
          <Metrica rotulo="Já pago" icone="✅" valor={fmt(dados.resumo.pago)} tom="positivo" />
          <Metrica rotulo="Falta pagar" icone="⏳" valor={fmt(dados.resumo.pendente)} tom={dados.resumo.pendente > 0 ? 'atencao' : 'positivo'} />
          <Metrica rotulo="Atrasadas" icone="🔴" valor={dados.resumo.atrasadas} tom={dados.resumo.atrasadas ? 'negativo' : 'positivo'} />
        </div>
      )}

      <Alerta>{erro}</Alerta>
      <Card semPadding titulo="Contas do mês" icone="📅">
        {carregando && !dados ? <Carregando /> : contas.length === 0 ? (
          <Vazio
            icone="🧾"
            titulo="Nenhuma conta para este mês"
            texto="Cadastre suas contas fixas (aluguel, luz, internet, escola, assinaturas) para acompanhar o que já foi pago e receber lembretes antes do vencimento."
            acao={<button type="button" className="btn btn-primario" onClick={() => setEditando('nova')}>Cadastrar conta</button>}
          />
        ) : (
          <ul className="lista-contas">
            {contas.map((c) => (
              <li key={c.id} className={`conta status-${c.status}`}>
                <div className="conta-dia" aria-hidden="true">
                  <strong>{c.vencimento.slice(8, 10)}</strong>
                  <span>{formatarMes(mes, { curto: true }).split('/')[0]}</span>
                </div>
                <div className="conta-info">
                  <strong>{categoriaInfo(c.categoria).icone} {c.descricao}</strong>
                  <small>
                    <span className={`tag ${STATUS[c.status].classe}`}>{STATUS[c.status].texto}</span>{' '}
                    {c.status === 'pago'
                      ? `pago em ${formatarData(c.pago.pagoEm)}${c.pago.valorPago !== c.valor ? ` · ${fmt(c.pago.valorPago)}` : ''}`
                      : c.diasParaVencer > 0 ? `vence em ${c.diasParaVencer} ${c.diasParaVencer === 1 ? 'dia' : 'dias'}` : c.diasParaVencer < 0 ? `venceu há ${-c.diasParaVencer} ${c.diasParaVencer === -1 ? 'dia' : 'dias'}` : ''}
                    {' · '}{TIPO_GASTO_POR_ID[c.tipoGasto]?.curto}{c.formaPagamento ? ` · ${c.formaPagamento}` : ''}
                  </small>
                </div>
                <div className="conta-valor">{fmt(c.valor)}</div>
                <div className="conta-acoes">
                  {c.status === 'pago'
                    ? <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => desfazer(c)}>Desfazer</button>
                    : <button type="button" className="btn btn-sucesso btn-pequeno" onClick={() => setPagando(c)}>✓ Paguei</button>}
                  <button type="button" className="btn btn-fantasma btn-icone" title="Editar" aria-label={`Editar ${c.descricao}`} onClick={() => setEditando(c)}>✏️</button>
                  <button type="button" className="btn btn-fantasma btn-icone" title="Excluir" aria-label={`Excluir ${c.descricao}`} onClick={() => excluir(c)}>🗑️</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editando && <ContaModal conta={editando === 'nova' ? null : editando} userId={userId} onFechar={() => setEditando(null)} onSalvo={recarregar} />}
      {pagando && <PagarModal conta={pagando} mes={mes} onFechar={() => setPagando(null)} onSalvo={recarregar} />}
      {lembretesAbertos && <LembretesModal userId={userId} onFechar={() => setLembretesAbertos(false)} />}
    </div>
  );
}

function ContaModal({ conta, userId, onFechar, onSalvo }) {
  const toast = useToast();
  const { dados: cartoes } = useApi(`/cartoes${qs({ userId })}`);
  const [form, setForm] = useState({
    descricao: conta?.descricao || '',
    categoria: conta?.categoria || 'Moradia',
    tipoGasto: conta?.tipoGasto || 'recorrente_obrigatorio',
    valor: conta ? String(conta.valor) : '',
    diaVencimento: conta ? String(conta.diaVencimento) : '10',
    formaPagamento: conta?.formaPagamento || 'Boleto',
    cartaoId: conta?.cartaoId || '',
    inicioMes: conta?.inicioMes || '',
    fimMes: conta?.fimMes || '',
    lembrar: conta?.lembrar ?? true,
    ativo: conta?.ativo ?? true,
    observacao: conta?.observacao || '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }));

  const trocarCategoria = (categoria) => {
    // Sugere o tipo de gasto da categoria só para contas novas.
    setForm((f) => ({ ...f, categoria, tipoGasto: conta ? f.tipoGasto : categoriaInfo(categoria).tipoGasto || f.tipoGasto }));
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    const payload = {
      ...form,
      valor: Number(form.valor),
      diaVencimento: Number(form.diaVencimento),
      cartaoId: form.formaPagamento === 'Cartão' ? form.cartaoId || null : null,
      ...(userId && !conta ? { userId } : {}),
    };
    try {
      if (conta) await api.put(`/pagamentos/${conta.id}`, payload);
      else await api.post('/pagamentos', payload);
      toast(conta ? 'Conta atualizada.' : 'Conta cadastrada.');
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
      titulo={conta ? 'Editar conta' : 'Nova conta mensal'}
      largura="lg"
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-conta" className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      <form id="form-conta" onSubmit={salvar} className="pilha">
        <Alerta>{erro}</Alerta>
        <div className="grade-form">
          <Campo rotulo="Descrição" className="inteira">
            <input required maxLength={120} value={form.descricao} onChange={set('descricao')} placeholder="Ex.: Aluguel, Conta de luz, Escola, Netflix" />
          </Campo>
          <Campo rotulo="Valor (R$)" ajuda="Para contas que variam, use o valor médio.">
            <input required type="number" min="0" step="0.01" inputMode="decimal" value={form.valor} onChange={set('valor')} />
          </Campo>
          <Campo rotulo="Dia do vencimento">
            <input required type="number" min="1" max="31" value={form.diaVencimento} onChange={set('diaVencimento')} />
          </Campo>
          <Campo rotulo="Categoria">
            <select value={form.categoria} onChange={(e) => trocarCategoria(e.target.value)}>
              {CATEGORIAS_DESPESA.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.id}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Tipo de gasto">
            <select value={form.tipoGasto} onChange={set('tipoGasto')}>
              {TIPOS_GASTO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Forma de pagamento">
            <select value={form.formaPagamento} onChange={set('formaPagamento')}>
              {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Campo>
          {form.formaPagamento === 'Cartão' && (
            <Campo rotulo="Cartão" ajuda="A conta entra na fatura e é paga no vencimento do cartão.">
              <select value={form.cartaoId} onChange={set('cartaoId')}>
                <option value="">Selecione...</option>
                {(cartoes || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
          )}
          <Campo rotulo="Começa em (opcional)">
            <input type="month" value={form.inicioMes} onChange={set('inicioMes')} />
          </Campo>
          <Campo rotulo="Termina em (opcional)" ajuda="Para financiamentos/parcelamentos com fim.">
            <input type="month" value={form.fimMes} onChange={set('fimMes')} />
          </Campo>
          <Campo rotulo="Observação" className="inteira">
            <input maxLength={300} value={form.observacao} onChange={set('observacao')} />
          </Campo>
        </div>
        <label className="check"><input type="checkbox" checked={form.lembrar} onChange={(e) => setForm((f) => ({ ...f, lembrar: e.target.checked }))} /><span>Lembrar antes do vencimento</span></label>
        {conta && <label className="check"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} /><span>Conta ativa (desmarque para pausar sem apagar o histórico)</span></label>}
      </form>
    </Modal>
  );
}

function PagarModal({ conta, mes, onFechar, onSalvo }) {
  const toast = useToast();
  const [valorPago, setValorPago] = useState(String(conta.valor));
  const [pagoEm, setPagoEm] = useState(hojeIso());
  const [registrar, setRegistrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await api.post(`/pagamentos/${conta.id}/pagar`, { mes, valorPago: Number(valorPago), pagoEm, registrarTransacao: registrar });
      toast(`“${conta.descricao}” marcada como paga.`);
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
      titulo={`Pagar “${conta.descricao}”`}
      subtitulo={`Vencimento ${formatarData(conta.vencimento)}`}
      largura="sm"
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-pagar" className="btn btn-sucesso" disabled={salvando}>{salvando ? 'Salvando...' : 'Confirmar pagamento'}</button>
        </>
      }
    >
      <form id="form-pagar" onSubmit={salvar} className="pilha">
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Valor pago (R$)"><input className="input" required type="number" min="0" step="0.01" value={valorPago} onChange={(e) => setValorPago(e.target.value)} /></Campo>
        <Campo rotulo="Data do pagamento"><input className="input" required type="date" value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} /></Campo>
        <label className="check">
          <input type="checkbox" checked={registrar} onChange={(e) => setRegistrar(e.target.checked)} />
          <span>Lançar também nas transações <span className="texto-suave">(deixe desmarcado se o seu banco já está conectado pelo Open Finance, para não duplicar)</span></span>
        </label>
      </form>
    </Modal>
  );
}

function LembretesModal({ userId, onFechar }) {
  const toast = useToast();
  const { dados: perfil, carregando } = useApi(`/perfil${qs({ userId })}`);
  const [dias, setDias] = useState('3');
  const [whatsapp, setWhatsapp] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (perfil) {
      setDias(String(perfil.lembreteDiasAntecedencia ?? 3));
      setWhatsapp(perfil.lembreteWhatsapp ?? true);
    }
  }, [perfil]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await api.put('/perfil', { lembreteDiasAntecedencia: Number(dias), lembreteWhatsapp: whatsapp, ...(userId ? { userId } : {}) });
      toast('Preferências de lembrete salvas.');
      onFechar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Lembretes de vencimento"
      largura="sm"
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn btn-primario" onClick={salvar} disabled={salvando || carregando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      {carregando ? <Carregando /> : (
        <>
          <Alerta>{erro}</Alerta>
          <Campo rotulo="Avisar com quantos dias de antecedência?">
            <select className="input" value={dias} onChange={(e) => setDias(e.target.value)}>
              {[0, 1, 2, 3, 5, 7, 10].map((d) => <option key={d} value={d}>{d === 0 ? 'Só no dia' : `${d} ${d === 1 ? 'dia' : 'dias'} antes`}</option>)}
            </select>
          </Campo>
          <label className="check">
            <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
            <span>Receber os lembretes no WhatsApp vinculado (antes do vencimento, no dia e no dia seguinte, se não estiver marcada como paga)</span>
          </label>
          <p className="texto-suave texto-pequeno">Os avisos também aparecem na Visão Geral do app. Para receber no WhatsApp, vincule seu número na aba WhatsApp Bot.</p>
        </>
      )}
    </Modal>
  );
}
