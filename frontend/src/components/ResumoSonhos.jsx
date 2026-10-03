import React, { useState } from 'react';
import { Card, Modal, Vazio, Barra, useValores } from './ui';
import { useApi } from '../hooks/useApi';
import { formatarData, qs } from '../lib/format';

const ICONE = {
  Financeira: '💰', 'Reserva de emergência': '🛟', Viagem: '✈️', Casa: '🏠', Carro: '🚗',
  Eletrônicos: '💻', Educação: '🎓', Saúde: '🩺', Casamento: '💍', Outro: '🌟',
};

function mesesAte(prazo) {
  if (!prazo) return null;
  const hoje = new Date();
  const [a, m] = prazo.split('-').map(Number);
  return Math.max((a - hoje.getFullYear()) * 12 + (m - 1 - hoje.getMonth()), 0);
}

/** Mais perto de acontecer primeiro (prazo), depois os mais adiantados. */
function ordenar(a, b) {
  const pa = a.prazo || '9999';
  const pb = b.prazo || '9999';
  return pa.localeCompare(pb) || b.progresso - a.progresso;
}

/**
 * Sonhos & Metas resumidos no Início: os 3 mais próximos e um pop-up com
 * todos. Gerenciar (criar, guardar dinheiro, editar) continua na aba
 * Sonhos & Metas.
 */
export default function ResumoSonhos({ userId = null, onNavegar }) {
  const { fmt } = useValores();
  const { dados } = useApi(`/objetivos${qs({ userId })}`);
  const [aberto, setAberto] = useState(false);

  const ativos = (dados || []).filter((o) => o.status === 'em_andamento').sort(ordenar);
  const realizados = (dados || []).filter((o) => o.status === 'concluido').length;
  const alvo = ativos.reduce((s, o) => s + o.valorAlvo, 0);
  const guardado = ativos.reduce((s, o) => s + o.valorAtual, 0);
  const porMes = ativos.reduce((s, o) => {
    const meses = mesesAte(o.prazo);
    return meses ? s + Math.max(o.valorAlvo - o.valorAtual, 0) / meses : s;
  }, 0);

  return (
    <Card
      titulo="Meus sonhos"
      icone="🎯"
      acoes={ativos.length > 0 && <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setAberto(true)}>Ver todos ({ativos.length})</button>}
    >
      {!dados ? null : ativos.length === 0 ? (
        <Vazio
          icone="🌟"
          texto={realizados ? `${realizados} sonho(s) já realizado(s)! Que tal o próximo?` : 'Viagem, casa, reserva de emergência... Cadastre um sonho e acompanhe quanto falta.'}
          acao={onNavegar && <button type="button" className="btn btn-primario btn-pequeno" onClick={() => onNavegar('sonhos')}>+ Cadastrar sonho</button>}
        />
      ) : (
        <div className="pilha" style={{ gap: 14 }}>
          <p className="texto-pequeno" style={{ margin: 0 }}>
            <strong>{fmt(guardado)}</strong> guardados de <strong>{fmt(alvo)}</strong>
            {porMes > 0 && <> · guardar <strong>{fmt(porMes)}</strong>/mês para cumprir os prazos</>}
          </p>
          {ativos.slice(0, 3).map((o) => <LinhaSonho key={o.id} sonho={o} />)}
          {onNavegar && (
            <button type="button" className="btn btn-fantasma btn-pequeno" style={{ alignSelf: 'flex-start' }} onClick={() => onNavegar('sonhos')}>
              Gerenciar sonhos →
            </button>
          )}
        </div>
      )}

      {aberto && (
        <Modal
          titulo="Meus sonhos"
          subtitulo={`${fmt(guardado)} guardados de ${fmt(alvo)}${realizados ? ` · ${realizados} já realizado(s) 🎉` : ''}`}
          onFechar={() => setAberto(false)}
          rodape={
            <>
              <button type="button" className="btn btn-secundario" onClick={() => setAberto(false)}>Fechar</button>
              {onNavegar && <button type="button" className="btn btn-primario" onClick={() => { setAberto(false); onNavegar('sonhos'); }}>Gerenciar sonhos</button>}
            </>
          }
        >
          <div className="pilha" style={{ gap: 18 }}>
            {ativos.map((o) => <LinhaSonho key={o.id} sonho={o} detalhado />)}
          </div>
        </Modal>
      )}
    </Card>
  );
}

function LinhaSonho({ sonho: o, detalhado = false }) {
  const { fmt } = useValores();
  const meses = mesesAte(o.prazo);
  const falta = Math.max(o.valorAlvo - o.valorAtual, 0);
  return (
    <div>
      <div className="item-barra-topo">
        <span className="item-barra-nome">{ICONE[o.categoria] || '🏷️'} {o.titulo}</span>
        <span className="item-barra-valor">{Math.round(o.progresso)}%</span>
      </div>
      <Barra pct={o.progresso} cor={o.progresso >= 100 ? 'var(--sucesso)' : undefined} />
      <div className="texto-suave texto-pequeno" style={{ marginTop: 4 }}>
        {fmt(o.valorAtual)} de {fmt(o.valorAlvo)}
        {o.prazo && <> · até {formatarData(o.prazo)}</>}
        {falta > 0 && meses > 0 && <> · guardar {fmt(falta / meses)}/mês</>}
        {falta > 0 && meses === 0 && <span className="negativo"> · prazo chegou, faltam {fmt(falta)}</span>}
      </div>
      {detalhado && o.descricao && <p className="texto-pequeno" style={{ margin: '4px 0 0' }}>{o.descricao}</p>}
    </div>
  );
}
