import React from 'react';

const ROTULO_PAPEL = {
  oule: 'ADMIN',
  planejador: 'PLANEJADOR',
  cliente: 'FINANCIAL',
};

/**
 * Menu lateral agrupado por seção. No celular vira uma gaveta (abre pelo
 * botão ☰ da barra superior) em vez de uma faixa com 13 abas espremidas.
 */
export default function Sidebar({ grupos, abaAtiva, setAbaAtiva, user, onLogout, role = 'cliente', aberta, onFechar }) {
  const descricaoPapel =
    role === 'oule' ? 'Administrador' : role === 'planejador' ? 'Planejador financeiro' : user.codigoCliente || user.bancoConectado || 'Cliente';

  return (
    <>
      {aberta && <div className="sidebar-fundo" onClick={onFechar} aria-hidden="true" />}
      <aside className={`sidebar ${aberta ? 'aberta' : ''}`} aria-label="Menu principal">
        <div className="marca">
          <div className="marca-logo">
            <span className="marca-titulo">OULE</span>
            <span className="marca-tag">{ROTULO_PAPEL[role] || 'FINANCIAL'}</span>
          </div>
          <button type="button" className="menu-fechar" aria-label="Fechar menu" onClick={onFechar}>✕</button>
        </div>

        <nav className="nav-menu">
          {grupos.map((g) => (
            <React.Fragment key={g.grupo}>
              <div className="nav-grupo">{g.grupo}</div>
              {g.itens.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={abaAtiva === item.id ? 'page' : undefined}
                  className={`nav-item ${abaAtiva === item.id ? 'active' : ''}`}
                  onClick={() => {
                    setAbaAtiva(item.id);
                    onFechar?.();
                  }}
                >
                  <span className="nav-icone" aria-hidden="true">{item.icone}</span>
                  {item.nome}
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-card">
            <div className="avatar" aria-hidden="true">{(user.nome || user.email || '?')[0].toUpperCase()}</div>
            <div className="user-info">
              <span className="user-name">{user.nome || user.email}</span>
              <span className="user-email">{descricaoPapel}</span>
            </div>
          </div>
          <button type="button" onClick={onLogout} className="btn-logout">🚪 Sair da conta</button>
        </div>
      </aside>
    </>
  );
}
