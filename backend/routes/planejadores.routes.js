import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, attachProfile, requireOule, ADMIN_EMAIL, papelValido } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';

const router = Router();

// Só o admin (papel 'oule') decide quem é planejador de quem.
router.use(requireAuth, attachProfile, requireOule);

async function listarAuthUsers() {
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
  return usuarios;
}

/**
 * GET /api/admin/planejadores
 * Devolve, em uma única chamada, tudo que a tela de gestão precisa:
 * a lista de planejadores (com quantos clientes cada um tem) e a lista
 * de clientes (com o planejador atual de cada um), para montar a UI
 * de atribuição.
 */
router.get('/', async (req, res, next) => {
  try {
    const [authUsers, { data: perfis, error }] = await Promise.all([
      listarAuthUsers(),
      supabaseAdmin.from('profiles').select('id, nome, telefone, role, planejador_id'),
    ]);
    if (error) throw error;

    const authPorId = new Map(authUsers.map((u) => [u.id, u]));
    const perfilPorId = new Map((perfis || []).map((p) => [p.id, p]));

    // Garante que todo mundo (mesmo sem linha em `profiles` ainda)
    // apareça na lista, com papel padrão 'cliente'.
    const pessoas = authUsers
      .filter((u) => (u.email || '').toLowerCase() !== ADMIN_EMAIL)
      .map((u) => {
        const perfil = perfilPorId.get(u.id);
        return {
          id: u.id,
          email: u.email,
          nome: perfil?.nome || u.user_metadata?.nome || u.email.split('@')[0],
          telefone: perfil?.telefone || u.user_metadata?.telefone || '',
          role: perfil?.role || 'cliente',
          planejadorId: perfil?.planejador_id || null,
        };
      });

    const planejadores = pessoas
      .filter((p) => p.role === 'planejador')
      .map((p) => ({
        ...p,
        clientes: pessoas.filter((c) => c.role === 'cliente' && c.planejadorId === p.id),
      }));

    const clientes = pessoas
      .filter((p) => p.role === 'cliente')
      .map((c) => ({
        ...c,
        planejadorNome: c.planejadorId ? (authPorId.get(c.planejadorId)?.user_metadata?.nome || pessoas.find((p) => p.id === c.planejadorId)?.nome) : null,
      }));

    res.json({ planejadores, clientes });
  } catch (err) {
    next(err);
  }
});

const papelSchema = z.object({
  role: z.enum(['cliente', 'planejador', 'oule']),
});

/**
 * PATCH /api/admin/planejadores/usuarios/:userId/papel
 * Promove/rebaixa um usuário entre cliente, planejador e oule.
 * Rebaixar um planejador para cliente desvincula automaticamente os
 * clientes dele (fica sem planejador, precisa ser reatribuído).
 */
router.patch('/usuarios/:userId/papel', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const result = papelSchema.safeParse(req.body);
    if (!result.success || !papelValido(result.data.role)) {
      return res.status(400).json({ error: 'Papel inválido. Use cliente, planejador ou oule.' });
    }
    const { role } = result.data;

    if (userId === req.userId && role !== 'oule') {
      return res.status(400).json({ error: 'Você não pode remover seu próprio acesso de administrador.' });
    }

    // Garante que existe uma linha em profiles antes de atualizar.
    const { data: existente } = await supabaseAdmin.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!existente) {
      const { error: erroInsert } = await supabaseAdmin.from('profiles').insert({ id: userId, role });
      if (erroInsert) throw erroInsert;
    } else {
      const { error: erroUpdate } = await supabaseAdmin.from('profiles').update({ role }).eq('id', userId);
      if (erroUpdate) throw erroUpdate;
    }

    // Se deixou de ser planejador, os clientes dele ficam órfãos
    // (planejador_id = null) — precisam ser reatribuídos manualmente.
    if (role !== 'planejador') {
      const { error: erroDesvincular } = await supabaseAdmin
        .from('profiles')
        .update({ planejador_id: null })
        .eq('planejador_id', userId);
      if (erroDesvincular) throw erroDesvincular;
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const vinculoSchema = z.object({
  planejadorId: z.string().uuid().nullable(),
});

/**
 * PATCH /api/admin/planejadores/clientes/:clienteId/vinculo
 * Atribui (ou remove, com planejadorId = null) o planejador
 * responsável por um cliente.
 */
router.patch('/clientes/:clienteId/vinculo', async (req, res, next) => {
  try {
    const { clienteId } = req.params;
    const result = vinculoSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    const { planejadorId } = result.data;

    if (planejadorId) {
      const { data: planejador, error: erroPlanejador } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', planejadorId)
        .maybeSingle();
      if (erroPlanejador) throw erroPlanejador;
      if (!planejador || planejador.role !== 'planejador') {
        return res.status(400).json({ error: 'O usuário informado não é um planejador.' });
      }
    }

    const { data: existente } = await supabaseAdmin.from('profiles').select('id').eq('id', clienteId).maybeSingle();
    if (!existente) {
      const { error: erroInsert } = await supabaseAdmin
        .from('profiles')
        .insert({ id: clienteId, role: 'cliente', planejador_id: planejadorId });
      if (erroInsert) throw erroInsert;
    } else {
      const { error: erroUpdate } = await supabaseAdmin
        .from('profiles')
        .update({ planejador_id: planejadorId })
        .eq('id', clienteId);
      if (erroUpdate) throw erroUpdate;
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
