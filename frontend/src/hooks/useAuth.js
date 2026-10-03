import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchApi } from '../lib/api';

/**
 * Busca o perfil unificado (nome, papel, planejador vinculado etc.) na
 * nossa API — nunca direto na tabela `profiles` do Supabase. Assim o
 * papel de cada um (cliente/planejador/oule) é sempre decidido pelo
 * backend, a única fonte de verdade, e nunca por algo que o cliente
 * poderia manipular.
 */
async function carregarPerfil(authUser) {
  try {
    const perfil = await fetchApi('/auth/me');
    return {
      id: perfil.id,
      email: perfil.email,
      nome: perfil.nome,
      telefone: perfil.telefone,
      bancoConectado: perfil.bancoConectado,
      role: perfil.role,
      planejadorId: perfil.planejadorId,
    };
  } catch (err) {
    console.error('Erro ao carregar perfil:', err.message);
    // Fallback mínimo (ex.: backend temporariamente fora do ar) para
    // não travar o app inteiro — trata como cliente comum.
    return {
      id: authUser.id,
      email: authUser.email,
      nome: authUser.user_metadata?.nome || authUser.email.split('@')[0],
      telefone: authUser.user_metadata?.telefone || '',
      bancoConectado: authUser.user_metadata?.banco_conectado || '',
      role: 'cliente',
      planejadorId: null,
    };
  }
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('cliente');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    let usuarioAtual = null;

    const aplicarSessao = async (session) => {
      if (!session?.user) {
        usuarioAtual = null;
        if (ativo) {
          setUser(null);
          setRole('cliente');
          setCarregando(false);
        }
        return;
      }
      const perfil = await carregarPerfil(session.user);
      usuarioAtual = session.user.id;
      if (ativo) {
        setUser(perfil);
        setRole(perfil.role);
        setCarregando(false);
      }
    };

    // IMPORTANTE: o supabase-js executa este callback SEGURANDO o lock de
    // autenticação. Chamar a API aqui dentro (que faz getSession) travava
    // a sessão — causa dos "carregando infinito" e 401 intermitentes no
    // app. Por isso o trabalho é adiado com setTimeout, como recomenda a
    // documentação do Supabase. INITIAL_SESSION cobre a carga inicial
    // (não precisa de um getSession separado), e renovações de token não
    // recarregam o perfil à toa.
    const { data: listener } = supabase.auth.onAuthStateChange((evento, session) => {
      if (evento === 'TOKEN_REFRESHED' && session?.user?.id === usuarioAtual) return;
      setTimeout(() => aplicarSessao(session), 0);
    });

    return () => {
      ativo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error('E-mail ou senha inválidos.');
  }, []);

  const cadastrar = useCallback(async ({ email, password, nome, telefone, bancoConectado }) => {
    // LGPD / minimização: não pedimos CPF. O Open Finance identifica a
    // pessoa pelo próprio login bancário, e o restante do cadastro
    // (nascimento, UF, profissão...) é preenchido depois em "Meu Cadastro".
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome, telefone, banco_conectado: bancoConectado } },
    });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) throw new Error('Este e-mail já tem cadastro. Faça login ou recupere a senha.');
      if (/password/i.test(error.message)) throw new Error('Senha fraca: use pelo menos 8 caracteres, com letras e números.');
      throw new Error('Não foi possível criar a conta agora. Tente novamente.');
    }
    return data;
  }, []);

  const recuperarSenha = useCallback(async (email) => {
    // A resposta é sempre a mesma, exista ou não a conta (não revela
    // quais e-mails estão cadastrados).
    await supabase.auth.resetPasswordForEmail(email).catch(() => {});
  }, []);

  const recarregarPerfil = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const perfil = await carregarPerfil(session.user);
      setUser(perfil);
      setRole(perfil.role);
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole('cliente');
  }, []);

  return {
    user,
    role,
    isAdmin: role === 'oule',
    isPlanejador: role === 'planejador',
    isStaff: role === 'oule' || role === 'planejador',
    carregando,
    login,
    cadastrar,
    logout,
    recuperarSenha,
    recarregarPerfil,
  };
}
