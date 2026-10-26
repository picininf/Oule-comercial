/**
 * Conserta entradas (dinheiro recebido) gravadas antes da correção de
 * 26/10/2026, que não apareciam em lugar nenhum:
 *
 *   1. Pix/TED recebido de outra pessoa marcado como "Transferências"
 *      (a IA do extrato fazia isso) — transferência não conta como renda,
 *      então o valor sumia dos totais, do Início e do Plano.
 *   2. Entrada que caiu numa categoria de despesa (ex.: "Pix recebido -
 *      Escola ABC" em Educação) — no Plano somava como gasto.
 *
 * Só mexe em lançamentos com sinal confiável (Open Finance, extrato,
 * planilha, lançamento manual e WhatsApp). Registros antigos (origem
 * "manual") só entram com --incluir-antigos.
 *
 * Uso: npm run corrigir:entradas -- --teste   (só mostra o que mudaria)
 *      npm run corrigir:entradas              (aplica)
 */
import 'dotenv/config';

const { supabaseAdmin } = await import('../config/supabaseAdmin.js');
const { revisarTransferencia, categoriaDaEntrada } = await import('../utils/categorias.js');

const teste = process.argv.includes('--teste');
const incluirAntigos = process.argv.includes('--incluir-antigos');
const ORIGENS_CONFIAVEIS = new Set(['open_finance', 'extrato_manual', 'extrato_planilha', 'lancamento', 'whatsapp']);

const nomes = new Map();
async function nomeDe(userId) {
  if (!nomes.has(userId)) {
    const { data } = await supabaseAdmin.from('profiles').select('nome').eq('id', userId).maybeSingle();
    nomes.set(userId, data?.nome || '');
  }
  return nomes.get(userId);
}

const resumo = {};
let lidas = 0;
let alteradas = 0;
let antigasIgnoradas = 0;

for (let inicio = 0; ; inicio += 1000) {
  const { data, error } = await supabaseAdmin
    .from('transacoes')
    .select('id, user_id, descricao, descricao_original, valor, categoria, categoria_original, origem, open_finance_id, conta_tipo, regra_id')
    .gt('valor', 0)
    .order('id')
    .range(inicio, inicio + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;

  for (const t of data) {
    lidas += 1;
    // Categoria escolhida pelo cliente numa regra é decisão dele.
    if (t.regra_id) continue;
    const confiavel = t.open_finance_id || ORIGENS_CONFIAVEIS.has(t.origem);
    if (!confiavel && !incluirAntigos) {
      if (t.categoria === 'Transferências') antigasIgnoradas += 1;
      continue;
    }

    const descricao = t.descricao_original || t.descricao || '';
    let nova = categoriaDaEntrada(t.categoria, descricao, t.valor);
    nova = revisarTransferencia(nova, {
      descricao,
      valor: Number(t.valor),
      categoriaOriginal: t.categoria_original,
      nomeCliente: await nomeDe(t.user_id),
      ehCartao: t.conta_tipo === 'cartao_credito',
    });
    if (nova === t.categoria) continue;

    const chave = `${t.categoria} -> ${nova}`;
    resumo[chave] = (resumo[chave] || 0) + 1;
    alteradas += 1;
    if (!teste) {
      const { error: erroUpd } = await supabaseAdmin
        .from('transacoes')
        .update({ categoria: nova, tipo_gasto: null, updated_at: new Date().toISOString() })
        .eq('id', t.id);
      if (erroUpd) throw erroUpd;
    }
  }
  if (data.length < 1000) break;
}

console.table(Object.entries(resumo).map(([mudanca, quantidade]) => ({ mudanca, quantidade })));
console.log(`${teste ? '🔎 (teste) ' : '✅ '}${alteradas} de ${lidas} entradas ${teste ? 'seriam' : 'foram'} corrigidas.`);
if (antigasIgnoradas > 0) {
  console.log(`ℹ️  ${antigasIgnoradas} entrada(s) antigas (origem "manual") em Transferências não foram tocadas. Para incluir: --incluir-antigos`);
}
process.exit(0);
