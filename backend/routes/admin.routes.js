import { Router } from 'express';
import { requireAuth, attachProfile, requireStaff } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { getValorAjustado } from '../utils/financeUtils.js';
import { idsVisiveisPara } from '../utils/acesso.js';

const router = Router();

// Todas as rotas abaixo exigem: (1) token válido, (2) papel "staff"
// (planejador OU oule/admin). Cada handler então filtra os dados de
// acordo com `req.profile.role`: planejador só vê os clientes que são
// dele (via `idsVisiveisPara`); oule vê todos. Nunca confiamos em
// nada vindo do cliente para decidir esse escopo.
router.use(requireAuth, attachProfile, requireStaff);

/**
 * Busca todos os usuários do Supabase Auth (paginando), depois junta
 * com `profiles` para saber papel/planejador de cada um.
 */
async function listarTodosUsuariosComPerfil() {
  const usuarios = [];
  const perPage = 200;
  let page = 1;

  while (page <= 50) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    usuarios.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }

  const { data: perfis, error: erroPerfis } = await supabaseAdmin
    .from('profiles')
    .select('id, nome, telefone, banco_conectado, role, planejador_id');
  if (erroPerfis) throw erroPerfis;

  const perfilPorId = new Map((perfis || []).map((p) => [p.id, p]));

  return usuarios.map((u) => ({
    authUser: u,
    perfil: perfilPorId.get(u.id) || null,
  }));
}

function perfilResumido({ authUser, perfil }) {
  return {
    id: authUser.id,
    email: authUser.email,
    nome: perfil?.nome || authUser.user_metadata?.nome || authUser.email.split('@')[0],
    telefone: perfil?.telefone || authUser.user_metadata?.telefone || '',
    bancoConectado: perfil?.banco_conectado || authUser.user_metadata?.banco_conectado || '',
    role: perfil?.role || 'cliente',
    planejadorId: perfil?.planejador_id || null,
    criadoEm: authUser.created_at,
    ultimoLogin: authUser.last_sign_in_at || null,
  };
}

/**
 * GET /api/admin/status
 * Mantido por compatibilidade com versões antigas do frontend. O novo
 * frontend usa GET /api/auth/me, que já traz o papel completo.
 */
router.get('/status', (req, res) => {
  res.json({ isAdmin: req.profile.role === 'oule', role: req.profile.role });
});

/**
 * GET /api/admin/overview
 * Visão consolidada dos usuários visíveis para quem está logado:
 * - oule: todos os clientes do sistema.
 * - planejador: só os clientes atribuídos a ele.
 */
router.get('/overview', async (req, res, next) => {
  try {
    const idsPermitidos = await idsVisiveisPara(req); // null = todos (oule)

    const [todos, { data: transacoesTodas, error }] = await Promise.all([
      listarTodosUsuariosComPerfil(),
      supabaseAdmin.from('transacoes').select('*'),
    ]);
    if (error) throw error;

    // Só entram no painel usuários com papel 'cliente' (staff não
    // aparece nesse ranking financeiro) e dentro do escopo de quem
    // está olhando.
    const usuariosFiltrados = todos.filter(({ authUser, perfil }) => {
      const role = perfil?.role || 'cliente';
      if (role !== 'cliente') return false;
      if (idsPermitidos && !idsPermitidos.includes(authUser.id)) return false;
      return true;
    });

    const porUsuario = new Map(
      usuariosFiltrados.map((u) => [u.authUser.id, { ...perfilResumido(u), totalEntradas: 0, totalSaidas: 0, totalTransacoes: 0, ultimaTransacao: null }])
    );

    const idsSet = new Set(porUsuario.keys());
    const transacoes = (transacoesTodas || []).filter((t) => idsSet.has(t.user_id));

    const categoriasConsolidadas = {};
    let totalEntradas = 0;
    let totalSaidas = 0;

    for (const t of transacoes) {
      const valor = getValorAjustado(t);
      const registro = porUsuario.get(t.user_id);

      if (valor > 0) {
        totalEntradas += valor;
        if (registro) registro.totalEntradas += valor;
      } else {
        const abs = Math.abs(valor);
        totalSaidas += abs;
        if (registro) registro.totalSaidas += abs;
        const cat = t.categoria || 'Outros';
        categoriasConsolidadas[cat] = (categoriasConsolidadas[cat] || 0) + abs;
      }

      if (registro) {
        registro.totalTransacoes += 1;
        if (!registro.ultimaTransacao || new Date(t.data_transacao) > new Date(registro.ultimaTransacao)) {
          registro.ultimaTransacao = t.data_transacao;
        }
      }
    }

    const usuariosLista = Array.from(porUsuario.values())
      .map((u) => ({ ...u, saldoLiquido: u.totalEntradas - u.totalSaidas }))
      .sort((a, b) => b.totalSaidas - a.totalSaidas);

    const categorias = Object.entries(categoriasConsolidadas)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);

    const evolucaoPorMes = {};
    for (const t of transacoes) {
      if (!t.data_transacao) continue;
      const mes = String(t.data_transacao).slice(0, 7);
      const valor = getValorAjustado(t);
      if (!evolucaoPorMes[mes]) evolucaoPorMes[mes] = { mes, entradas: 0, saidas: 0 };
      if (valor > 0) evolucaoPorMes[mes].entradas += valor;
      else evolucaoPorMes[mes].saidas += Math.abs(valor);
    }
    const evolucaoMensal = Object.values(evolucaoPorMes)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6);

    res.json({
      resumo: {
        totalUsuarios: usuariosFiltrados.length,
        totalTransacoes: transacoes.length,
        totalEntradas,
        totalSaidas,
        saldoConsolidado: totalEntradas - totalSaidas,
      },
      categorias,
      evolucaoMensal,
      usuarios: usuariosLista,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/usuarios/:userId
 * Visão individual e detalhada de um usuário específico — só permitida
 * se ele estiver no escopo de quem está pedindo (ver `idsVisiveisPara`).
 */
router.get('/usuarios/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;

    const idsPermitidos = await idsVisiveisPara(req);
    if (idsPermitidos && !idsPermitidos.includes(userId)) {
      return res.status(403).json({ error: 'Esse cliente não está sob sua responsabilidade.' });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authError || !authData?.user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, telefone, banco_conectado, role, planejador_id')
      .eq('id', userId)
      .maybeSingle();

    const { data: transacoes, error } = await supabaseAdmin
      .from('transacoes')
      .select('*')
      .eq('user_id', userId)
      .order('data_transacao', { ascending: false });
    if (error) throw error;

    let totalEntradas = 0;
    let totalSaidas = 0;
    const categoriasMap = {};

    for (const t of transacoes || []) {
      const valor = getValorAjustado(t);
      if (valor > 0) {
        totalEntradas += valor;
      } else {
        const abs = Math.abs(valor);
        totalSaidas += abs;
        const cat = t.categoria || 'Outros';
        categoriasMap[cat] = (categoriasMap[cat] || 0) + abs;
      }
    }

    const categorias = Object.entries(categoriasMap)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);

    const saldoLiquido = totalEntradas - totalSaidas;
    const taxaPoupanca = totalEntradas > 0 ? (saldoLiquido / totalEntradas) * 100 : 0;

    res.json({
      perfil: perfilResumido({ authUser: authData.user, perfil }),
      resumo: {
        totalEntradas,
        totalSaidas,
        saldoLiquido,
        taxaPoupanca,
        totalTransacoes: (transacoes || []).length,
      },
      categorias,
      transacoes: transacoes || [],
    });
  } catch (err) {
    next(err);
  }
});

export default router;
