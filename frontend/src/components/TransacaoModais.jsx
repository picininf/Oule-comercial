import React, { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, CATEGORIAS, TIPOS_GASTO, categoriaInfo } from '../lib/categorias';
import { formatarData, formatarMoeda, hojeIso, qs } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { Modal, Campo, Alerta, useToast } from './ui';

/**
 * Prévia da fatura no navegador (mesma regra do backend em
 * backend/utils/fatura.js): mostra em quais vencimentos cada parcela cai
 * ANTES de salvar, para a pessoa entender o "comprei hoje, pago mês que vem".
 */
function previaParcelas({ data, total, parcelas, cartao }) {
  if (!cartao || !data || !total) return [];
  const [ano, mes, dia] = data.split('-').map(Number);
  const ultimoDia = (a, m) => new Date(a, m, 0).getDate();
  const fechamentoNoMes = Math.min(cartao.diaFechamento, ultimoDia(ano, mes));
  const pulo = dia >= fechamentoNoMes ? 1 : 0;
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / parcelas);
  const resto = centavos - base * parcelas;
  return Array.from({ length: parcelas }, (_, i) => {
    let indice = ano * 12 + (mes - 1) + pulo + i; // mês do fechamento
    if (cartao.diaVencimento <= cartao.diaFechamento) indice += 1;
    const a = Math.floor(indice / 12);
    const m = (indice % 12) + 1;
    const d = Math.min(cartao.diaVencimento, ultimoDia(a, m));
    return {
      parcela: i + 1,
      valor: (base + (i === 0 ? resto : 0)) / 100,
      vencimento: `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    };
  });
}

export function NovaTransacaoModal({ userId = null, onFechar, onSalvo }) {
  const toast = useToast();
  const { dados: cartoes } = useApi(`/cartoes${qs({ userId })}`);
  const [form, setForm] = useState({
    tipo: 'despesa',
    descricao: '',
    valor: '',
    data: hojeIso(),
    categoria: 'Alimentação',
    tipoGasto: '',
    forma: 'Pix',
    cartaoId: '',
    parcelas: 1,
    observacao: '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const cartao = (cartoes || []).find((c) => c.id === form.cartaoId);
  const noCartao = form.tipo === 'despesa' && form.forma === 'Cartão';
  const parcelas = useMemo(
    () => (noCartao ? previaParcelas({ data: form.data, total: Number(form.valor), parcelas: Number(form.parcelas) || 1, cartao }) : []),
    [noCartao, form.data, form.valor, form.parcelas, cartao]
  );
  const categorias = form.tipo === 'despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA;

  const trocarTipo = (tipo) => setForm((f) => ({ ...f, tipo, categoria: tipo === 'despesa' ? 'Alimentação' : 'Salário', forma: 'Pix', cartaoId: '', parcelas: 1 }));

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    if (noCartao && !form.cartaoId) {
      setErro('Escolha o cartão (ou cadastre um em Contas & Cartões → Cartões e faturas).');
      return;
    }
    setSalvando(true);
    try {
      const criadas = await api.post('/transacoes', {
        ...(userId ? { userId } : {}),
        tipo: form.tipo,
        descricao: form.descricao,
        valor: Number(form.valor),
        data: form.data,
        categoria: form.categoria,
        tipoGasto: form.tipo === 'despesa' && form.tipoGasto ? form.tipoGasto : undefined,
        cartaoId: noCartao ? form.cartaoId : null,
        parcelas: noCartao ? Number(form.parcelas) : 1,
        metodoPagamento: noCartao ? 'Cartão' : form.forma,
        observacao: form.observacao || null,
      });
      toast(criadas.length > 1 ? `Compra lançada em ${criadas.length} parcelas.` : 'Lançamento salvo.');
      onSalvo?.();
      onFechar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Novo lançamento"
      subtitulo="Registre uma entrada ou um gasto que não veio do banco."
      onFechar={onFechar}
      largura="md"
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-nova-transacao" className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar lançamento'}</button>
        </>
      }
    >
      <form id="form-nova-transacao" onSubmit={salvar} className="pilha" style={{ gap: 16 }}>
        <Alerta>{erro}</Alerta>
        <div className="segmentado" role="group" aria-label="Tipo de lançamento">
          <button type="button" className={form.tipo === 'despesa' ? 'ativo' : ''} onClick={() => trocarTipo('despesa')}>📤 Gasto</button>
          <button type="button" className={form.tipo === 'receita' ? 'ativo' : ''} onClick={() => trocarTipo('receita')}>📥 Entrada</button>
        </div>

        <div className="grade-form">
          <Campo rotulo="Descrição" className="inteira">
            <input required maxLength={200} value={form.descricao} onChange={set('descricao')} placeholder={form.tipo === 'despesa' ? 'Ex.: Mercado, Farmácia, TV nova' : 'Ex.: Salário, Freela'} />
          </Campo>
          <Campo rotulo={noCartao && form.parcelas > 1 ? 'Valor TOTAL da compra (R$)' : 'Valor (R$)'}>
            <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.valor} onChange={set('valor')} />
          </Campo>
          <Campo rotulo={noCartao ? 'Data da compra' : 'Data'}>
            <input required type="date" value={form.data} onChange={set('data')} />
          </Campo>
          <Campo rotulo="Categoria">
            <select value={form.categoria} onChange={set('categoria')}>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.id}</option>)}
            </select>
          </Campo>
          {form.tipo === 'despesa' && (
            <Campo rotulo="Tipo de gasto" ajuda={`Padrão da categoria: ${TIPOS_GASTO.find((t) => t.id === categoriaInfo(form.categoria).tipoGasto)?.nome || '—'}`}>
              <select value={form.tipoGasto} onChange={set('tipoGasto')}>
                <option value="">Usar o padrão da categoria</option>
                {TIPOS_GASTO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Campo>
          )}
          <Campo rotulo="Forma de pagamento">
            <select value={form.forma} onChange={set('forma')}>
              {(form.tipo === 'despesa' ? ['Pix', 'Débito', 'Cartão', 'Boleto', 'Dinheiro', 'Transferência'] : ['Pix', 'Transferência', 'Dinheiro']).map((f) => (
                <option key={f} value={f}>{f === 'Cartão' ? 'Cartão de crédito' : f}</option>
              ))}
            </select>
          </Campo>
          {noCartao && (
            <>
              <Campo rotulo="Cartão">
                <select value={form.cartaoId} onChange={set('cartaoId')} required>
                  <option value="">Selecione...</option>
                  {(cartoes || []).filter((c) => c.ativo).map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}{c.final ? ` •••• ${c.final}` : ''}</option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Parcelas">
                <select value={form.parcelas} onChange={set('parcelas')}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
                </select>
              </Campo>
            </>
          )}
          <Campo rotulo="Observação (opcional)" className="inteira">
            <input maxLength={500} value={form.observacao} onChange={set('observacao')} />
          </Campo>
        </div>

        {noCartao && cartao && parcelas.length > 0 && (
          <div className="alerta alerta-info">
            <strong>Quando você paga:</strong> a compra é de {formatarData(form.data)}, mas{' '}
            {parcelas.length === 1
              ? <>sai da conta só em <strong>{formatarData(parcelas[0].vencimento)}</strong>, no vencimento da fatura do {cartao.nome}.</>
              : <>as parcelas vencem em {parcelas.map((p) => `${formatarData(p.vencimento)} (${formatarMoeda(p.valor)})`).join(', ')}.</>}
          </div>
        )}
        {noCartao && (cartoes || []).length === 0 && (
          <Alerta tipo="atencao">Nenhum cartão cadastrado. Cadastre em <strong>Contas & Cartões → Cartões e faturas</strong> com o dia de fechamento e vencimento.</Alerta>
        )}
      </form>
    </Modal>
  );
}

export function EditarTransacaoModal({ transacao, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState({
    descricao: transacao.descricao || '',
    categoria: transacao.categoria || 'Outros',
    tipoGasto: transacao.tipo_gasto || '',
    observacao: transacao.observacao || '',
    aplicarSemelhantes: false,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const ehDespesa = Number(transacao.valor) < 0 && categoriaInfo(form.categoria).grupo === 'despesa';

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const r = await api.patch(`/transacoes/${transacao.id}`, {
        descricao: form.descricao,
        categoria: form.categoria,
        tipoGasto: ehDespesa ? form.tipoGasto || null : null,
        observacao: form.observacao || null,
        aplicarSemelhantes: form.aplicarSemelhantes,
      });
      toast(r.atualizadas > 1 ? `${r.atualizadas} lançamentos atualizados.` : 'Lançamento atualizado.');
      onSalvo?.();
      onFechar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Editar lançamento"
      subtitulo={`${formatarData(transacao.data_competencia || transacao.data_transacao)} · ${formatarMoeda(Math.abs(Number(transacao.valor)))}`}
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-editar-transacao" className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      <form id="form-editar-transacao" onSubmit={salvar} className="pilha" style={{ gap: 16 }}>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Descrição">
          <input required maxLength={200} value={form.descricao} onChange={set('descricao')} disabled={Boolean(transacao.open_finance_id)} />
        </Campo>
        <div className="grade-form">
          <Campo rotulo="Categoria">
            <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value, tipoGasto: '' }))}>
              {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.id}</option>)}
            </select>
          </Campo>
          {ehDespesa && (
            <Campo rotulo="Tipo de gasto">
              <select value={form.tipoGasto} onChange={set('tipoGasto')}>
                <option value="">Padrão da categoria</option>
                {TIPOS_GASTO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Campo>
          )}
        </div>
        <Campo rotulo="Observação">
          <input maxLength={500} value={form.observacao} onChange={set('observacao')} />
        </Campo>
        <label className="check">
          <input type="checkbox" checked={form.aplicarSemelhantes} onChange={(e) => setForm((f) => ({ ...f, aplicarSemelhantes: e.target.checked }))} />
          <span>Aplicar a categoria a <strong>todos</strong> os lançamentos com a descrição “{transacao.descricao}”</span>
        </label>
        {transacao.categoria !== 'Transferências' && (
          <p className="texto-suave texto-pequeno">
            Dica: pagamento da fatura do cartão e dinheiro movido entre contas suas devem ficar em <strong>Transferências</strong> — assim não são contados como gasto duas vezes.
          </p>
        )}
      </form>
    </Modal>
  );
}
