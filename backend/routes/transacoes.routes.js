import { Router } from 'express';
import { z } from 'zod';
import { autenticado } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { resolverUsuarioAlvo, garantirAcesso } from '../utils/acesso.js';
import { httpError } from '../utils/http.js';
import { CATEGORIA_IDS, TIPOS_GASTO_IDS, categoriaInfo } from '../utils/categorias.js';
import { carregarCartao, montarLinhas } from '../services/lancamentos.service.js';
import { validar } from '../validators/validate.js';

const router = Router();
router.use(autenticado);

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).');

const filtroSchema = z.object({
  userId: z.string().uuid().optional(),
  de: dataIso.optional(),
  ate: dataIso.optional(),
  regime: z.enum(['competencia', 'caixa']).default('competencia'),
  limite: z.coerce.number().int().min(1).max(5000).default(3000),
});

/**
 * GET /api/transacoes?userId=&de=&ate=&regime=
 * Cliente: sempre as próprias. Staff: as do cliente informado (validado).
 */
router.get('/', validar(filtroSchema, 'query'), async (req, res, next) => {
  try {
    const { userId, de, ate, regime, limite } = req.query;
    const alvo = await resolverUsuarioAlvo(req, userId);
    const coluna = regime === 'caixa' ? 'data_caixa' : 'data_competencia';

    let query = supabaseAdmin
      .from('transacoes')
      .select('*')
      .eq('user_id', alvo)
      .order('data_transacao', { ascending: false })
      .limit(limite);
    if (de) query = query.gte(coluna, de);
    if (ate) query = query.lte(coluna, ate);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

const novaTransacaoSchema = z.object({
  userId: z.string().uuid().optional(),
  tipo: z.enum(['despesa', 'receita']),
  descricao: z.string().trim().min(1, 'Descreva o lançamento.').max(200),
  valor: z.coerce.number().finite().positive('Informe um valor maior que zero.').max(10_000_000),
  data: dataIso,
  categoria: z.enum(CATEGORIA_IDS).optional(),
  tipoGasto: z.enum(TIPOS_GASTO_IDS).optional().nullable(),
  cartaoId: z.string().uuid().optional().nullable(),
  parcelas: z.coerce.number().int().min(1).max(48).default(1),
  metodoPagamento: z.enum(['Pix', 'Cartão', 'Boleto', 'Dinheiro', 'Débito', 'Transferência']).optional().nullable(),
  observacao: z.string().trim().max(500).optional().nullable(),
});

/**
 * POST /api/transacoes — lançamento manual. Compra no cartão parcelada
 * vira uma linha por parcela, cada uma na fatura certa.
 */
router.post('/', validar(novaTransacaoSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const alvo = await resolverUsuarioAlvo(req, b.userId);
    const cartao = b.tipo === 'despesa' ? await carregarCartao(alvo, b.cartaoId) : null;
    if (b.parcelas > 1 && !cartao) throw httpError(400, 'Parcelamento só é possível em compras no cartão.');

    const linhas = montarLinhas({
      userId: alvo,
      data: b.data,
      descricao: b.descricao,
      valor: b.tipo === 'despesa' ? -b.valor : b.valor,
      categoria: b.categoria,
      tipoGasto: b.tipoGasto,
      origem: 'lancamento',
      cartao,
      parcelas: b.parcelas,
      metodoPagamento: cartao ? 'Cartão' : b.metodoPagamento || null,
      observacao: b.observacao || null,
    });

    const { data, error } = await supabaseAdmin.from('transacoes').insert(linhas).select('*');
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

const edicaoSchema = z.object({
  categoria: z.enum(CATEGORIA_IDS).optional(),
  tipoGasto: z.enum(TIPOS_GASTO_IDS).nullable().optional(),
  descricao: z.string().trim().min(1).max(200).optional(),
  observacao: z.string().trim().max(500).nullable().optional(),
  // Recategorizar todos os lançamentos com a mesma descrição (ex.: todo
  // "PADARIA DO ZE" vira Alimentação de uma vez).
  aplicarSemelhantes: z.boolean().default(false),
}).refine((b) => b.categoria || b.tipoGasto !== undefined || b.descricao || b.observacao !== undefined, {
  message: 'Nada para atualizar.',
});

async function buscarTransacao(req, id) {
  if (!/^[0-9a-f-]{1,36}$/i.test(String(id))) throw httpError(400, 'Identificador inválido.');
  const { data, error } = await supabaseAdmin.from('transacoes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Transação não encontrada.');
  await garantirAcesso(req, data.user_id);
  return data;
}

/** PATCH /api/transacoes/:id */
router.patch('/:id', validar(edicaoSchema), async (req, res, next) => {
  try {
    const atual = await buscarTransacao(req, req.params.id);
    const b = req.body;
    const payload = { updated_at: new Date().toISOString() };

    if (b.categoria) {
      payload.categoria = b.categoria;
      const despesa = Number(atual.valor) < 0 && categoriaInfo(b.categoria).grupo === 'despesa';
      // Ao trocar a categoria sem informar o tipo de gasto, sugere o
      // padrão da nova categoria.
      payload.tipo_gasto = despesa ? (b.tipoGasto !== undefined ? b.tipoGasto : categoriaInfo(b.categoria).tipoGasto) : null;
    } else if (b.tipoGasto !== undefined) {
      payload.tipo_gasto = b.tipoGasto;
    }
    if (b.descricao) payload.descricao = b.descricao;
    if (b.observacao !== undefined) payload.observacao = b.observacao;

    let query = supabaseAdmin.from('transacoes').update(payload).eq('user_id', atual.user_id);
    if (b.aplicarSemelhantes && (b.categoria || b.tipoGasto !== undefined)) {
      const { descricao, observacao, ...somenteClassificacao } = payload;
      query = supabaseAdmin
        .from('transacoes')
        .update(somenteClassificacao)
        .eq('user_id', atual.user_id)
        .eq('descricao', atual.descricao);
      if (Number(atual.valor) < 0) query = query.lt('valor', 0);
      else query = query.gt('valor', 0);
      // a própria linha também pode ter descrição/observação editadas
      if (b.descricao || b.observacao !== undefined) {
        const { error } = await supabaseAdmin.from('transacoes').update(payload).eq('id', atual.id);
        if (error) throw error;
      }
    } else {
      query = query.eq('id', atual.id);
    }

    const { data, error } = await query.select('id');
    if (error) throw error;
    res.json({ ok: true, atualizadas: (data || []).length });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/transacoes/:id[?compraInteira=1]
 * Lançamentos do Open Finance não podem ser excluídos (voltariam na
 * próxima sincronização) — nesses casos, recategorize como Transferências.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const atual = await buscarTransacao(req, req.params.id);
    if (atual.open_finance_id) {
      throw httpError(409, 'Lançamentos do Open Finance voltam na próxima sincronização. Em vez de excluir, mude a categoria (ex.: Transferências).');
    }

    let query = supabaseAdmin.from('transacoes').delete().eq('user_id', atual.user_id);
    query = req.query.compraInteira === '1' && atual.compra_id
      ? query.eq('compra_id', atual.compra_id)
      : query.eq('id', atual.id);

    const { error } = await query;
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
