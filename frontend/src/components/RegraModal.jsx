import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { CATEGORIAS, TIPOS_GASTO, categoriaInfo } from '../lib/categorias';
import { formatarData, formatarMoeda } from '../lib/format';
import { SENTIDOS, sugerirPadrao, descricaoDoBanco } from '../lib/regras';
import { Modal, Campo, Alerta, useToast } from './ui';

/**
 * Cria ou edita uma regra de classificação ("todo Pix para Fulano é
 * Brownie, Alimentação"). Abre a partir de uma transação (`transacao`)
 * já com o trecho sugerido, ou de uma regra existente (`regra`).
 */
export default function RegraModal({ regra = null, transacao = null, userId = null, onFechar, onSalvo }) {
  const toast = useToast();
  const [form, setForm] = useState(() => {
    if (regra) {
      return {
        padrao: regra.padrao,
        sentido: regra.sentido,
        descricao: regra.descricao || '',
        categoria: regra.categoria || '',
        tipoGasto: regra.tipoGasto || '',
        aplicarExistentes: true,
      };
    }
    const valor = Number(transacao?.valor) || -1;
    return {
      padrao: transacao ? sugerirPadrao(descricaoDoBanco(transacao)) : '',
      sentido: valor > 0 ? 'entrada' : 'saida',
      descricao: '',
      categoria: transacao && transacao.categoria !== 'Outros' ? transacao.categoria : '',
      tipoGasto: '',
      aplicarExistentes: true,
    };
  });
  const [previa, setPrevia] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const categoriaEhDespesa = !form.categoria || categoriaInfo(form.categoria).grupo === 'despesa';
  const mostraTipoGasto = form.sentido !== 'entrada' && categoriaEhDespesa;

  // Prévia: quantos lançamentos já gravados a regra pegaria.
  useEffect(() => {
    const padrao = form.padrao.trim();
    if (padrao.length < 2) {
      setPrevia(null);
      return undefined;
    }
    let cancelado = false;
    const timer = setTimeout(async () => {
      try {
        const r = await api.post('/regras/previa', { ...(userId ? { userId } : {}), padrao, sentido: form.sentido });
        if (!cancelado) setPrevia(r);
      } catch (err) {
        if (!cancelado) setPrevia({ erro: err.message });
      }
    }, 350);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [form.padrao, form.sentido, userId]);

  const salvar = async (e) => {
    e.preventDefault();
    setErro('');
    if (!form.categoria && !form.tipoGasto && !form.descricao.trim()) {
      setErro('Escolha pelo menos uma coisa para a regra fazer: novo nome, categoria ou tipo de gasto.');
      return;
    }
    setSalvando(true);
    try {
      const corpo = {
        padrao: form.padrao.trim(),
        sentido: form.sentido,
        descricao: form.descricao.trim() || null,
        categoria: form.categoria || null,
        tipoGasto: mostraTipoGasto && form.tipoGasto ? form.tipoGasto : null,
        aplicarExistentes: form.aplicarExistentes,
      };
      const r = regra
        ? await api.patch(`/regras/${regra.id}`, corpo)
        : await api.post('/regras', { ...(userId ? { userId } : {}), ...corpo });
      toast(
        r.aplicadas > 0
          ? `Regra salva e aplicada em ${r.aplicadas} lançamento(s).`
          : 'Regra salva. Ela vale para os próximos lançamentos.'
      );
      onSalvo?.(r);
      onFechar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const nomeFinal = form.descricao.trim();
  const cat = form.categoria ? categoriaInfo(form.categoria) : null;

  return (
    <Modal
      titulo={regra ? 'Editar regra' : 'Memorizar classificação'}
      subtitulo="Sempre que um lançamento com este texto aparecer (planilha, extrato, banco conectado ou WhatsApp), ele entra do jeito que você definir aqui."
      onFechar={onFechar}
      largura="md"
      rodape={
        <>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-regra" className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar regra'}</button>
        </>
      }
    >
      <form id="form-regra" onSubmit={salvar} className="pilha" style={{ gap: 16 }}>
        <Alerta>{erro}</Alerta>

        {transacao && (
          <div className="alerta alerta-info" style={{ wordBreak: 'break-word' }}>
            <strong>Lançamento de origem:</strong> {descricaoDoBanco(transacao)}
          </div>
        )}

        <Campo
          rotulo="Quando a descrição do banco contiver"
          ajuda="Use a parte que se repete — normalmente o nome de quem recebeu. Maiúsculas e acentos não importam."
        >
          <input required minLength={2} maxLength={120} value={form.padrao} onChange={set('padrao')} placeholder="Ex.: Pedro Veiga Rela Tavares" />
        </Campo>

        <div className="segmentado" role="group" aria-label="Vale para">
          {SENTIDOS.map((s) => (
            <button key={s.id} type="button" className={form.sentido === s.id ? 'ativo' : ''} onClick={() => setForm((f) => ({ ...f, sentido: s.id }))}>
              {s.id === 'saida' ? '📤 ' : s.id === 'entrada' ? '📥 ' : '⇄ '}{s.nome}
            </button>
          ))}
        </div>

        <div className="grade-form">
          <Campo rotulo="Novo nome (opcional)" className="inteira" ajuda="Como o lançamento vai aparecer no app. Ex.: Brownie">
            <input maxLength={200} value={form.descricao} onChange={set('descricao')} placeholder="Manter a descrição do banco" />
          </Campo>
          <Campo rotulo="Categoria">
            <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value, tipoGasto: '' }))}>
              <option value="">Manter a categoria automática</option>
              {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.id}</option>)}
            </select>
          </Campo>
          {mostraTipoGasto && (
            <Campo
              rotulo="Tipo de gasto"
              ajuda={cat ? `Padrão da categoria: ${TIPOS_GASTO.find((t) => t.id === cat.tipoGasto)?.nome || '—'}` : undefined}
            >
              <select value={form.tipoGasto} onChange={set('tipoGasto')}>
                <option value="">{cat ? 'Padrão da categoria' : 'Manter o automático'}</option>
                {TIPOS_GASTO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Campo>
          )}
        </div>

        {(nomeFinal || cat) && form.padrao.trim().length >= 2 && (
          <p className="texto-pequeno" style={{ margin: 0 }}>
            📌 Todo {form.sentido === 'entrada' ? 'recebimento' : form.sentido === 'saida' ? 'pagamento' : 'lançamento'} com “<strong>{form.padrao.trim()}</strong>”
            {nomeFinal && <> vai se chamar “<strong>{nomeFinal}</strong>”</>}
            {nomeFinal && cat && ' e'}
            {cat && <> vai para <strong>{cat.icone} {form.categoria}</strong></>}.
          </p>
        )}

        <PreviaRegra previa={previa} />

        <label className="check">
          <input type="checkbox" checked={form.aplicarExistentes} onChange={(e) => setForm((f) => ({ ...f, aplicarExistentes: e.target.checked }))} />
          <span>
            Aplicar também nos lançamentos que já existem
            {previa?.quantidade > 0 && <> (<strong>{previa.quantidade}</strong>)</>}
          </span>
        </label>
      </form>
    </Modal>
  );
}

function PreviaRegra({ previa }) {
  if (!previa) return null;
  if (previa.erro) return <Alerta tipo="atencao">{previa.erro}</Alerta>;
  if (previa.quantidade === 0) {
    return <p className="texto-suave texto-pequeno" style={{ margin: 0 }}>Nenhum lançamento atual tem esse texto — a regra vai valer para os próximos.</p>;
  }
  return (
    <div className="pilha" style={{ gap: 6 }}>
      <span className="texto-pequeno"><strong>{previa.quantidade}</strong> lançamento(s) já gravados casam com a regra ({formatarMoeda(previa.total)} no total):</span>
      <ul className="lista-contas texto-pequeno">
        {previa.exemplos.map((t) => (
          <li key={t.id} className="linha-entre" style={{ padding: '4px 0', borderBottom: '1px solid var(--borda)', flexWrap: 'nowrap' }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {formatarData(t.data)} · {t.descricao}
            </span>
            <span className={t.valor < 0 ? 'negativo' : 'positivo'} style={{ whiteSpace: 'nowrap' }}>{formatarMoeda(t.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
