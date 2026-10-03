import React, { useEffect, useState } from 'react';
import { Card, Modal, Campo, Alerta, Vazio, Carregando, Metrica, useValores, useToast, useConfirmacao } from '../components/ui';
import MenuExportar from '../components/MenuExportar';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { categoriaInfo } from '../lib/categorias';
import { formatarData, formatarMes, formatarMoeda, qs } from '../lib/format';

const SITUACAO = {
  anterior: { texto: 'Vencida', classe: '' },
  fechada: { texto: 'Fechada · a pagar', classe: 'tag-atencao' },
  aberta: { texto: 'Aberta', classe: 'tag-bank' },
  futura: { texto: 'Futura (parcelas)', classe: 'tag-manual' },
};

/**
 * Cartões & Faturas — a solução para "comprei hoje mas só pago mês que
 * vem": cada cartão tem dia de fechamento e de vencimento; toda compra
 * (inclusive parcelada) é colocada automaticamente na fatura certa.
 */
export default function CartoesPage({ userId = null }) {
  const { fmt } = useValores();
  const toast = useToast();
  const [confirmar, modalConfirmacao] = useConfirmacao();
  const { dados: cartoes, carregando, erro, recarregar } = useApi(`/cartoes${qs({ userId })}`);
  const [selecionado, setSelecionado] = useState(null);
  const [editando, setEditando] = useState(null);

  useEffect(() => {
    if (cartoes?.length && !cartoes.some((c) => c.id === selecionado)) setSelecionado(cartoes[0].id);
  }, [cartoes, selecionado]);

  const excluir = async (c) => {
    const ok = await confirmar({ titulo: 'Excluir cartão', texto: `Excluir “${c.nome}”? As compras continuam no extrato, só perdem o vínculo com o cartão.`, confirmar: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      await api.delete(`/cartoes/${c.id}`);
      toast('Cartão excluído.');
      setSelecionado(null);
      recarregar();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  const cartao = (cartoes || []).find((c) => c.id === selecionado);

  return (
    <div className="pilha">
      {modalConfirmacao}
      <Card titulo="Como as datas funcionam" icone="💡">
        <div className="explicacao">
          <div><strong>📅 Data da compra (competência)</strong>O gasto pertence ao mês em que você comprou. É o que mostra o seu comportamento de consumo.</div>
          <div><strong>💸 Data do pagamento (caixa)</strong>O dinheiro só sai no vencimento da fatura. É o que mostra se o mês vai fechar no azul.</div>
          <div><strong>🛒 Melhor dia de compra</strong>Compras feitas no dia do fechamento ou depois só são cobradas na fatura do mês seguinte — ganha quase 40 dias.</div>
          <div><strong>➗ Parcelas</strong>Cada parcela vai para a fatura certa automaticamente e aparece como “já comprometido” no Plano.</div>
        </div>
      </Card>

      <Card
        titulo="Meus cartões"
        icone="💳"
        acoes={<button type="button" className="btn btn-primario" onClick={() => setEditando('novo')}>+ Novo cartão</button>}
      >
        <Alerta>{erro}</Alerta>
        {carregando && !cartoes ? <Carregando /> : (cartoes || []).length === 0 ? (
          <Vazio
            icone="💳"
            titulo="Nenhum cartão cadastrado"
            texto="Cadastre seus cartões com o dia de fechamento e de vencimento. Cartões conectados pelo Open Finance aparecem aqui sozinhos."
            acao={<button type="button" className="btn btn-primario" onClick={() => setEditando('novo')}>Cadastrar cartão</button>}
          />
        ) : (
          <div className="cartoes-grid">
            {cartoes.map((c) => (
              <button type="button" key={c.id} className={`cartao-visual ${c.id === selecionado ? 'ativo' : ''}`} onClick={() => setSelecionado(c.id)} aria-pressed={c.id === selecionado}>
                <div className="linha-entre">
                  <h4>{c.nome}</h4>
                  {c.openFinance && <span className="tag tag-bank">Open Finance</span>}
                </div>
                <div>
                  <small>{c.bandeira || 'Cartão'}{c.final ? ` •••• ${c.final}` : ''}</small>
                  <div className="cartao-rodape">
                    <span>Fecha dia {c.diaFechamento}</span>
                    <span>Vence dia {c.diaVencimento}</span>
                  </div>
                  <small>Comprando hoje, paga em {formatarData(c.compraHojeVenceEm)}</small>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {cartao && <Faturas cartao={cartao} onEditar={() => setEditando(cartao)} onExcluir={() => excluir(cartao)} fmt={fmt} />}
      {editando && <CartaoModal cartao={editando === 'novo' ? null : editando} userId={userId} onFechar={() => setEditando(null)} onSalvo={recarregar} />}
    </div>
  );
}

function Faturas({ cartao, onEditar, onExcluir, fmt }) {
  const { dados, carregando, erro } = useApi(`/cartoes/${cartao.id}/faturas?meses=12`);
  const [mesAberto, setMesAberto] = useState(null);

  useEffect(() => {
    if (!dados) return;
    const aberta = dados.faturas.find((f) => f.situacao === 'aberta') || dados.faturas.find((f) => f.situacao === 'fechada') || dados.faturas.at(-1);
    setMesAberto(aberta?.mes || null);
  }, [dados]);

  const fatura = dados?.faturas.find((f) => f.mes === mesAberto);
  const futuras = (dados?.faturas || []).filter((f) => f.situacao === 'futura' || f.situacao === 'aberta');
  const comprometido = futuras.reduce((s, f) => s + f.total, 0);

  const dadosExportacao = () => ({
    subtitulo: fatura ? `Fatura com vencimento em ${formatarData(fatura.vencimento)}` : '',
    resumo: fatura ? [{ rotulo: 'Total da fatura', valor: formatarMoeda(fatura.total) }, { rotulo: 'Compras', valor: String(fatura.compras) }] : [],
    colunas: [
      { titulo: 'Data da compra', tipo: 'data', chave: 'dataCompra' },
      { titulo: 'Descrição', largura: 34, chave: 'descricao' },
      { titulo: 'Categoria', chave: 'categoria' },
      { titulo: 'Parcela', valor: (i) => i.parcela || 'à vista' },
      { titulo: 'Valor', tipo: 'moeda', valor: (i) => -i.valor },
    ],
    linhas: fatura?.itens || [],
  });

  return (
    <Card
      titulo={`Faturas — ${cartao.nome}`}
      icone="🧾"
      acoes={
        <>
          <MenuExportar nome={`fatura-${cartao.nome}-${mesAberto || ''}`} titulo={`Fatura ${cartao.nome}`} dados={dadosExportacao} formatos={['csv', 'xlsx', 'pdf']} />
          <button type="button" className="btn btn-secundario btn-pequeno" onClick={onEditar}>✏️ Editar cartão</button>
          <button type="button" className="btn btn-perigo-contorno btn-pequeno" onClick={onExcluir}>Excluir</button>
        </>
      }
    >
      <Alerta>{erro}</Alerta>
      {carregando && !dados ? <Carregando /> : !dados || dados.faturas.length === 0 ? (
        <Vazio icone="🧾" titulo="Nenhuma compra neste cartão" texto="Lance compras em Transações (forma de pagamento: cartão de crédito) ou importe a fatura em Importar Extrato escolhendo este cartão." />
      ) : (
        <div className="pilha">
          <div className="metricas">
            <Metrica rotulo="Fatura aberta" icone="📂" valor={fmt(dados.faturas.find((f) => f.situacao === 'aberta')?.total || 0)} />
            <Metrica rotulo="Já comprometido (aberta + futuras)" icone="⏳" valor={fmt(comprometido)} tom="atencao" detalhe={`${futuras.length} ${futuras.length === 1 ? 'fatura' : 'faturas'}`} />
            {cartao.limite ? <Metrica rotulo="Limite livre (estimado)" icone="💳" valor={fmt(Math.max(cartao.limite - comprometido, 0))} detalhe={`Limite total ${fmt(cartao.limite)}`} /> : null}
          </div>
          <div className="faturas">
            {dados.faturas.map((f) => (
              <button type="button" key={f.mes} className={`fatura ${f.mes === mesAberto ? 'selecionada' : ''}`} onClick={() => setMesAberto(f.mes)}>
                <span className="texto-suave texto-pequeno">Vence {formatarData(f.vencimento)}</span>
                <strong>{fmt(f.total)}</strong>
                <span className="linha" style={{ gap: 6 }}>
                  <span className={`tag ${SITUACAO[f.situacao].classe}`}>{SITUACAO[f.situacao].texto}</span>
                  <span className="texto-suave texto-pequeno">{f.compras} {f.compras === 1 ? 'item' : 'itens'}</span>
                </span>
              </button>
            ))}
          </div>
          {fatura && (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Data da compra</th><th>Descrição</th><th>Categoria</th><th>Parcela</th><th className="num">Valor</th></tr>
                </thead>
                <tbody>
                  {fatura.itens.map((i) => (
                    <tr key={i.id}>
                      <td>{formatarData(i.dataCompra)}</td>
                      <td><strong>{i.descricao}</strong></td>
                      <td><span className="tag-categoria">{categoriaInfo(i.categoria).icone} {i.categoria}</span></td>
                      <td>{i.parcela || <span className="texto-suave">à vista</span>}</td>
                      <td className={`num ${i.valor > 0 ? 'positivo' : ''}`}>{i.valor > 0 ? '− ' : ''}{fmt(Math.abs(i.valor))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="texto-suave texto-pequeno" style={{ padding: '10px 0' }}>Fatura de {formatarMes(fatura.mes)}: compras de meses anteriores aparecem aqui porque é nesta data que o dinheiro sai da conta.</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function CartaoModal({ cartao, userId, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState({
    nome: cartao?.nome || '',
    bandeira: cartao?.bandeira || '',
    final: cartao?.final || '',
    diaFechamento: cartao ? String(cartao.diaFechamento) : '25',
    diaVencimento: cartao ? String(cartao.diaVencimento) : '5',
    limite: cartao?.limite ? String(cartao.limite) : '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }));

  const fech = Number(form.diaFechamento);
  const venc = Number(form.diaVencimento);
  const exemplo = fech >= 1 && venc >= 1
    ? `Compra no dia ${Math.max(fech - 1, 1)} → paga no dia ${venc} ${venc > fech ? 'do mesmo mês' : 'do mês seguinte'}. Compra no dia ${fech} → paga no dia ${venc} ${venc > fech ? 'do mês seguinte' : 'de dois meses depois'}.`
    : '';

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    const payload = {
      nome: form.nome,
      bandeira: form.bandeira || null,
      final: form.final || null,
      diaFechamento: fech,
      diaVencimento: venc,
      limite: form.limite === '' ? null : Number(form.limite),
    };
    try {
      if (cartao) {
        const r = await api.put(`/cartoes/${cartao.id}`, payload);
        toast(r.recalculados ? `Cartão atualizado. ${r.recalculados} compras recolocadas na fatura certa.` : 'Cartão atualizado.');
      } else {
        await api.post('/cartoes', { ...payload, ...(userId ? { userId } : {}) });
        toast('Cartão cadastrado.');
      }
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
      titulo={cartao ? 'Editar cartão' : 'Novo cartão de crédito'}
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-cartao" className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      <form id="form-cartao" onSubmit={salvar} className="pilha">
        <Alerta>{erro}</Alerta>
        <div className="grade-form">
          <Campo rotulo="Nome do cartão" className="inteira"><input required maxLength={60} value={form.nome} onChange={set('nome')} placeholder="Ex.: Nubank, Itaú Platinum" /></Campo>
          <Campo rotulo="Bandeira"><input maxLength={30} value={form.bandeira} onChange={set('bandeira')} placeholder="Visa, Mastercard..." /></Campo>
          <Campo rotulo="Final (4 dígitos)"><input inputMode="numeric" pattern="\d{4}" maxLength={4} value={form.final} onChange={set('final')} /></Campo>
          <Campo rotulo="Dia do fechamento" ajuda="Quando a fatura fecha (veja no app do banco)."><input required type="number" min="1" max="31" value={form.diaFechamento} onChange={set('diaFechamento')} /></Campo>
          <Campo rotulo="Dia do vencimento" ajuda="Quando você paga a fatura."><input required type="number" min="1" max="31" value={form.diaVencimento} onChange={set('diaVencimento')} /></Campo>
          <Campo rotulo="Limite (opcional)" className="inteira"><input type="number" min="0" step="0.01" value={form.limite} onChange={set('limite')} /></Campo>
        </div>
        {exemplo && <Alerta tipo="info">{exemplo}</Alerta>}
        {cartao && <p className="texto-suave texto-pequeno">Ao mudar fechamento ou vencimento, todas as compras deste cartão são recolocadas nas faturas certas.</p>}
      </form>
    </Modal>
  );
}
