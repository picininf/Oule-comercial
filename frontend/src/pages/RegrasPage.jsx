import React, { useMemo, useState } from 'react';
import RegraModal from '../components/RegraModal';
import { Card, Vazio, Carregando, Alerta, Modal, useValores, useToast } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { categoriaInfo, TIPO_GASTO_POR_ID } from '../lib/categorias';
import { mesAtual, qs, somarMeses } from '../lib/format';
import { normalizarTexto, regraCasa, sugerirPadrao, descricaoDoBanco, SENTIDOS } from '../lib/regras';

/**
 * Minhas regras: o cliente ensina o app a reconhecer Pix e compras que
 * se repetem ("Pix para Pedro Veiga = Brownie, Alimentação"). `userId` =
 * planejador configurando para um cliente.
 */
export default function RegrasPage({ userId = null }) {
  const { fmt } = useValores();
  const toast = useToast();
  const { dados: regras, carregando, erro, recarregar } = useApi(`/regras${qs({ userId })}`);
  const { dados: transacoes, recarregar: recarregarTransacoes } = useApi(`/transacoes${qs({ userId, de: `${somarMeses(mesAtual(), -5)}-01` })}`);
  const [modal, setModal] = useState(null); // { regra } | { transacao } | {}
  const [excluindo, setExcluindo] = useState(null);

  const sugestoes = useMemo(() => sugerirRegras(transacoes || [], regras || []), [transacoes, regras]);

  const salvo = () => {
    recarregar();
    recarregarTransacoes();
  };

  const alternarAtivo = async (r) => {
    try {
      await api.patch(`/regras/${r.id}`, { ativo: !r.ativo, aplicarExistentes: false });
      toast(r.ativo ? 'Regra pausada: os próximos lançamentos não serão mais classificados por ela.' : 'Regra reativada.');
      recarregar();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  return (
    <div className="pilha">
      <Card titulo="Como funciona" icone="💡">
        <p style={{ margin: 0 }}>
          Seu banco manda descrições como <em>“Transferência enviada pelo Pix - Pedro Veiga Rela Tavares - •••.007.268-••…”</em>, que caem em
          <strong> Outros</strong>. Você sabe que é o <strong>brownie</strong>: crie uma regra uma vez e, daqui para frente, todo lançamento com esse
          nome entra com o nome, a categoria e o tipo de gasto que você escolher — venha da planilha, do extrato, do banco conectado ou do WhatsApp.
        </p>
        <p className="texto-suave texto-pequeno" style={{ marginBottom: 0 }}>
          Atalho: em <strong>Transações</strong>, clique no 📌 ao lado de qualquer lançamento.
        </p>
      </Card>

      {sugestoes.length > 0 && (
        <Card titulo="Sugestões para você" icone="✨" acoes={<span className="tag">{sugestoes.length}</span>}>
          <p className="texto-suave texto-pequeno" style={{ marginTop: 0 }}>Lançamentos que se repetem e ainda estão em “Outros”:</p>
          <ul className="lista-contas">
            {sugestoes.map((s) => (
              <li key={s.chave} className="linha-entre" style={{ padding: '10px 0', borderBottom: '1px solid var(--borda)' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: 'var(--texto-forte)' }}>{s.padrao}</strong>
                  <div className="texto-suave texto-pequeno">
                    {s.quantidade}x · {fmt(s.total)} · {s.sentido === 'entrada' ? 'recebimentos' : 'pagamentos'}
                  </div>
                </div>
                <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setModal({ transacao: s.exemplo })}>📌 Criar regra</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        titulo="Minhas regras"
        icone="📌"
        acoes={<button type="button" className="btn btn-primario" onClick={() => setModal({})}>+ Nova regra</button>}
      >
        <Alerta>{erro}</Alerta>
        {carregando && !regras ? (
          <Carregando texto="Carregando suas regras..." />
        ) : !regras || regras.length === 0 ? (
          !erro && <Vazio icone="📌" titulo="Nenhuma regra ainda" texto="Crie uma regra para que Pix e compras repetidas entrem sempre com o nome e a categoria certos." />
        ) : (
          <ul className="lista-contas">
            {regras.map((r) => (
              <LinhaRegra
                key={r.id}
                regra={r}
                onEditar={() => setModal({ regra: r })}
                onAlternar={() => alternarAtivo(r)}
                onExcluir={() => setExcluindo(r)}
              />
            ))}
          </ul>
        )}
      </Card>

      {modal && (
        <RegraModal regra={modal.regra} transacao={modal.transacao} userId={userId} onFechar={() => setModal(null)} onSalvo={salvo} />
      )}
      {excluindo && <ExcluirRegra regra={excluindo} onFechar={() => setExcluindo(null)} onExcluida={salvo} />}
    </div>
  );
}

function LinhaRegra({ regra: r, onEditar, onAlternar, onExcluir }) {
  const cat = r.categoria ? categoriaInfo(r.categoria) : null;
  const tipo = TIPO_GASTO_POR_ID[r.tipoGasto];
  const sentido = SENTIDOS.find((s) => s.id === r.sentido)?.nome || '';
  return (
    <li className="linha-entre" style={{ padding: '12px 0', borderBottom: '1px solid var(--borda)', opacity: r.ativo ? 1 : 0.55, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <div className="texto-pequeno texto-suave">Quando contiver ({sentido.toLowerCase()})</div>
        <strong style={{ color: 'var(--texto-forte)', wordBreak: 'break-word' }}>“{r.padrao}”</strong>
        <div className="linha" style={{ marginTop: 6, gap: 6 }}>
          <span aria-hidden="true">→</span>
          {r.descricao && <span className="tag">✏️ {r.descricao}</span>}
          {cat && <span className="tag-categoria">{cat.icone} {r.categoria}</span>}
          {tipo && <span className="tag" style={{ color: tipo.cor }}>{tipo.curto}</span>}
          {!r.ativo && <span className="tag tag-atencao">pausada</span>}
        </div>
        <div className="texto-suave texto-pequeno" style={{ marginTop: 4 }}>{r.lancamentos} lançamento(s) classificados por esta regra</div>
      </div>
      <div className="linha" style={{ flexWrap: 'nowrap', gap: 4 }}>
        <button type="button" className="btn btn-fantasma btn-icone" title={r.ativo ? 'Pausar' : 'Reativar'} aria-label={r.ativo ? 'Pausar regra' : 'Reativar regra'} onClick={onAlternar}>{r.ativo ? '⏸️' : '▶️'}</button>
        <button type="button" className="btn btn-fantasma btn-icone" title="Editar" aria-label="Editar regra" onClick={onEditar}>✏️</button>
        <button type="button" className="btn btn-fantasma btn-icone" title="Excluir" aria-label="Excluir regra" onClick={onExcluir}>🗑️</button>
      </div>
    </li>
  );
}

function ExcluirRegra({ regra, onFechar, onExcluida }) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const excluir = async (desfazer) => {
    setOcupado(true);
    try {
      const r = await api.delete(`/regras/${regra.id}${desfazer ? '?desfazer=1' : ''}`);
      toast(desfazer && r?.restauradas ? `Regra excluída. ${r.restauradas} lançamento(s) voltaram ao nome do banco.` : 'Regra excluída.');
      onExcluida?.();
      onFechar();
    } catch (err) {
      toast(err.message, 'erro');
      setOcupado(false);
    }
  };
  return (
    <Modal
      titulo="Excluir regra"
      largura="sm"
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar} disabled={ocupado}>Cancelar</button>
          {regra.descricao && regra.lancamentos > 0 && (
            <button type="button" className="btn btn-secundario" onClick={() => excluir(true)} disabled={ocupado}>Excluir e voltar nomes</button>
          )}
          <button type="button" className="btn btn-perigo" onClick={() => excluir(false)} disabled={ocupado}>Excluir</button>
        </>
      }
    >
      <p className="texto-modal">
        Os próximos lançamentos com “{regra.padrao}” deixam de ser classificados automaticamente.
        {regra.lancamentos > 0 && ' Os lançamentos que já existem continuam com a categoria atual.'}
        {regra.descricao && regra.lancamentos > 0 && ' Se quiser, eles podem voltar a mostrar a descrição original do banco.'}
      </p>
    </Modal>
  );
}

/**
 * Agrupa lançamentos em "Outros" pelo trecho sugerido (nome de quem
 * recebeu) e devolve os que se repetem e ainda não têm regra.
 */
function sugerirRegras(transacoes, regras) {
  const grupos = new Map();
  for (const t of transacoes) {
    if (t.categoria !== 'Outros' || t.regra_id) continue;
    const descricao = descricaoDoBanco(t);
    if (regras.some((r) => regraCasa(r, descricao, t.valor))) continue;
    const padrao = sugerirPadrao(descricao);
    if (normalizarTexto(padrao).length < 3) continue;
    const sentido = Number(t.valor) > 0 ? 'entrada' : 'saida';
    const chave = `${sentido}|${normalizarTexto(padrao)}`;
    const g = grupos.get(chave) || { chave, padrao, sentido, quantidade: 0, total: 0, exemplo: t };
    g.quantidade += 1;
    g.total += Math.abs(Number(t.valor) || 0);
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .filter((g) => g.quantidade >= 2)
    .sort((a, b) => b.quantidade - a.quantidade || b.total - a.total)
    .slice(0, 8);
}
