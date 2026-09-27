import { Router } from 'express';
import { requireAuth, attachProfile } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { idsVisiveisPara, resolverUsuarioAlvo, garantirAcesso } from '../utils/acesso.js';
import { objetivoCreateSchema, objetivoUpdateSchema, validarBody } from '../validators/objetivos.schema.js';

const router = Router();

router.use(requireAuth, attachProfile);

function linhaParaApi(o) {
  return {
    id: o.id,
    userId: o.user_id,
    titulo: o.titulo,
    tipo: o.tipo,
    descricao: o.descricao,
    valorAlvo: Number(o.valor_alvo),
    valorAtual: Number(o.valor_atual),
    prazo: o.prazo,
    categoria: o.categoria,
    imagemUrl: o.imagem_url,
    status: o.status,
    criadoPor: o.criado_por,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    progresso: Number(o.valor_alvo) > 0
      ? Math.min(100, (Number(o.valor_atual) / Number(o.valor_alvo)) * 100)
      : 0,
  };
}

/**
 * GET /api/objetivos?userId=...
 * - cliente: sempre os próprios (ignora userId enviado).
 * - planejador: os próprios OU de um cliente sob sua responsabilidade
 *   (userId obrigatório nesse caso). Sem userId, retorna de TODOS os
 *   clientes dele, agrupável no frontend.
 * - oule: idem, mas sem restrição de vínculo.
 */
router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.query;

    if (req.profile.role === 'cliente') {
      const { data, error } = await supabaseAdmin
        .from('objetivos')
        .select('*')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json((data || []).map(linhaParaApi));
    }

    if (userId) {
      await garantirAcesso(req, userId);
      const { data, error } = await supabaseAdmin
        .from('objetivos')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json((data || []).map(linhaParaApi));
    }

    // Sem userId: staff vê tudo que está no seu escopo.
    const ids = await idsVisiveisPara(req);
    let query = supabaseAdmin.from('objetivos').select('*').order('created_at', { ascending: false });
    if (ids) query = query.in('user_id', ids);
    const { data, error } = await query;
    if (error) throw error;
    res.json((data || []).map(linhaParaApi));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/objetivos
 */
router.post('/', validarBody(objetivoCreateSchema), async (req, res, next) => {
  try {
    const alvoUserId = await resolverUsuarioAlvo(req, req.body.userId);

    const { data, error } = await supabaseAdmin
      .from('objetivos')
      .insert({
        user_id: alvoUserId,
        titulo: req.body.titulo,
        tipo: req.body.tipo,
        descricao: req.body.descricao ?? null,
        valor_alvo: req.body.valorAlvo,
        valor_atual: req.body.valorAtual ?? 0,
        prazo: req.body.prazo ?? null,
        categoria: req.body.categoria,
        imagem_url: req.body.imagemUrl ?? null,
        criado_por: req.userId,
      })
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json(linhaParaApi(data));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/objetivos/:id
 */
router.put('/:id', validarBody(objetivoUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existente, error: erroBusca } = await supabaseAdmin
      .from('objetivos')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();
    if (erroBusca) throw erroBusca;
    if (!existente) return res.status(404).json({ error: 'Meta não encontrada.' });

    await garantirAcesso(req, existente.user_id);

    const payload = {};
    if (req.body.titulo !== undefined) payload.titulo = req.body.titulo;
    if (req.body.tipo !== undefined) payload.tipo = req.body.tipo;
    if (req.body.descricao !== undefined) payload.descricao = req.body.descricao;
    if (req.body.valorAlvo !== undefined) payload.valor_alvo = req.body.valorAlvo;
    if (req.body.valorAtual !== undefined) payload.valor_atual = req.body.valorAtual;
    if (req.body.prazo !== undefined) payload.prazo = req.body.prazo;
    if (req.body.categoria !== undefined) payload.categoria = req.body.categoria;
    if (req.body.imagemUrl !== undefined) payload.imagem_url = req.body.imagemUrl;
    if (req.body.status !== undefined) payload.status = req.body.status;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('objetivos')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    res.json(linhaParaApi(data));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/objetivos/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existente, error: erroBusca } = await supabaseAdmin
      .from('objetivos')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();
    if (erroBusca) throw erroBusca;
    if (!existente) return res.status(404).json({ error: 'Meta não encontrada.' });

    await garantirAcesso(req, existente.user_id);

    const { error } = await supabaseAdmin.from('objetivos').delete().eq('id', id);
    if (error) throw error;

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
