import { Router } from 'express';
import { z } from 'zod';
import { autenticado } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { resolverUsuarioAlvo } from '../utils/acesso.js';
import { httpError } from '../utils/http.js';
import { hojeBrasil, idadeEmAnos } from '../utils/financeUtils.js';
import { validar } from '../validators/validate.js';
import { CATEGORIA_IDS } from '../utils/categorias.js';
import { montarPainel, sugerirOrcamento, premissasParaApi } from '../services/plano.service.js';
import { projetarFuturo, aposentadoriaParaApi, calcularAposentadoria } from '../services/projecao.service.js';

const router = Router();
router.use(autenticado);

const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (use AAAA-MM).');
const anoAtual = () => Number(hojeBrasil().slice(0, 4));

function anoValido(valor) {
  const ano = Number(valor || anoAtual());
  if (!Number.isInteger(ano) || ano < 2000 || ano > anoAtual() + 30) throw httpError(400, 'Ano inválido.');
  return ano;
}

/**
 * GET /api/plano/painel?ano=2027&regime=competencia|caixa&userId=
 * Linha do tempo do ano (passado, atual ou FUTURO) + conclusões.
 */
router.get('/painel', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const regime = req.query.regime === 'caixa' ? 'caixa' : 'competencia';
    res.json(await montarPainel(alvo, { ano: anoValido(req.query.ano), regime }));
  } catch (err) {
    next(err);
  }
});

/** GET /api/plano/orcamento?mes=AAAA-MM&userId= */
router.get('/orcamento', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const mes = mesSchema.safeParse(String(req.query.mes || ''));
    if (!mes.success) throw httpError(400, 'Informe o mês no formato AAAA-MM.');

    const { data, error } = await supabaseAdmin
      .from('plano_mensal')
      .select('id, categoria, valor_planejado')
      .eq('user_id', alvo)
      .eq('mes', mes.data)
      .order('categoria', { ascending: true });
    if (error) throw error;
    res.json((data || []).map((r) => ({ id: r.id, categoria: r.categoria, valorPlanejado: Number(r.valor_planejado) })));
  } catch (err) {
    next(err);
  }
});

const itensSchema = z
  .array(
    z.object({
      categoria: z.enum(CATEGORIA_IDS, { errorMap: () => ({ message: 'Categoria inválida no orçamento.' }) }),
      valorPlanejado: z.coerce.number().finite().min(0).max(100_000_000),
    })
  )
  .max(60);

const orcamentoSchema = z.object({
  userId: z.string().uuid().optional(),
  mes: mesSchema,
  itens: itensSchema,
});

async function gravarOrcamento(userId, mes, itens) {
  const { error: erroDelete } = await supabaseAdmin.from('plano_mensal').delete().eq('user_id', userId).eq('mes', mes);
  if (erroDelete) throw erroDelete;

  // Soma itens repetidos da mesma categoria (evita violar o índice único).
  const porCategoria = new Map();
  for (const i of itens) {
    if (i.valorPlanejado > 0) porCategoria.set(i.categoria, (porCategoria.get(i.categoria) || 0) + i.valorPlanejado);
  }
  const linhas = [...porCategoria].map(([categoria, valor]) => ({ user_id: userId, mes, categoria, valor_planejado: valor }));
  if (linhas.length > 0) {
    const { error } = await supabaseAdmin.from('plano_mensal').insert(linhas);
    if (error) throw error;
  }
}

/** PUT /api/plano/orcamento — substitui o orçamento (receitas + despesas) do mês. */
router.put('/orcamento', validar(orcamentoSchema), async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.body.userId);
    await gravarOrcamento(alvo, req.body.mes, req.body.itens);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const copiarSchema = z.object({
  userId: z.string().uuid().optional(),
  origem: mesSchema,
  destinos: z.array(mesSchema).min(1).max(36),
  // Reajuste aplicado a cada mês de destino (ex.: 4.5 = +4,5%).
  reajustePct: z.coerce.number().min(-50).max(100).default(0),
  sobrescrever: z.boolean().default(true),
});

/**
 * POST /api/plano/orcamento/copiar
 * Replica o orçamento de um mês para vários (ex.: "copiar janeiro para o
 * resto do ano" ou "repetir este ano em 2027 com +5%").
 */
router.post('/orcamento/copiar', validar(copiarSchema), async (req, res, next) => {
  try {
    const { origem, destinos, reajustePct, sobrescrever } = req.body;
    const alvo = await resolverUsuarioAlvo(req, req.body.userId);

    const { data: base, error } = await supabaseAdmin
      .from('plano_mensal')
      .select('categoria, valor_planejado')
      .eq('user_id', alvo)
      .eq('mes', origem);
    if (error) throw error;
    if (!base || base.length === 0) throw httpError(400, 'O mês de origem não tem orçamento para copiar.');

    const fator = 1 + reajustePct / 100;
    const itens = base.map((b) => ({ categoria: b.categoria, valorPlanejado: Math.round(Number(b.valor_planejado) * fator * 100) / 100 }));

    let copiados = 0;
    for (const destino of [...new Set(destinos)].filter((d) => d !== origem)) {
      if (!sobrescrever) {
        const { count } = await supabaseAdmin
          .from('plano_mensal')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', alvo)
          .eq('mes', destino);
        if (count > 0) continue;
      }
      await gravarOrcamento(alvo, destino, itens);
      copiados += 1;
    }
    res.json({ ok: true, copiados });
  } catch (err) {
    next(err);
  }
});

/** GET /api/plano/orcamento/sugestao?meses=3&userId= — orçamento baseado na média real. */
router.get('/orcamento/sugestao', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const meses = Math.min(Math.max(Number(req.query.meses) || 3, 1), 12);
    res.json(await sugerirOrcamento(alvo, { meses }));
  } catch (err) {
    next(err);
  }
});

/** GET /api/plano/premissas?ano=&userId= */
router.get('/premissas', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const ano = anoValido(req.query.ano);
    const { data, error } = await supabaseAdmin.from('plano_premissas').select('*').eq('user_id', alvo).eq('ano', ano).maybeSingle();
    if (error) throw error;
    res.json({ ano, ...premissasParaApi(data) });
  } catch (err) {
    next(err);
  }
});

const premissasSchema = z.object({
  userId: z.string().uuid().optional(),
  ano: z.coerce.number().int().min(2000).max(2100),
  inflacaoAnual: z.coerce.number().min(-5).max(50),
  reajusteRendaAnual: z.coerce.number().min(-50).max(100),
  metaPoupancaPct: z.coerce.number().min(0).max(90),
  patrimonioInicial: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  observacoes: z.string().trim().max(2000).optional().nullable(),
});

/** PUT /api/plano/premissas — hipóteses do ano (inflação, reajuste, meta de poupança...). */
router.put('/premissas', validar(premissasSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const alvo = await resolverUsuarioAlvo(req, b.userId);
    const { data, error } = await supabaseAdmin
      .from('plano_premissas')
      .upsert(
        {
          user_id: alvo,
          ano: b.ano,
          inflacao_anual: b.inflacaoAnual,
          reajuste_renda_anual: b.reajusteRendaAnual,
          meta_poupanca_pct: b.metaPoupancaPct,
          patrimonio_inicial: b.patrimonioInicial ?? null,
          observacoes: b.observacoes || null,
          atualizado_por: req.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,ano' }
      )
      .select('*')
      .single();
    if (error) throw error;
    res.json({ ano: b.ano, ...premissasParaApi(data) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/plano/projecao?anos=10&aporteExtra=0&cortePct=0&userId=
 * Visão de futuro + sonhos + aposentadoria, com simulador "e se?".
 */
router.get('/projecao', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const anos = Math.min(Math.max(Number(req.query.anos) || 10, 1), 40);
    const aporteExtra = Math.min(Math.max(Number(req.query.aporteExtra) || 0, 0), 1_000_000);
    const cortePct = Math.min(Math.max(Number(req.query.cortePct) || 0, 0), 90);
    res.json(await projetarFuturo(alvo, { anos, aporteExtra, cortePct }));
  } catch (err) {
    next(err);
  }
});

/** GET /api/plano/aposentadoria?userId= */
router.get('/aposentadoria', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const [{ data, error }, { data: perfil }] = await Promise.all([
      supabaseAdmin.from('aposentadoria_planos').select('*').eq('user_id', alvo).maybeSingle(),
      supabaseAdmin.from('profiles').select('data_nascimento').eq('id', alvo).maybeSingle(),
    ]);
    if (error) throw error;
    const config = aposentadoriaParaApi(data);
    res.json({ config, resultado: calcularAposentadoria(config, idadeEmAnos(perfil?.data_nascimento)) });
  } catch (err) {
    next(err);
  }
});

const aposentadoriaSchema = z.object({
  userId: z.string().uuid().optional(),
  idadeAposentadoria: z.coerce.number().int().min(18).max(100),
  rendaDesejada: z.coerce.number().min(0).max(10_000_000),
  patrimonioAtual: z.coerce.number().min(0).max(1_000_000_000),
  aporteMensal: z.coerce.number().min(0).max(10_000_000),
  rentabilidadeRealAnual: z.coerce.number().min(-10).max(30),
  taxaRetiradaAnual: z.coerce.number().min(1).max(15),
  outrasRendas: z.coerce.number().min(0).max(10_000_000).default(0),
});

/** PUT /api/plano/aposentadoria */
router.put('/aposentadoria', validar(aposentadoriaSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const alvo = await resolverUsuarioAlvo(req, b.userId);
    const { data, error } = await supabaseAdmin
      .from('aposentadoria_planos')
      .upsert(
        {
          user_id: alvo,
          idade_aposentadoria: b.idadeAposentadoria,
          renda_desejada: b.rendaDesejada,
          patrimonio_atual: b.patrimonioAtual,
          aporte_mensal: b.aporteMensal,
          rentabilidade_real_anual: b.rentabilidadeRealAnual,
          taxa_retirada_anual: b.taxaRetiradaAnual,
          outras_rendas: b.outrasRendas,
          atualizado_por: req.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();
    if (error) throw error;

    const { data: perfil } = await supabaseAdmin.from('profiles').select('data_nascimento').eq('id', alvo).maybeSingle();
    const config = aposentadoriaParaApi(data);
    res.json({ config, resultado: calcularAposentadoria(config, idadeEmAnos(perfil?.data_nascimento)) });
  } catch (err) {
    next(err);
  }
});

export default router;
