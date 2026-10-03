import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';

import './App.css';
import { useAuth } from './hooks/useAuth';
import { api } from './lib/api';
import Sidebar from './components/Sidebar';
import { ValoresProvider, ToastProvider, useValores, Carregando } from './components/ui';
import AuthPage from './pages/AuthPage';
import {
  TransacoesAgrupada, ContasAgrupada, PlanejamentoAgrupada, ConectarAgrupada, ContaAgrupada,
} from './pages/Agrupadas';

// Páginas carregadas sob demanda: o app abre mais rápido no celular.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ObjetivosPage = lazy(() => import('./pages/ObjetivosPage'));
const PerfilPage = lazy(() => import('./pages/PerfilPage'));
const ConfiguracoesPage = lazy(() => import('./pages/ConfiguracoesPage'));
const WhatsappBotPage = lazy(() => import('./pages/WhatsappBotPage'));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage'));
const AdminUsuariosPage = lazy(() => import('./pages/admin/AdminUsuariosPage'));
const AdminAnalisesPage = lazy(() => import('./pages/admin/AdminAnalisesPage'));
const AdminPlanejadoresPage = lazy(() => import('./pages/admin/AdminPlanejadoresPage'));

/**
 * Menu do cliente: 7 entradas. Telas parecidas viraram sub-abas (ver
 * pages/Agrupadas.jsx) e a antiga "Análise de Gastos" foi para o Início.
 * `dinheiro: true` = a página mostra valores, então ganha o botão
 * "Ocultar valores".
 */
const PAGINAS_CLIENTE = [
  {
    grupo: 'Meu dinheiro',
    itens: [
      { id: 'inicio', nome: 'Início', icone: '🏠', dinheiro: true, subtitulo: 'Seu mês, seus sonhos e para onde vai o seu dinheiro.' },
      { id: 'transacoes', nome: 'Transações', icone: '💱', dinheiro: true, subtitulo: 'Tudo o que entrou e saiu. Ajuste categorias e crie regras para os lançamentos que se repetem.' },
      { id: 'contas', nome: 'Contas & Cartões', icone: '💳', dinheiro: true, subtitulo: 'Contas fixas, vencimentos e faturas dos cartões.' },
    ],
  },
  {
    grupo: 'Meu futuro',
    itens: [
      { id: 'sonhos', nome: 'Sonhos & Metas', icone: '🎯', dinheiro: true, subtitulo: 'Cadastre seus sonhos e acompanhe quanto falta para cada um.' },
      { id: 'plano', nome: 'Planejamento', icone: '🗓️', dinheiro: true, subtitulo: 'Planeje o ano, veja para onde o seu ritmo leva e reveja o ano que passou.' },
    ],
  },
  {
    grupo: 'Ajustes',
    itens: [
      { id: 'conectar', nome: 'Conectar & Importar', icone: '🔌', subtitulo: 'Traga suas transações: extrato, banco conectado ou comprovante no WhatsApp.' },
      { id: 'conta', nome: 'Minha conta', icone: '👤', subtitulo: 'Seus dados, tema e exportação.' },
    ],
  },
];

// Endereços antigos (favoritos, links do WhatsApp) -> novo lugar.
const ROTAS_ANTIGAS = {
  analises: 'inicio',
  regras: 'transacoes/regras',
  pagamentos: 'contas/pagamentos',
  cartoes: 'contas/cartoes',
  futuro: 'plano/futuro',
  retrospectiva: 'plano/retrospectiva',
  importar: 'conectar/importar',
  openfinance: 'conectar/openfinance',
  whatsapp: 'conectar/whatsapp',
  perfil: 'conta/perfil',
  config: 'conta/config',
};

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
const SEM_ROTAS_ANTIGAS = {};

/**
 * Aba (e sub-aba) guardadas no endereço: #contas/cartoes. Devolve
 * [aba, navegar, sub]; `navegar` aceita também os endereços antigos.
 */
function useAbaNaUrl(padrao, validas, antigas = SEM_ROTAS_ANTIGAS) {
  const resolver = useCallback((rota) => {
    let r = String(rota || '').replace(/^#/, '');
    if (antigas[r]) r = antigas[r];
    const [principal, sub] = r.split('/');
    if (!validas.includes(principal)) return padrao;
    return sub ? `${principal}/${sub}` : principal;
  }, [padrao, validas, antigas]);
  const [rota, setRota] = useState(() => resolver(window.location.hash));

  useEffect(() => {
    setRota(resolver(window.location.hash));
    const onHash = () => setRota(resolver(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [resolver]);

  const navegar = useCallback((nova) => {
    const r = resolver(nova);
    if (window.location.hash !== `#${r}`) window.location.hash = r;
    setRota(r);
    window.scrollTo({ top: 0 });
  }, [resolver]);
  const [aba, sub] = rota.split('/');
  return [aba, navegar, sub];
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
  const [aba, navegar, sub] = useAbaNaUrl('inicio', ids, ROTAS_ANTIGAS);
  const trocarSub = (nova) => navegar(`${aba}/${nova}`);

  return (
    <Layout grupos={PAGINAS_CLIENTE} abaAtiva={aba} setAbaAtiva={navegar} user={user} role={role} onLogout={logout}>
      {aba === 'inicio' && <DashboardPage onNavegar={navegar} />}
      {aba === 'transacoes' && <TransacoesAgrupada sub={sub} onSub={trocarSub} />}
      {aba === 'contas' && <ContasAgrupada sub={sub} onSub={trocarSub} />}
      {aba === 'sonhos' && <ObjetivosPage />}
      {aba === 'plano' && <PlanejamentoAgrupada sub={sub} onSub={trocarSub} />}
      {aba === 'conectar' && <ConectarAgrupada sub={sub} onSub={trocarSub} />}
      {aba === 'conta' && (
        <ContaAgrupada sub={sub} onSub={trocarSub} tema={tema} setTema={setTema} onPerfilAtualizado={recarregarPerfil} />
      )}
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
