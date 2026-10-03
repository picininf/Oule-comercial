import React, { Suspense, lazy, useState } from 'react';
import { Abas, Carregando } from '../components/ui';

/**
 * Páginas que agrupam telas parecidas em sub-abas, para o menu ter poucas
 * entradas. Funcionam de dois jeitos:
 *  - controladas (`sub` + `onSub`): a área do cliente guarda a sub-aba no
 *    endereço (#contas/cartoes), então F5 e "voltar" funcionam;
 *  - soltas: dentro da ficha de um cliente (planejador), guardam a
 *    sub-aba só na memória.
 */

const TransacoesPage = lazy(() => import('./TransacoesPage'));
const RegrasPage = lazy(() => import('./RegrasPage'));
const PagamentosPage = lazy(() => import('./PagamentosPage'));
const CartoesPage = lazy(() => import('./CartoesPage'));
const PlanoPage = lazy(() => import('./PlanoPage'));
const FuturoPage = lazy(() => import('./FuturoPage'));
const RetrospectivaPage = lazy(() => import('./RetrospectivaPage'));
const ImportarExtratoPage = lazy(() => import('./ImportarExtratoPage'));
const OpenFinancePage = lazy(() => import('./OpenFinancePage'));
const WhatsappBotPage = lazy(() => import('./WhatsappBotPage'));
const PerfilPage = lazy(() => import('./PerfilPage'));
const ConfiguracoesPage = lazy(() => import('./ConfiguracoesPage'));

export const SECOES = {
  transacoes: [
    { id: 'extrato', nome: 'Extrato', icone: '🧾' },
    { id: 'regras', nome: 'Regras automáticas', icone: '📌' },
  ],
  contas: [
    { id: 'pagamentos', nome: 'Contas do mês', icone: '🗓️' },
    { id: 'cartoes', nome: 'Cartões e faturas', icone: '💳' },
  ],
  plano: [
    { id: 'ano', nome: 'Plano do ano', icone: '🗓️' },
    { id: 'futuro', nome: 'Futuro & aposentadoria', icone: '🔭' },
    { id: 'retrospectiva', nome: 'Retrospectiva', icone: '🎉' },
  ],
  conectar: [
    { id: 'importar', nome: 'Importar extrato', icone: '📄' },
    { id: 'openfinance', nome: 'Conectar banco', icone: '🏦' },
    { id: 'whatsapp', nome: 'WhatsApp', icone: '📲' },
  ],
  conta: [
    { id: 'perfil', nome: 'Meu cadastro', icone: '👤' },
    { id: 'config', nome: 'Configurações', icone: '⚙️' },
  ],
};

function Agrupada({ secoes, sub, onSub, children }) {
  const [local, setLocal] = useState(secoes[0].id);
  const pedida = onSub ? sub : local;
  const ativa = secoes.some((s) => s.id === pedida) ? pedida : secoes[0].id;
  return (
    <div>
      <Abas abas={secoes} ativa={ativa} onTrocar={onSub || setLocal} />
      <Suspense fallback={<Carregando />}>{children(ativa)}</Suspense>
    </div>
  );
}

export function TransacoesAgrupada({ userId = null, sub, onSub }) {
  return (
    <Agrupada secoes={SECOES.transacoes} sub={sub} onSub={onSub}>
      {(s) => (s === 'regras' ? <RegrasPage userId={userId} /> : <TransacoesPage userId={userId} />)}
    </Agrupada>
  );
}

export function ContasAgrupada({ userId = null, sub, onSub }) {
  return (
    <Agrupada secoes={SECOES.contas} sub={sub} onSub={onSub}>
      {(s) => (s === 'cartoes' ? <CartoesPage userId={userId} /> : <PagamentosPage userId={userId} />)}
    </Agrupada>
  );
}

export function PlanejamentoAgrupada({ userId = null, sub, onSub }) {
  return (
    <Agrupada secoes={SECOES.plano} sub={sub} onSub={onSub}>
      {(s) =>
        s === 'futuro' ? <FuturoPage userId={userId} />
          : s === 'retrospectiva' ? <RetrospectivaPage userId={userId} />
            : <PlanoPage userId={userId} />}
    </Agrupada>
  );
}

export function ConectarAgrupada({ sub, onSub }) {
  return (
    <Agrupada secoes={SECOES.conectar} sub={sub} onSub={onSub}>
      {(s) =>
        s === 'openfinance' ? <OpenFinancePage />
          : s === 'whatsapp' ? <WhatsappBotPage isAdmin={false} />
            : <ImportarExtratoPage />}
    </Agrupada>
  );
}

export function ContaAgrupada({ sub, onSub, tema, setTema, onPerfilAtualizado }) {
  return (
    <Agrupada secoes={SECOES.conta} sub={sub} onSub={onSub}>
      {(s) => (s === 'config' ? <ConfiguracoesPage tema={tema} setTema={setTema} /> : <PerfilPage onAtualizado={onPerfilAtualizado} />)}
    </Agrupada>
  );
}
