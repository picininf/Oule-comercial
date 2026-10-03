import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';

import './App.css';
import { useAuth } from './hooks/useAuth';
import { api } from './lib/api';
import Sidebar from './components/Sidebar';
import { ValoresProvider, ToastProvider, useValores, Carregando } from './components/ui';
import AuthPage from './pages/AuthPage';

// Páginas carregadas sob demanda: o app abre mais rápido no celular.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TransacoesPage = lazy(() => import('./pages/TransacoesPage'));
const PlanoPage = lazy(() => import('./pages/PlanoPage'));
const FuturoPage = lazy(() => import('./pages/FuturoPage'));
const ObjetivosPage = lazy(() => import('./pages/ObjetivosPage'));
const PagamentosPage = lazy(() => import('./pages/PagamentosPage'));
const CartoesPage = lazy(() => import('./pages/CartoesPage'));
const AnalisesPage = lazy(() => import('./pages/AnalisesPage'));
const RetrospectivaPage = lazy(() => import('./pages/RetrospectivaPage'));
const OpenFinancePage = lazy(() => import('./pages/OpenFinancePage'));
const ImportarExtratoPage = lazy(() => import('./pages/ImportarExtratoPage'));
const WhatsappBotPage = lazy(() => import('./pages/WhatsappBotPage'));
const PerfilPage = lazy(() => import('./pages/PerfilPage'));
const ConfiguracoesPage = lazy(() => import('./pages/ConfiguracoesPage'));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage'));
const AdminUsuariosPage = lazy(() => import('./pages/admin/AdminUsuariosPage'));
const AdminAnalisesPage = lazy(() => import('./pages/admin/AdminAnalisesPage'));
const AdminPlanejadoresPage = lazy(() => import('./pages/admin/AdminPlanejadoresPage'));

/**
 * Páginas por papel. `dinheiro: true` = a página mostra valores, então
 * ganha o botão "Ocultar valores" (antes ele aparecia até em telas sem
 * nenhum valor, como WhatsApp e Configurações).
 */
const PAGINAS_CLIENTE = [
  {
    grupo: 'Início',
    itens: [
      { id: 'inicio', nome: 'Visão Geral', icone: '📊', dinheiro: true, subtitulo: 'Como está o seu mês, com dicas para o seu dinheiro render mais.' },
      { id: 'transacoes', nome: 'Transações', icone: '💱', dinheiro: true, subtitulo: 'Extrato completo: filtre, recategorize e lance gastos manuais.' },
    ],
  },
  {
    grupo: 'Planejamento',
    itens: [
      { id: 'plano', nome: 'Plano x Vida Real', icone: '🗓️', dinheiro: true, subtitulo: 'Planeje o ano (e os próximos) e compare com o que aconteceu de verdade.' },
      { id: 'futuro', nome: 'Futuro & Aposentadoria', icone: '🔭', dinheiro: true, subtitulo: 'Para onde o seu ritmo atual leva — sonhos, patrimônio e liberdade financeira.' },
      { id: 'sonhos', nome: 'Sonhos & Metas', icone: '🎯', dinheiro: true, subtitulo: 'Cadastre seus sonhos e acompanhe quanto falta para cada um.' },
      { id: 'pagamentos', nome: 'Pagamentos do mês', icone: '🧾', dinheiro: true, subtitulo: 'Contas fixas, vencimentos e lembretes.' },
      { id: 'cartoes', nome: 'Cartões & Faturas', icone: '💳', dinheiro: true, subtitulo: 'Cada compra na fatura certa: data da compra x data do pagamento.' },
    ],
  },
  {
    grupo: 'Análises',
    itens: [
      { id: 'analises', nome: 'Análise de Gastos', icone: '📈', dinheiro: true, subtitulo: 'Seus gastos por categoria e tipo, comparados a pessoas com perfil parecido.' },
      { id: 'retrospectiva', nome: 'Retrospectiva do Ano', icone: '🎉', dinheiro: true, subtitulo: 'O seu ano em números.' },
    ],
  },
  {
    grupo: 'Conexões',
    itens: [
      { id: 'openfinance', nome: 'Open Finance', icone: '🏦', subtitulo: 'Conecte bancos e cartões para importar tudo automaticamente.' },
      { id: 'importar', nome: 'Importar Extrato', icone: '📄', subtitulo: 'Envie o extrato ou a fatura em CSV, Excel, OFX, PDF ou foto.' },
      { id: 'whatsapp', nome: 'WhatsApp Bot', icone: '📲', subtitulo: 'Comprovantes, resumo do mês e lembretes pelo WhatsApp.' },
    ],
  },
  {
    grupo: 'Conta',
    itens: [
      { id: 'perfil', nome: 'Meu Cadastro', icone: '👤', subtitulo: 'Seus dados, TAGs de perfil e código de cliente.' },
      { id: 'config', nome: 'Configurações', icone: '⚙️', subtitulo: 'Tema, exportação de dados e conexão.' },
    ],
  },
];

function paginasStaff(isAdmin) {
  return [
    {
      grupo: isAdmin ? 'Administração' : 'Meus clientes',
      itens: [
        { id: 'visao', nome: 'Visão Geral', icone: '📊', dinheiro: true, subtitulo: isAdmin ? 'Dados consolidados de todos os clientes.' : 'Dados consolidados dos seus clientes.' },
        { id: 'clientes', nome: 'Clientes', icone: '👥', dinheiro: true, subtitulo: 'Abra um cliente para planejar, importar e ajustar tudo por ele.' },
        { id: 'analises', nome: 'Análise por Perfil', icone: '📈', dinheiro: true, subtitulo: 'Gastos por categoria cruzados por estado, faixa etária e forma de trabalho.' },
        ...(isAdmin
          ? [
              { id: 'planejadores', nome: 'Planejadores', icone: '🧭', subtitulo: 'Quem é planejador e quais clientes cada um atende.' },
              { id: 'whatsapp', nome: 'WhatsApp Bot', icone: '📲', subtitulo: 'Conexão do número do assistente.' },
            ]
          : []),
      ],
    },
    {
      grupo: 'Conta',
      itens: [
        { id: 'perfil', nome: 'Meu Cadastro', icone: '👤', subtitulo: 'Seus dados de acesso.' },
        { id: 'config', nome: 'Configurações', icone: '⚙️', subtitulo: 'Tema e conexão.' },
      ],
    },
  ];
}

// ---------------------------------------------------------------------
// Tema (claro / noturno / seguir o sistema)
// ---------------------------------------------------------------------
function lerTema() {
  try {
    const salvo = JSON.parse(localStorage.getItem('app_configs') || '{}');
    return ['claro', 'noturno', 'sistema'].includes(salvo.tema) ? salvo.tema : 'claro';
  } catch {
    return 'claro';
  }
}

function useTema() {
  const [tema, setTema] = useState(lerTema);
  useEffect(() => {
    try {
      localStorage.setItem('app_configs', JSON.stringify({ tema }));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const aplicar = () => {
      const escuro = tema === 'noturno' || (tema === 'sistema' && mq.matches);
      document.documentElement.classList.toggle('dark', escuro);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#070b14' : '#111827');
    };
    aplicar();
    if (tema !== 'sistema') return undefined;
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, [tema]);
  return [tema, setTema];
}

// ---------------------------------------------------------------------
// Aba atual guardada no endereço (#plano): F5 e "voltar" funcionam.
// ---------------------------------------------------------------------
function useAbaNaUrl(padrao, validas) {
  const ler = useCallback(() => {
    const hash = window.location.hash.replace('#', '');
    return validas.includes(hash) ? hash : padrao;
  }, [padrao, validas]);
  const [aba, setAbaState] = useState(ler);

  useEffect(() => {
    setAbaState(ler());
    const onHash = () => setAbaState(ler());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [ler]);

  const setAba = useCallback((nova) => {
    if (window.location.hash !== `#${nova}`) window.location.hash = nova;
    setAbaState(nova);
    window.scrollTo({ top: 0 });
  }, []);
  return [aba, setAba];
}

function BotaoOcultarValores() {
  const { ocultar, setOcultar } = useValores();
  return (
    <button type="button" className="btn btn-secundario" onClick={() => setOcultar(!ocultar)} aria-pressed={ocultar}>
      {ocultar ? '👁️ Mostrar valores' : '🙈 Ocultar valores'}
    </button>
  );
}

function Layout({ grupos, abaAtiva, setAbaAtiva, user, role, onLogout, children }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const pagina = grupos.flatMap((g) => g.itens).find((i) => i.id === abaAtiva);

  useEffect(() => {
    document.title = pagina ? `${pagina.nome} · Oule` : 'Oule';
  }, [pagina]);

  return (
    <div className="app-container">
      <header className="barra-mobile">
        <span className="marca-titulo">OULE</span>
        <button type="button" className="btn-menu" aria-label="Abrir menu" onClick={() => setMenuAberto(true)}>☰</button>
      </header>
      <Sidebar
        grupos={grupos}
        abaAtiva={abaAtiva}
        setAbaAtiva={setAbaAtiva}
        user={user}
        role={role}
        onLogout={onLogout}
        aberta={menuAberto}
        onFechar={() => setMenuAberto(false)}
      />
      <main className="main-content">
        <div className="topbar">
          <div>
            <h1 className="page-title">{pagina?.icone} {pagina?.nome}</h1>
            {pagina?.subtitulo && <p className="page-subtitle">{pagina.subtitulo}</p>}
          </div>
          {pagina?.dinheiro && (
            <div className="topbar-actions">
              <BotaoOcultarValores />
            </div>
          )}
        </div>
        <Suspense fallback={<Carregando />}>{children}</Suspense>
      </main>
    </div>
  );
}

function AreaCliente({ user, role, logout, tema, setTema, recarregarPerfil }) {
  const ids = useMemo(() => PAGINAS_CLIENTE.flatMap((g) => g.itens.map((i) => i.id)), []);
  const [aba, setAba] = useAbaNaUrl('inicio', ids);

  return (
    <Layout grupos={PAGINAS_CLIENTE} abaAtiva={aba} setAbaAtiva={setAba} user={user} role={role} onLogout={logout}>
      {aba === 'inicio' && <DashboardPage onNavegar={setAba} />}
      {aba === 'transacoes' && <TransacoesPage />}
      {aba === 'plano' && <PlanoPage />}
      {aba === 'futuro' && <FuturoPage />}
      {aba === 'sonhos' && <ObjetivosPage />}
      {aba === 'pagamentos' && <PagamentosPage />}
      {aba === 'cartoes' && <CartoesPage />}
      {aba === 'analises' && <AnalisesPage onNavegar={setAba} />}
      {aba === 'retrospectiva' && <RetrospectivaPage />}
      {aba === 'openfinance' && <OpenFinancePage />}
      {aba === 'importar' && <ImportarExtratoPage />}
      {aba === 'whatsapp' && <WhatsappBotPage isAdmin={false} />}
      {aba === 'perfil' && <PerfilPage onAtualizado={recarregarPerfil} />}
      {aba === 'config' && <ConfiguracoesPage tema={tema} setTema={setTema} />}
    </Layout>
  );
}

function AreaEquipe({ user, role, isAdmin, logout, tema, setTema, recarregarPerfil }) {
  const grupos = useMemo(() => paginasStaff(isAdmin), [isAdmin]);
  const ids = useMemo(() => grupos.flatMap((g) => g.itens.map((i) => i.id)), [grupos]);
  const [aba, setAba] = useAbaNaUrl('visao', ids);
  const [overview, setOverview] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [clienteId, setClienteId] = useState(null);

  const carregarOverview = useCallback(async () => {
    setCarregando(true);
    try {
      setOverview(await api.get('/admin/overview'));
      setErro('');
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarOverview();
  }, [carregarOverview]);

  const trocarAba = (nova) => {
    setClienteId(null);
    setAba(nova);
  };

  return (
    <Layout grupos={grupos} abaAtiva={aba} setAbaAtiva={trocarAba} user={user} role={role} onLogout={logout}>
      {aba === 'visao' && (
        <AdminOverviewPage
          overview={overview}
          loading={carregando}
          erro={erro}
          onSelecionarUsuario={(id) => {
            setClienteId(id);
            setAba('clientes');
          }}
        />
      )}
      {aba === 'clientes' && (
        <AdminUsuariosPage
          usuarios={overview?.usuarios || []}
          usuarioSelecionadoId={clienteId}
          onSelecionar={setClienteId}
          onVoltar={() => setClienteId(null)}
          onAtualizarLista={carregarOverview}
        />
      )}
      {aba === 'analises' && <AdminAnalisesPage />}
      {aba === 'planejadores' && isAdmin && <AdminPlanejadoresPage />}
      {aba === 'whatsapp' && isAdmin && <WhatsappBotPage isAdmin />}
      {aba === 'perfil' && <PerfilPage onAtualizado={recarregarPerfil} />}
      {aba === 'config' && <ConfiguracoesPage tema={tema} setTema={setTema} ehStaff />}
    </Layout>
  );
}

export default function App() {
  const { user, role, isAdmin, isStaff, carregando, login, cadastrar, logout, recuperarSenha, recarregarPerfil } = useAuth();
  const [tema, setTema] = useTema();

  let conteudo;
  if (carregando) {
    conteudo = <div className="auth-wrapper"><Carregando texto="Carregando..." /></div>;
  } else if (!user) {
    conteudo = <AuthPage onLogin={login} onCadastrar={cadastrar} onRecuperarSenha={recuperarSenha} />;
  } else if (isStaff) {
    conteudo = <AreaEquipe user={user} role={role} isAdmin={isAdmin} logout={logout} tema={tema} setTema={setTema} recarregarPerfil={recarregarPerfil} />;
  } else {
    conteudo = <AreaCliente user={user} role={role} logout={logout} tema={tema} setTema={setTema} recarregarPerfil={recarregarPerfil} />;
  }

  return (
    <ToastProvider>
      <ValoresProvider>{conteudo}</ValoresProvider>
    </ToastProvider>
  );
}
