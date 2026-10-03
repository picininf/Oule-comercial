import { Router } from 'express';
import { z } from 'zod';
import { autenticado } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { resolverUsuarioAlvo, garantirAcesso } from '../utils/acesso.js';
import { exigirUuid, httpError } from '../utils/http.js';
import { CATEGORIA_IDS, TIPOS_GASTO_IDS } from '../utils/categorias.js';
import { hojeBrasil, mesDe, dataNoMes } from '../utils/financeUtils.js';
import { carregarCartao, montarLinhas } from '../services/lancamentos.service.js';
import { pagamentoParaApi, contasDoMes, proximosVencimentos } from '../services/pagamentos.service.js';
import { validar } from '../validators/validate.js';

const router = Router();
router.use(autenticado);

const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (use AAAA-MM).');
const mesOpcional = mesSchema.optional().nullable().or(z.literal('').transform(() => null));

const pagamentoSchema = z.object({
  userId: z.string().uuid().optional(),
  descricao: z.string().trim().min(1, 'Descreva a conta.').max(120),
  categoria: z.enum(CATEGORIA_IDS).default('Outros'),
  tipoGasto: z.enum(TIPOS_GASTO_IDS).default('recorrente_obrigatorio'),
  valor: z.coerce.number().finite().min(0).max(10_000_000),
  diaVencimento: z.coerce.number().int().min(1, 'Dia entre 1 e 31.').max(31, 'Dia entre 1 e 31.'),
  formaPagamento: z.enum(['Boleto', 'Pix', 'Débito automático', 'Cartão', 'Dinheiro', 'Transferência']).optional().nullable(),
  cartaoId: z.string().uuid().optional().nullable().or(z.literal('').transform(() => null)),
  inicioMes: mesOpcional,
  fimMes: mesOpcional,
  lembrar: z.boolean().default(true),
  ativo: z.boolean().default(true),
  observacao: z.string().trim().max(300).optional().nullable(),
}).refine((p) => !p.inicioMes || !p.fimMes || p.fimMes >= p.inicioMes, {
  message: 'O mês final precisa ser depois do inicial.',
  path: ['fimMes'],
});

function paraBanco(b) {
  const linha = {};
  const mapa = {
    descricao: 'descricao', categoria: 'categoria', tipoGasto: 'tipo_gasto', valor: 'valor',
    diaVencimento: 'dia_vencimento', formaPagamento: 'forma_pagamento', cartaoId: 'cartao_id',
    inicioMes: 'inicio_mes', fimMes: 'fim_mes', lembrar: 'lembrar', ativo: 'ativo', observacao: 'observacao',
  };
  for (const [api, coluna] of Object.entries(mapa)) if (b[api] !== undefined) linha[coluna] = b[api];
  return linha;
}

async function buscarPagamento(req, id) {
  const { data, error } = await supabaseAdmin.from('pagamentos_recorrentes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Conta não encontrada.');
  await garantirAcesso(req, data.user_id);
  return data;
}

/** GET /api/pagamentos?userId= — cadastro de contas fixas. */
router.get('/', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const { data, error } = await supabaseAdmin
      .from('pagamentos_recorrentes')
      .select('*')
      .eq('user_id', alvo)
      .order('dia_vencimento');
    if (error) throw error;
    res.json((data || []).map(pagamentoParaApi));
  } catch (err) {
    next(err);
  }
});

/** GET /api/pagamentos/mes?mes=AAAA-MM&userId= — contas do mês com status. */
router.get('/mes', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const mes = mesSchema.safeParse(req.query.mes || mesDe(hojeBrasil()));
    if (!mes.success) throw httpError(400, 'Mês inválido (use AAAA-MM).');

    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('lembrete_dias_antecedencia')
      .eq('id', alvo)
      .maybeSingle();

    const contas = await contasDoMes(alvo, mes.data, { antecedencia: perfil?.lembrete_dias_antecedencia ?? 3 });
    const total = contas.reduce((s, c) => s + c.valor, 0);
    const pago = contas.filter((c) => c.pago).reduce((s, c) => s + c.pago.valorPago, 0);
    const pendente = contas.filter((c) => !c.pago).reduce((s, c) => s + c.valor, 0);

    const porTipo = {};
    for (const c of contas) porTipo[c.tipoGasto] = (porTipo[c.tipoGasto] || 0) + c.valor;

    res.json({
      mes: mes.data,
      contas,
      resumo: {
        total,
        pago,
        pendente,
        quantidade: contas.length,
        atrasadas: contas.filter((c) => c.status === 'atrasado').length,
        porTipoGasto: porTipo,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/pagamentos/proximos?dias=7&userId= — avisos de vencimento no app. */
router.get('/proximos', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const dias = Math.min(Math.max(Number(req.query.dias) || 7, 0), 31);
    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('lembrete_dias_antecedencia')
      .eq('id', alvo)
      .maybeSingle();
    res.json(await proximosVencimentos(alvo, { dias, antecedencia: perfil?.lembrete_dias_antecedencia ?? 3 }));
  } catch (err) {
    next(err);
  }
});

/** POST /api/pagamentos */
router.post('/', validar(pagamentoSchema), async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.body.userId);
    if (req.body.cartaoId) await carregarCartao(alvo, req.body.cartaoId);
    const { data, error } = await supabaseAdmin
      .from('pagamentos_recorrentes')
      .insert({ ...paraBanco(req.body), user_id: alvo, criado_por: req.userId })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(pagamentoParaApi(data));
  } catch (err) {
    next(err);
  }
});

/** PUT /api/pagamentos/:id */
router.put('/:id', exigirUuid('id'), validar(pagamentoSchema), async (req, res, next) => {
  try {
    const atual = await buscarPagamento(req, req.params.id);
    if (req.body.cartaoId) await carregarCartao(atual.user_id, req.body.cartaoId);
    const { data, error } = await supabaseAdmin
      .from('pagamentos_recorrentes')
      .update({ ...paraBanco(req.body), updated_at: new Date().toISOString() })
      .eq('id', atual.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(pagamentoParaApi(data));
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/pagamentos/:id — remove a conta e o histórico de pagos. */
router.delete('/:id', exigirUuid('id'), async (req, res, next) => {
  try {
    const atual = await buscarPagamento(req, req.params.id);
    const { error } = await supabaseAdmin.from('pagamentos_recorrentes').delete().eq('id', atual.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const pagarSchema = z.object({
  mes: mesSchema,
  valorPago: z.coerce.number().finite().min(0).max(10_000_000).optional().nullable(),
  pagoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  // Para quem NÃO usa Open Finance: lança o pagamento também como
  // transação, para aparecer no extrato e no Plano x Vida Real. Quem usa
  // Open Finance deve deixar desligado (o banco já manda o lançamento).
  registrarTransacao: z.boolean().default(false),
});

/** POST /api/pagamentos/:id/pagar — marca a conta como paga no mês. */
router.post('/:id/pagar', exigirUuid('id'), validar(pagarSchema), async (req, res, next) => {
  try {
    const p = await buscarPagamento(req, req.params.id);
    const { mes, registrarTransacao } = req.body;
    const valorPago = req.body.valorPago ?? Number(p.valor);
    const pagoEm = req.body.pagoEm || hojeBrasil();

    let transacaoId = null;
    if (registrarTransacao && valorPago > 0) {
      const cartao = p.cartao_id ? await carregarCartao(p.user_id, p.cartao_id).catch(() => null) : null;
      const linhas = montarLinhas({
        userId: p.user_id,
        // No cartão, a "compra" acontece no vencimento da conta; a fatura
        // calcula sozinha quando ela será paga de fato.
        data: cartao ? dataNoMes(mes, p.dia_vencimento) : pagoEm,
        descricao: p.descricao,
        valor: -valorPago,
        categoria: p.categoria,
        tipoGasto: p.tipo_gasto,
        origem: 'lancamento',
        cartao,
        metodoPagamento: cartao ? 'Cartão' : null,
        observacao: `Conta mensal ${mes}`,
      });
      const { data, error } = await supabaseAdmin.from('transacoes').insert(linhas).select('id').single();
      if (error) throw error;
      transacaoId = String(data.id);
    }

    const { error } = await supabaseAdmin
      .from('pagamentos_mensais')
      .upsert(
        { pagamento_id: p.id, user_id: p.user_id, mes, valor_pago: valorPago, pago_em: pagoEm, transacao_id: transacaoId },
        { onConflict: 'pagamento_id,mes' }
      );
    if (error) throw error;
    res.json({ ok: true, transacaoId });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/pagamentos/:id/pagar?mes= — desfaz (e remove a transação gerada, se houver). */
router.delete('/:id/pagar', exigirUuid('id'), async (req, res, next) => {
  try {
    const p = await buscarPagamento(req, req.params.id);
    const mes = mesSchema.safeParse(req.query.mes);
    if (!mes.success) throw httpError(400, 'Mês inválido (use AAAA-MM).');

    const { data: registro } = await supabaseAdmin
      .from('pagamentos_mensais')
      .select('transacao_id')
      .eq('pagamento_id', p.id)
      .eq('mes', mes.data)
      .maybeSingle();

    if (registro?.transacao_id) {
      await supabaseAdmin.from('transacoes').delete().eq('id', registro.transacao_id).eq('user_id', p.user_id);
    }
    const { error } = await supabaseAdmin.from('pagamentos_mensais').delete().eq('pagamento_id', p.id).eq('mes', mes.data);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
