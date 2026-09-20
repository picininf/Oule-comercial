import React from 'react';

const ROTULO_PAPEL = {
  oule: 'ADMIN',
  planejador: 'PLANEJADOR',
  cliente: 'FINANCIAL',
};

export default function Sidebar({ abaAtiva, setAbaAtiva, user, onLogout, role = 'cliente' }) {
  const itensCliente = [
    { id: 'Dashboard', label: '📊 Visão Geral' },
    { id: 'Transações', label: '💳 Transações & Extrato' },
    { id: 'Objetivos', label: '🎯 Sonhos & Metas' },
    { id: 'OpenFinance', label: '🏦 Open Finance' },
    { id: 'WhatsApp Bot', label: '📲 WhatsApp Bot IA' },
    { id: 'Configurações', label: '⚙️ Configurações' },
  ];

  // Planejador enxerga uma versão do painel administrativo, mas
  // restrita aos próprios clientes (o backend garante isso). Não vê a
  // gestão de planejadores nem o WhatsApp Bot (número compartilhado,
  // gerido só pelo oule).
  const itensPlanejador = [
    { id: 'Visão Geral', label: '📊 Meus Clientes (Visão Geral)' },
    { id: 'Usuários', label: '👥 Meus Clientes' },
    { id: 'Configurações', label: '⚙️ Configurações' },
  ];

  const itensOule = [
    { id: 'Visão Geral', label: '📊 Visão Geral (Todos)' },
    { id: 'Usuários', label: '👥 Usuários' },
    { id: 'Planejadores', label: '🧭 Planejadores' },
    { id: 'WhatsApp Bot', label: '📲 WhatsApp Bot IA' },
    { id: 'Configurações', label: '⚙️ Configurações' },
  ];

  const itens = role === 'oule' ? itensOule : role === 'planejador' ? itensPlanejador : itensCliente;
  const isStaff = role === 'oule' || role === 'planejador';

  return (
    <aside className="sidebar">
      <div>
        <div className="brand-container">
          <div className="brand-logo-box">
            <span className="brand-title">OULE</span>
            <span className="brand-tag">{ROTULO_PAPEL[role] || 'FINANCIAL'}</span>
          </div>
        </div>

        <nav className="nav-menu" aria-label="Navegação principal">
          {itens.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              aria-current={abaAtiva === item.id ? 'page' : undefined}
              className={`nav-item ${abaAtiva === item.id ? 'active' : ''}`}
              onClick={() => setAbaAtiva(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setAbaAtiva(item.id);
                }
              }}
            >
              {item.label}
            </div>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="user-profile-card">
          <div className="avatar">{user.nome ? user.nome[0].toUpperCase() : '👤'}</div>
          <div className="user-info">
            <span className="user-name">{user.nome || user.email}</span>
            <span className="user-email">
              {role === 'oule' ? 'Administrador' : role === 'planejador' ? 'Planejador Financeiro' : (user.bancoConectado || 'Conta Principal')}
            </span>
          </div>
        </div>
        <button onClick={onLogout} className="btn-logout">🚪 Sair da Conta</button>
      </div>
    </aside>
  );
}
