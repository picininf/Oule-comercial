import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, attachProfile } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { resolverUsuarioAlvo } from '../utils/acesso.js';
import { getValorAjustado } from '../utils/financeUtils.js';

const router = Router();

router.use(requireAuth, attachProfile);

const NOMES_MES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

function mesChave(ano, indiceZeroBased) {
  return `${ano}-${String(indiceZeroBased + 1).padStart(2, '0')}`;
}

/**
 * GET /api/plano/painel?ano=2026&userId=...
 *
 * Monta a "linha do tempo" do ano: para cada um dos 12 meses, calcula
 * o que realmente aconteceu (entradas/saídas via `transacoes`) e
 * compara com o que foi planejado (`plano_mensal`). Gera alertas
 * simples e diretos sobre onde a pessoa deve segurar os gastos.
 */
router.get('/painel', async (req, res, next) => {
  try {
    const alvoUserId = await resolverUsuarioAlvo(req, req.query.userId);
    const ano = String(req.query.ano || new Date().getFullYear());

    const inicio = `${ano}-01-01`;
    const fim = `${Number(ano) + 1}-01-01`;

    const [{ data: transacoes, error: erroTransacoes }, { data: plano, error: erroPlano }] = await Promise.all([
      supabaseAdmin
        .from('transacoes')
        .select('valor, tipo, categoria, data_transacao')
        .eq('user_id', alvoUserId)
        .gte('data_transacao', inicio)
        .lt('data_transacao', fim),
      supabaseAdmin
        .from('plano_mensal')
        .select('mes, categoria, valor_planejado')
        .eq('user_id', alvoUserId)
        .like('mes', `${ano}-%`),
    ]);
    if (erroTransacoes) throw erroTransacoes;
    if (erroPlano) throw erroPlano;

    // Agrega o realizado por mês e por categoria (só saídas contam
    // para orçamento por categoria).
    const meses = Array.from({ length: 12 }, (_, i) => {
      const mes = mesChave(ano, i);
      return {
        mes,
        label: NOMES_MES[i],
        entradas: 0,
        saidas: 0,
        saldo: 0,
        planejadoTotal: 0,
        categorias: {},
      };
    });
    const mesPorChave = new Map(meses.map((m) => [m.mes, m]));

    for (const t of transacoes || []) {
      const chave = String(t.data_transacao).slice(0, 7);
      const registro = mesPorChave.get(chave);
      if (!registro) continue;

      const valor = getValorAjustado(t);
      const cat = t.categoria || 'Outros';

      if (valor > 0) {
        registro.entradas += valor;
      } else {
        const abs = Math.abs(valor);
        registro.saidas += abs;
        registro.categorias[cat] = registro.categorias[cat] || { categoria: cat, real: 0, planejado: 0 };
        registro.categorias[cat].real += abs;
      }
    }

    for (const p of plano || []) {
      const registro = mesPorChave.get(p.mes);
      if (!registro) continue;
      const cat = p.categoria || 'Outros';
      registro.planejadoTotal += Number(p.valor_planejado) || 0;
      registro.categorias[cat] = registro.categorias[cat] || { categoria: cat, real: 0, planejado: 0 };
      registro.categorias[cat].planejado += Number(p.valor_planejado) || 0;
    }

    // Gera as métricas finais + alertas, mês a mês, comparando também
    // com o mês anterior.
    let saldoMesAnterior = null;
    const mesAtualChave = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const resultado = meses.map((m) => {
      m.saldo = m.entradas - m.saidas;
      const categorias = Object.values(m.categorias).sort((a, b) => b.real - a.real);

      const alertas = [];
      const temMovimento = m.entradas > 0 || m.saidas > 0;

      if (temMovimento && m.saldo < 0) {
        const piorCategoria = categorias[0];
        alertas.push(
          piorCategoria
            ? `Mês ficou negativo (${formatarMoeda(m.saldo)}). Maior vilão: ${piorCategoria.categoria} (${formatarMoeda(piorCategoria.real)}). Vale reduzir aqui no próximo mês.`
            : `Mês ficou negativo (${formatarMoeda(m.saldo)}). Reveja os gastos para equilibrar o próximo mês.`
        );
      }

      if (temMovimento && saldoMesAnterior !== null && saldoMesAnterior >= 0 && m.saldo < saldoMesAnterior - 0.01) {
        alertas.push(`Sobrou menos que no mês anterior (${formatarMoeda(saldoMesAnterior)} → ${formatarMoeda(m.saldo)}). Fique de olho no ritmo de gastos.`);
      }

      for (const c of categorias) {
        if (c.planejado > 0 && c.real > c.planejado) {
          const excesso = ((c.real / c.planejado) - 1) * 100;
          alertas.push(`${c.categoria} passou do planejado em ${excesso.toFixed(0)}% (${formatarMoeda(c.real)} de ${formatarMoeda(c.planejado)} previstos).`);
        }
      }

      if (temMovimento) saldoMesAnterior = m.saldo;

      return {
        mes: m.mes,
        label: m.label,
        ehMesAtual: m.mes === mesAtualChave,
        temMovimento,
        entradas: m.entradas,
        saidas: m.saidas,
        saldo: m.saldo,
        planejadoTotal: m.planejadoTotal,
        categorias,
        alertas,
      };
    });

    res.json({ ano: Number(ano), meses: resultado });
  } catch (err) {
    next(err);
  }
});

function formatarMoeda(valor) {
  return `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * GET /api/plano/orcamento?mes=2026-03&userId=...
 * Lista o orçamento planejado (por categoria) de um mês específico,
 * para edição.
 */
router.get('/orcamento', async (req, res, next) => {
  try {
    const alvoUserId = await resolverUsuarioAlvo(req, req.query.userId);
    const mes = String(req.query.mes || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      return res.status(400).json({ error: 'Informe o mês no formato AAAA-MM.' });
    }

    const { data, error } = await supabaseAdmin
      .from('plano_mensal')
      .select('id, categoria, valor_planejado')
      .eq('user_id', alvoUserId)
      .eq('mes', mes)
      .order('categoria', { ascending: true });
    if (error) throw error;

    res.json((data || []).map((r) => ({ id: r.id, categoria: r.categoria, valorPlanejado: Number(r.valor_planejado) })));
  } catch (err) {
    next(err);
  }
});

const orcamentoSchema = z.object({
  userId: z.string().uuid().optional(),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (use AAAA-MM).'),
  itens: z
    .array(
      z.object({
        categoria: z.string().trim().min(1).max(60),
        valorPlanejado: z.coerce.number().finite().min(0).max(100_000_000),
      })
    )
    .max(50),
});

/**
 * PUT /api/plano/orcamento
 * Substitui por completo o orçamento planejado de um mês (mais simples
 * e previsível do que tentar fazer upsert linha a linha no frontend).
 */
router.put('/orcamento', async (req, res, next) => {
  try {
    const result = orcamentoSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Dados inválidos.', detalhes: result.error.flatten() });
    }
    const { mes, itens } = result.data;
    const alvoUserId = await resolverUsuarioAlvo(req, result.data.userId);

    const { error: erroDelete } = await supabaseAdmin
      .from('plano_mensal')
      .delete()
      .eq('user_id', alvoUserId)
      .eq('mes', mes);
    if (erroDelete) throw erroDelete;

    if (itens.length > 0) {
      const linhas = itens
        .filter((i) => i.valorPlanejado > 0)
        .map((i) => ({ user_id: alvoUserId, mes, categoria: i.categoria, valor_planejado: i.valorPlanejado }));

      if (linhas.length > 0) {
        const { error: erroInsert } = await supabaseAdmin.from('plano_mensal').insert(linhas);
        if (erroInsert) throw erroInsert;
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
