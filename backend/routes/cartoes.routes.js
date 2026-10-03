import { Router } from 'express';
import { z } from 'zod';
import { autenticado } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { resolverUsuarioAlvo, garantirAcesso } from '../utils/acesso.js';
import { exigirUuid, httpError } from '../utils/http.js';
import { calcularFatura } from '../utils/fatura.js';
import { hojeBrasil, somarMeses, mesDe } from '../utils/financeUtils.js';
import { recalcularCaixaDoCartao } from '../services/lancamentos.service.js';
import { validar } from '../validators/validate.js';

const router = Router();
router.use(autenticado);

const dia = z.coerce.number().int().min(1, 'Dia entre 1 e 31.').max(31, 'Dia entre 1 e 31.');

const cartaoSchema = z.object({
  userId: z.string().uuid().optional(),
  nome: z.string().trim().min(1, 'Dê um nome ao cartão.').max(60),
  bandeira: z.string().trim().max(30).optional().nullable(),
  final: z.string().trim().regex(/^\d{4}$/, 'Informe só os 4 últimos dígitos.').optional().nullable().or(z.literal('').transform(() => null)),
  diaFechamento: dia,
  diaVencimento: dia,
  limite: z.coerce.number().finite().min(0).max(10_000_000).optional().nullable(),
  ativo: z.boolean().optional(),
});

const cartaoUpdateSchema = cartaoSchema.omit({ userId: true }).partial();

function paraApi(c) {
  const hoje = hojeBrasil();
  const proxima = calcularFatura({ dataCompra: hoje, diaFechamento: c.dia_fechamento, diaVencimento: c.dia_vencimento });
  return {
    id: c.id,
    userId: c.user_id,
    nome: c.nome,
    bandeira: c.bandeira,
    final: c.final,
    diaFechamento: c.dia_fechamento,
    diaVencimento: c.dia_vencimento,
    limite: c.limite !== null ? Number(c.limite) : null,
    ativo: c.ativo,
    openFinance: Boolean(c.open_finance_account_id),
    // Comprando hoje, a compra cai nesta fatura:
    compraHojeVenceEm: proxima.dataVencimento,
    melhorDiaDeCompra: c.dia_fechamento,
  };
}

/** GET /api/cartoes?userId= */
router.get('/', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const { data, error } = await supabaseAdmin
      .from('cartoes')
      .select('*')
      .eq('user_id', alvo)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json((data || []).map(paraApi));
  } catch (err) {
    next(err);
  }
});

/** POST /api/cartoes */
router.post('/', validar(cartaoSchema), async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.body.userId);
    const b = req.body;
    const { data, error } = await supabaseAdmin
      .from('cartoes')
      .insert({
        user_id: alvo,
        nome: b.nome,
        bandeira: b.bandeira || null,
        final: b.final || null,
        dia_fechamento: b.diaFechamento,
        dia_vencimento: b.diaVencimento,
        limite: b.limite ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(paraApi(data));
  } catch (err) {
    next(err);
  }
});

async function buscarCartao(req, id) {
  const { data, error } = await supabaseAdmin.from('cartoes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Cartão não encontrado.');
  await garantirAcesso(req, data.user_id);
  return data;
}

/**
 * PUT /api/cartoes/:id — se o fechamento/vencimento mudar, todas as
 * compras desse cartão têm a data de caixa recalculada.
 */
router.put('/:id', exigirUuid('id'), validar(cartaoUpdateSchema), async (req, res, next) => {
  try {
    const atual = await buscarCartao(req, req.params.id);
    // Guarda o ciclo ANTES de salvar para saber se precisa recalcular.
    const cicloAnterior = { fechamento: atual.dia_fechamento, vencimento: atual.dia_vencimento };
    const b = req.body;
    const payload = { updated_at: new Date().toISOString() };
    if (b.nome !== undefined) payload.nome = b.nome;
    if (b.bandeira !== undefined) payload.bandeira = b.bandeira;
    if (b.final !== undefined) payload.final = b.final;
    if (b.diaFechamento !== undefined) payload.dia_fechamento = b.diaFechamento;
    if (b.diaVencimento !== undefined) payload.dia_vencimento = b.diaVencimento;
    if (b.limite !== undefined) payload.limite = b.limite;
    if (b.ativo !== undefined) payload.ativo = b.ativo;

    const { data, error } = await supabaseAdmin.from('cartoes').update(payload).eq('id', atual.id).select('*').single();
    if (error) throw error;

    let recalculados = 0;
    if (data.dia_fechamento !== cicloAnterior.fechamento || data.dia_vencimento !== cicloAnterior.vencimento) {
      recalculados = await recalcularCaixaDoCartao(data.user_id, data);
    }
    res.json({ ...paraApi(data), recalculados });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/cartoes/:id — as compras continuam, só perdem o vínculo com o cartão. */
router.delete('/:id', exigirUuid('id'), async (req, res, next) => {
  try {
    const atual = await buscarCartao(req, req.params.id);
    const { error } = await supabaseAdmin.from('cartoes').delete().eq('id', atual.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cartoes/:id/faturas?meses=6
 * Faturas do cartão agrupadas pelo mês de VENCIMENTO (caixa), incluindo
 * as futuras já comprometidas por parcelas.
 */
router.get('/:id/faturas', exigirUuid('id'), async (req, res, next) => {
  try {
    const cartao = await buscarCartao(req, req.params.id);
    const mesesFuturos = Math.min(Math.max(Number(req.query.meses) || 12, 1), 36);
    const hoje = hojeBrasil();
    const inicio = `${somarMeses(mesDe(hoje), -6)}-01`;
    const fim = `${somarMeses(mesDe(hoje), mesesFuturos + 1)}-01`;

    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .select('id, descricao, valor, categoria, data_competencia, data_caixa, data_transacao, parcela_atual, parcelas_total')
      .eq('cartao_id', cartao.id)
      .gte('data_caixa', inicio)
      .lt('data_caixa', fim)
      .order('data_competencia', { ascending: true });
    if (error) throw error;

    const porMes = new Map();
    for (const t of data || []) {
      const mes = mesDe(t.data_caixa);
      if (!porMes.has(mes)) {
        porMes.set(mes, { mes, vencimento: t.data_caixa, total: 0, compras: 0, parcelas: 0, itens: [] });
      }
      const f = porMes.get(mes);
      const valor = Number(t.valor) || 0;
      f.total += -valor; // compras negativas somam, estornos (positivos) abatem
      if (valor < 0) f.compras += 1;
      if (t.parcelas_total) f.parcelas += 1;
      f.itens.push({
        id: t.id,
        descricao: t.descricao,
        valor,
        categoria: t.categoria,
        dataCompra: t.data_competencia || t.data_transacao,
        parcela: t.parcelas_total ? `${t.parcela_atual}/${t.parcelas_total}` : null,
      });
    }

    // Fatura "aberta" = a que recebe uma compra feita hoje.
    const mesAberta = calcularFatura({
      dataCompra: hoje,
      diaFechamento: cartao.dia_fechamento,
      diaVencimento: cartao.dia_vencimento,
    }).mesFatura;

    const situacaoDe = (f) => {
      if (f.vencimento < hoje) return 'anterior'; // já venceu
      if (f.mes < mesAberta) return 'fechada'; // fechou, aguardando pagamento
      if (f.mes === mesAberta) return 'aberta'; // ainda recebendo compras
      return 'futura'; // só parcelas já comprometidas
    };

    const faturas = [...porMes.values()]
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((f) => ({ ...f, total: Math.round(f.total * 100) / 100, situacao: situacaoDe(f) }));

    res.json({ cartao: paraApi(cartao), faturas });
  } catch (err) {
    next(err);
  }
});

export default router;
