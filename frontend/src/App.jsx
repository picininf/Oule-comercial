import React, { useState, useEffect, useCallback } from 'react';

import { useAuth } from './hooks/useAuth';
import { fetchApi } from './lib/api';
import { getValorAjustado } from './lib/finance';
import './App.css';
import Sidebar from './components/Sidebar';
import MetricCard from './components/MetricCard';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import TransacoesPage from './pages/TransacoesPage';
import OpenFinancePage from './pages/OpenFinancePage';
import WhatsappBotPage from './pages/WhatsappBotPage';
import ConfiguracoesPage from './pages/ConfiguracoesPage';
import AdminOverviewPage from './pages/admin/AdminOverviewPage';
import AdminUsuariosPage from './pages/admin/AdminUsuariosPage';
import AdminPlanejadoresPage from './pages/admin/AdminPlanejadoresPage';
import ObjetivosPage from './pages/ObjetivosPage';

export default function App() {
  const { user, role, isAdmin, isStaff, carregando, login, cadastrar, logout } = useAuth();

  const [transacoes, setTransacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState('Dashboard');
  const [esconderValores, setEsconderValores] = useState(false);

  const [configs, setConfigs] = useState(() => {
    const salvo = localStorage.getItem('app_configs'); // apenas preferências de UI, nunca dados financeiros
    return salvo ? JSON.parse(salvo) : { tema: 'claro', limiteGastos: 5000, moeda: 'BRL' };
  });

  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');

  // Estado exclusivo da visão de administrador.
  const [adminAba, setAdminAba] = useState('Visão Geral');
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState(null);

  useEffect(() => {
    localStorage.setItem('app_configs', JSON.stringify(configs));
    document.documentElement.classList.toggle('dark', configs.tema === 'noturno');
  }, [configs]);

  const fetchTransacoes = useCallback(async () => {
    if (!user?.id || isStaff) return;
    setLoading(true);
    try {
      const data = await fetchApi('/transacoes');
      setTransacoes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao buscar transações:', err.message);
      setTransacoes([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isStaff]);

  useEffect(() => {
    fetchTransacoes();
  }, [fetchTransacoes]);

  const fetchAdminOverview = useCallback(async () => {
    setAdminLoading(true);
    try {
      const data = await fetchApi('/admin/overview');
      setAdminOverview(data);
    } catch (err) {
      console.error('Erro ao buscar visão geral administrativa:', err.message);
    } finally {
      setAdminLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isStaff) fetchAdminOverview();
  }, [isStaff, fetchAdminOverview]);

  const totalEntradas = transacoes.map(getValorAjustado).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const totalSaidas = transacoes.map(getValorAjustado).filter((v) => v < 0).reduce((a, b) => a + Math.abs(b), 0);
  const saldoLiquido = totalEntradas - totalSaidas;
  const taxaPoupanca = totalEntradas > 0 ? ((totalEntradas - totalSaidas) / totalEntradas) * 100 : 0;

  const gastosPorCategoria = transacoes.reduce((acc, t) => {
    const valor = getValorAjustado(t);
    if (valor < 0) {
      const cat = t.categoria || 'Outros';
      acc[cat] = (acc[cat] || 0) + Math.abs(valor);
    }
    return acc;
  }, {});
  const categoriasOrdenadas = Object.entries(gastosPorCategoria).sort((a, b) => b[1] - a[1]);

  const formatCurrency = (val) => {
    if (esconderValores) return '••••••';
    const simbolos = { BRL: 'R$', USD: '$', EUR: '€' };
    const simbolo = simbolos[configs.moeda] || 'R$';
    return `${simbolo} ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (carregando) {
    return <div className="auth-wrapper"><p>Carregando...</p></div>;
  }

  if (!user) {
    return <AuthPage onLogin={login} onCadastrar={cadastrar} />;
  }

  // ---------------------------------------------------------------------
  // Visão "staff" (oule/admin ou planejador): interface própria,
  // separada da dos clientes comuns. Vê dados agregados e individuais
  // dos usuários dentro do seu escopo — o backend já filtra isso por
  // papel, então o frontend só precisa decidir o que MOSTRAR (ex.: a
  // aba "Planejadores" só existe para quem é 'oule').
  // ---------------------------------------------------------------------
  if (isStaff) {
    const abrirUsuario = (userId) => {
      setUsuarioSelecionadoId(userId);
      setAdminAba('Usuários');
    };

    return (
      <div className="app-container">
        <Sidebar
          abaAtiva={adminAba}
          setAbaAtiva={(aba) => { setAdminAba(aba); setUsuarioSelecionadoId(null); }}
          user={user}
          onLogout={logout}
          role={role}
        />

        <main className="main-content">
          <div className="topbar">
            <div>
              <h1 className="page-title">{adminAba}</h1>
              <p className="page-subtitle">
                {isAdmin
                  ? 'Painel administrativo — dados consolidados de todos os usuários.'
                  : 'Painel do planejador — dados dos clientes sob sua responsabilidade.'}
              </p>
            </div>
            <div className="topbar-actions">
              <button className="btn-secondary" onClick={() => setEsconderValores(!esconderValores)}>
                {esconderValores ? '👁️ Exibir Valores' : '🙈 Ocultar Valores'}
              </button>
            </div>
          </div>

          {adminAba === 'Visão Geral' && (
            <AdminOverviewPage
              overview={adminOverview}
              loading={adminLoading}
              formatCurrency={formatCurrency}
              onSelecionarUsuario={abrirUsuario}
            />
          )}

          {adminAba === 'Usuários' && (
            <AdminUsuariosPage
              usuarios={adminOverview?.usuarios || []}
              usuarioSelecionadoId={usuarioSelecionadoId}
              onSelecionar={setUsuarioSelecionadoId}
              onVoltar={() => setUsuarioSelecionadoId(null)}
              formatCurrency={formatCurrency}
            />
          )}

          {/* Só o oule administra o vínculo planejador ↔ cliente. */}
          {adminAba === 'Planejadores' && isAdmin && <AdminPlanejadoresPage />}

          {/* O admin é quem conecta o número do robô: a aba do WhatsApp
              mostra o QR Code de pareamento (rota protegida no backend). */}
          {adminAba === 'WhatsApp Bot' && isAdmin && <WhatsappBotPage isAdmin />}

          {adminAba === 'Configurações' && (
            <ConfiguracoesPage configs={configs} setConfigs={setConfigs} transacoes={[]} />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar abaAtiva={abaAtiva} setAbaAtiva={setAbaAtiva} user={user} onLogout={logout} role={role} />

      <main className="main-content">
        <div className="topbar">
          <div>
            <h1 className="page-title">{abaAtiva}</h1>
            <p className="page-subtitle">Acompanhe seus fluxos, despesas e conexões em tempo real.</p>
          </div>
          <div className="topbar-actions">
            <button className="btn-secondary" onClick={() => setEsconderValores(!esconderValores)}>
              {esconderValores ? '👁️ Exibir Valores' : '🙈 Ocultar Valores'}
            </button>
          </div>
        </div>

        {/* Saldo líquido / entradas / saídas só fazem sentido junto do
            extrato — nas telas de Open Finance, WhatsApp Bot e
            Configurações elas só ocupavam espaço sem contexto. */}
        {(abaAtiva === 'Dashboard' || abaAtiva === 'Transações') && (
          <div className="metrics-grid">
            <MetricCard label="SALDO LÍQUIDO" icon="💰" value={formatCurrency(saldoLiquido)} color={saldoLiquido >= 0 ? '#10b981' : '#ef4444'} />
            <MetricCard label="TOTAL ENTRADAS" icon="📥" value={formatCurrency(totalEntradas)} color="#10b981" />
            <MetricCard label="TOTAL SAÍDAS" icon="📤" value={formatCurrency(totalSaidas)} color="#ef4444" />
          </div>
        )}

        {abaAtiva === 'Dashboard' && (
          <DashboardPage
            transacoes={transacoes}
            categoriasOrdenadas={categoriasOrdenadas}
            totalSaidas={totalSaidas}
            taxaPoupanca={taxaPoupanca}
            formatCurrency={formatCurrency}
            getValorAjustado={getValorAjustado}
          />
        )}

        {abaAtiva === 'Objetivos' && (
          <ObjetivosPage formatCurrency={formatCurrency} editavel />
        )}

        {abaAtiva === 'Transações' && (
          <TransacoesPage
            transacoes={transacoes}
            loading={loading}
            busca={busca}
            setBusca={setBusca}
            filtroCategoria={filtroCategoria}
            setFiltroCategoria={setFiltroCategoria}
            onAtualizar={fetchTransacoes}
            formatCurrency={formatCurrency}
            getValorAjustado={getValorAjustado}
            userId={user.id}
          />
        )}

        {abaAtiva === 'OpenFinance' && <OpenFinancePage onSincronizado={fetchTransacoes} />}

        {abaAtiva === 'WhatsApp Bot' && <WhatsappBotPage isAdmin={false} />}

        {abaAtiva === 'Configurações' && (
          <ConfiguracoesPage configs={configs} setConfigs={setConfigs} transacoes={transacoes} />
        )}
      </main>
    </div>
  );
}
