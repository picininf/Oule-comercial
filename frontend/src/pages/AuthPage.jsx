import React, { useState } from 'react';
import { Alerta, Campo } from '../components/ui';

function CampoSenha({ valor, onChange, autoComplete, rotulo = 'Senha', minLength = 8 }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <Campo rotulo={rotulo}>
      <div className="senha-campo">
        <input
          className="input"
          type={visivel ? 'text' : 'password'}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          style={{ paddingRight: 72 }}
        />
        <button type="button" onClick={() => setVisivel((v) => !v)} aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}>
          {visivel ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </Campo>
  );
}

export default function AuthPage({ onLogin, onCadastrar, onRecuperarSenha }) {
  const [modo, setModo] = useState('login'); // login | cadastro | recuperar
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const trocarModo = (novo) => {
    setModo(novo);
    setErro('');
    setSucesso('');
    setSenha('');
    setConfirmacao('');
  };

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    if (modo === 'cadastro') {
      if (senha !== confirmacao) return setErro('As senhas não conferem.');
      if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return setErro('Use letras e números na senha (mínimo 8 caracteres).');
    }

    setCarregando(true);
    try {
      if (modo === 'login') {
        await onLogin(email.trim(), senha);
      } else if (modo === 'cadastro') {
        await onCadastrar({ email: email.trim(), password: senha, nome: nome.trim(), telefone, bancoConectado: '' });
        trocarModo('login');
        setSucesso('Conta criada! Confirme o e-mail (se solicitado) e faça login.');
      } else {
        await onRecuperarSenha(email.trim());
        setSucesso('Se existir uma conta com este e-mail, você vai receber um link para criar uma nova senha.');
      }
    } catch (err) {
      setErro(err.message || 'Não foi possível concluir. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  };

  const titulos = {
    login: ['Acessar plataforma', 'Planejamento financeiro, Open Finance e seus sonhos em um só lugar.'],
    cadastro: ['Criar sua conta', 'Leva menos de um minuto.'],
    recuperar: ['Recuperar senha', 'Enviaremos um link para o seu e-mail.'],
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <span className="brand-badge">OULE FINANCIAL</span>
          <h2>{titulos[modo][0]}</h2>
          <p>{titulos[modo][1]}</p>
        </div>

        <Alerta>{erro}</Alerta>
        {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

        <form onSubmit={enviar} className="auth-form">
          {modo === 'cadastro' && (
            <>
              <Campo rotulo="Nome completo"><input className="input" required minLength={2} autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
              <Campo rotulo="Telefone / WhatsApp"><input className="input" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></Campo>
            </>
          )}
          <Campo rotulo="E-mail"><input className="input" type="email" required autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
          {modo !== 'recuperar' && (
            <CampoSenha valor={senha} onChange={setSenha} autoComplete={modo === 'login' ? 'current-password' : 'new-password'} minLength={modo === 'login' ? 1 : 8} />
          )}
          {modo === 'cadastro' && <CampoSenha rotulo="Confirme a senha" valor={confirmacao} onChange={setConfirmacao} autoComplete="new-password" />}

          <button type="submit" className="btn btn-primario btn-bloco" disabled={carregando} style={{ minHeight: 44 }}>
            {carregando ? 'Aguarde...' : modo === 'login' ? 'Entrar' : modo === 'cadastro' ? 'Criar conta' : 'Enviar link'}
          </button>
        </form>

        <div className="auth-footer pilha" style={{ gap: 8 }}>
          {modo === 'login' && (
            <>
              <button type="button" className="btn-link" onClick={() => trocarModo('recuperar')}>Esqueci minha senha</button>
              <p>Não tem conta? <button type="button" className="btn-link" onClick={() => trocarModo('cadastro')}>Cadastre-se</button></p>
            </>
          )}
          {modo !== 'login' && <p>Já tem conta? <button type="button" className="btn-link" onClick={() => trocarModo('login')}>Entrar</button></p>}
        </div>
      </div>
    </div>
  );
}
