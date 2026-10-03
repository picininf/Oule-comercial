import { Router } from 'express';
import { z } from 'zod';
import { autenticado } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { resolverUsuarioAlvo, garantirAcesso } from '../utils/acesso.js';
import { exigirUuid, httpError } from '../utils/http.js';
import { CATEGORIA_IDS, TIPOS_GASTO_IDS } from '../utils/categorias.js';
import {
  aplicarRegraNasExistentes, desfazerRegra, sugerirPadrao, transacoesQueCasam,
} from '../services/regras.service.js';
import { validar } from '../validators/validate.js';

const router = Router();
router.use(autenticado);

const vazioViraNull = (schema) => z.preprocess((v) => (v === '' ? null : v), schema);

const camposRegra = {
  padrao: z.string().trim().min(2, 'Informe pelo menos 2 letras do texto a reconhecer.').max(120),
  sentido: z.enum(['saida', 'entrada', 'ambos']).default('saida'),
  categoria: vazioViraNull(z.enum(CATEGORIA_IDS).nullable().optional()),
  tipoGasto: vazioViraNull(z.enum(TIPOS_GASTO_IDS).nullable().optional()),
  descricao: vazioViraNull(z.string().trim().max(200).nullable().optional()),
  ativo: z.boolean().optional(),
};

const algoAFazer = (b) => b.categoria || b.tipoGasto || b.descricao;
const MENSAGEM_VAZIA = 'Escolha pelo menos uma coisa para a regra fazer: categoria, tipo de gasto ou novo nome.';

const novaRegraSchema = z
  .object({ ...camposRegra, userId: z.string().uuid().optional(), aplicarExistentes: z.boolean().default(true) })
  .refine(algoAFazer, { message: MENSAGEM_VAZIA });

const edicaoSchema = z
  .object({ ...camposRegra, sentido: camposRegra.sentido.optional(), aplicarExistentes: z.boolean().default(true) })
  .partial({ padrao: true });

const previaSchema = z.object({
  userId: z.string().uuid().optional(),
  padrao: camposRegra.padrao,
  sentido: camposRegra.sentido,
});

function paraApi(r) {
  return {
    id: r.id,
    userId: r.user_id,
    padrao: r.padrao,
    sentido: r.sentido,
    categoria: r.categoria,
    tipoGasto: r.tipo_gasto,
    descricao: r.descricao,
    ativo: r.ativo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function paraBanco(b) {
  const linha = {};
  if (b.padrao !== undefined) linha.padrao = b.padrao;
  if (b.sentido !== undefined) linha.sentido = b.sentido;
  if (b.categoria !== undefined) linha.categoria = b.categoria;
  if (b.tipoGasto !== undefined) linha.tipo_gasto = b.tipoGasto;
  if (b.descricao !== undefined) linha.descricao = b.descricao;
  if (b.ativo !== undefined) linha.ativo = b.ativo;
  return linha;
}

function erroDeTabela(error) {
  // Tabela ainda não criada: mensagem clara em vez de erro 500 genérico.
  if (/regras_transacao|regra_id|descricao_original/.test(error?.message || '')) {
    return httpError(503, 'As regras ainda não estão ativas no banco. Peça para rodar o schema_v5_regras.sql no Supabase.');
  }
  return error;
}

async function buscarRegra(req, id) {
  const { data, error } = await supabaseAdmin.from('regras_transacao').select('*').eq('id', id).maybeSingle();
  if (error) throw erroDeTabela(error);
  if (!data) throw httpError(404, 'Regra não encontrada.');
  await garantirAcesso(req, data.user_id);
  return data;
}

/** GET /api/regras?userId= — regras com quantos lançamentos cada uma classificou. */
router.get('/', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const { data, error } = await supabaseAdmin
      .from('regras_transacao')
      .select('*')
      .eq('user_id', alvo)
      .order('created_at', { ascending: false });
    if (error) throw erroDeTabela(error);

    const { data: usos, error: erroUsos } = await supabaseAdmin
      .from('transacoes')
      .select('regra_id')
      .eq('user_id', alvo)
      .not('regra_id', 'is', null);
    if (erroUsos) throw erroDeTabela(erroUsos);
    const contagem = {};
    for (const u of usos || []) contagem[u.regra_id] = (contagem[u.regra_id] || 0) + 1;

    res.json((data || []).map((r) => ({ ...paraApi(r), lancamentos: contagem[r.id] || 0 })));
  } catch (err) {
    next(err);
  }
});

/** GET /api/regras/sugestao?descricao= — trecho estável sugerido para a regra. */
router.get('/sugestao', (req, res) => {
  res.json({ padrao: sugerirPadrao(String(req.query.descricao || '').slice(0, 300)) });
});

/** POST /api/regras/previa — quais lançamentos existentes a regra pegaria. */
router.post('/previa', validar(previaSchema), async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.body.userId);
    const casam = await transacoesQueCasam(alvo, { padrao: req.body.padrao, sentido: req.body.sentido, ativo: true });
    const total = casam.reduce((s, t) => s + Math.abs(Number(t.valor) || 0), 0);
    res.json({
      quantidade: casam.length,
      total,
      exemplos: casam.slice(0, 5).map((t) => ({
        id: t.id,
        descricao: t.descricao,
        valor: Number(t.valor),
        data: t.data_competencia || t.data_transacao,
        categoria: t.categoria,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/regras — cria e (por padrão) já aplica nos lançamentos existentes. */
router.post('/', validar(novaRegraSchema), async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.body.userId);
    const { data, error } = await supabaseAdmin
      .from('regras_transacao')
      .insert({ ativo: true, ...paraBanco(req.body), user_id: alvo, criado_por: req.userId })
      .select('*')
      .single();
    if (error) throw erroDeTabela(error);
    const aplicadas = req.body.aplicarExistentes ? await aplicarRegraNasExistentes(alvo, data) : 0;
    res.status(201).json({ ...paraApi(data), aplicadas });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/regras/:id — edita e reaplica nos lançamentos. */
router.patch('/:id', exigirUuid('id'), validar(edicaoSchema), async (req, res, next) => {
  try {
    const atual = await buscarRegra(req, req.params.id);
    const final = { ...atual, ...paraBanco(req.body) };
    if (!final.categoria && !final.tipo_gasto && !final.descricao) throw httpError(400, MENSAGEM_VAZIA);

    const { data, error } = await supabaseAdmin
      .from('regras_transacao')
      .update({ ...paraBanco(req.body), updated_at: new Date().toISOString() })
      .eq('id', atual.id)
      .select('*')
      .single();
    if (error) throw erroDeTabela(error);
    const aplicadas = req.body.aplicarExistentes && data.ativo ? await aplicarRegraNasExistentes(atual.user_id, data) : 0;
    res.json({ ...paraApi(data), aplicadas });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/regras/:id[?desfazer=1]
 * Sem desfazer: os lançamentos ficam como estão. Com desfazer: voltam a
 * ter a descrição original do banco (a categoria fica como está).
 */
router.delete('/:id', exigirUuid('id'), async (req, res, next) => {
  try {
    const atual = await buscarRegra(req, req.params.id);
    const restauradas = req.query.desfazer === '1' ? await desfazerRegra(atual.user_id, atual.id) : 0;
    const { error } = await supabaseAdmin.from('regras_transacao').delete().eq('id', atual.id);
    if (error) throw erroDeTabela(error);
    res.json({ ok: true, restauradas });
  } catch (err) {
    next(err);
  }
});

export default router;
