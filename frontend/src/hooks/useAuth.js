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

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user && ativo) {
        const perfil = await carregarPerfil(session.user);
        if (ativo) {
          setUser(perfil);
          setRole(perfil.role);
        }
      }
      if (ativo) setCarregando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const perfil = await carregarPerfil(session.user);
        setUser(perfil);
        setRole(perfil.role);
      } else {
        setUser(null);
        setRole('cliente');
      }
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
    // Nota: CPF é um dado sensível — se for realmente necessário para o
    // seu fluxo de Open Finance, armazene-o de forma criptografada e
    // nunca o devolva em claro pela API. Considere se você precisa dele
    // no seu banco ou se a Pluggy já cuida da identificação via o
    // próprio login bancário do usuário.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome, telefone, banco_conectado: bancoConectado } },
    });
    if (error) throw new Error(error.message);
    return data;
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
  };
}
