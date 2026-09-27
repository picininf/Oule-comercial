import { useState } from 'react';
import React from 'react';
export default function AuthPage({ onLogin, onCadastrar }) {
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [bancoConectado, setBancoConectado] = useState('Nubank');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErro('');
    try {
      if (authMode === 'login') {
        await onLogin(email, password);
      } else {
        await onCadastrar({ email, password, nome, telefone, bancoConectado });
        alert('Conta criada com sucesso! Faça login.');
        setAuthMode('login');
        setPassword('');
      }
    } catch (err) {
      setErro(err.message || 'Erro durante a autenticação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-badge">OULE FINANCIAL</div>
          <h2>{authMode === 'login' ? 'Acessar Plataforma' : 'Criar sua conta'}</h2>
          <p>Inteligência financeira e Open Finance unificados.</p>
        </div>

        {erro && <div className="auth-alert error">{erro}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {authMode === 'register' && (
            <>
              <div className="form-group">
                <label>Nome Completo</label>
                <input type="text" required placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Telefone / WhatsApp</label>
                <input type="tel" required placeholder="(11) 99999-9999" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Banco Principal</label>
                <select value={bancoConectado} onChange={(e) => setBancoConectado(e.target.value)} className="select-filter" style={{ width: '100%', padding: '12px', marginTop: '6px' }}>
                  <option value="Nubank">Nubank</option>
                  <option value="Itaú">Itaú</option>
                  <option value="Bradesco">Bradesco</option>
                  <option value="Santander">Santander</option>
                  <option value="Banco do Brasil">Banco do Brasil</option>
                  <option value="Inter">Inter</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group">
            <label>E-mail</label>
            <input type="email" required placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Senha</label>
            <input type="password" required minLength={8} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Processando...' : authMode === 'login' ? 'Entrar no Sistema' : 'Cadastrar Gratuitamente'}
          </button>
        </form>

        <div className="auth-footer">
          {authMode === 'login' ? (
            <p>Não tem uma conta? <button type="button" className="btn-link" onClick={() => setAuthMode('register')}>Cadastre-se</button></p>
          ) : (
            <p>Já possui cadastro? <button type="button" className="btn-link" onClick={() => setAuthMode('login')}>Faça login</button></p>
          )}
        </div>
      </div>
    </div>
  );
}
