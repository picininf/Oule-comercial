/**
 * Roda UMA VEZ depois do schema_v4_oule.sql: converte as categorias já
 * gravadas (inglês da Pluggy, nomes antigos do bot/IA) para as
 * Categorias Oule e preenche o tipo de gasto padrão. A categoria antiga é
 * guardada em `categoria_original`. Pode rodar de novo sem problema.
 *
 * Uso: npm run normalizar:categorias            (aplica)
 *      npm run normalizar:categorias -- --teste (só mostra o que mudaria)
 */
import 'dotenv/config';

const { supabaseAdmin } = await import('../config/supabaseAdmin.js');
const { normalizarCategoria, ehCategoriaValida, categoriaInfo, tipoGastoPadrao } = await import('../utils/categorias.js');

const teste = process.argv.includes('--teste');
let alteradas = 0;
let lidas = 0;
const resumo = {};

for (let inicio = 0; ; inicio += 1000) {
  const { data, error } = await supabaseAdmin
    .from('transacoes')
    .select('id, categoria, categoria_original, descricao, valor, tipo_gasto')
    .order('id')
    .range(inicio, inicio + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;

  for (const t of data) {
    lidas += 1;
    const nova = ehCategoriaValida(t.categoria) ? t.categoria : normalizarCategoria(t.categoria, t.descricao, t.valor);
    const despesa = Number(t.valor) < 0 && categoriaInfo(nova).grupo === 'despesa';
    const tipo = despesa ? t.tipo_gasto || tipoGastoPadrao(nova) : null;
    if (nova === t.categoria && tipo === t.tipo_gasto) continue;

    const chave = `${t.categoria} -> ${nova}`;
    resumo[chave] = (resumo[chave] || 0) + 1;
    alteradas += 1;
    if (!teste) {
      const { error: erroUpd } = await supabaseAdmin
        .from('transacoes')
        .update({ categoria: nova, tipo_gasto: tipo, categoria_original: t.categoria_original || t.categoria })
        .eq('id', t.id);
      if (erroUpd) throw erroUpd;
    }
  }
  if (data.length < 1000) break;
}

console.table(Object.entries(resumo).map(([mudanca, quantidade]) => ({ mudanca, quantidade })));
console.log(`${teste ? '🔎 (teste) ' : '✅ '}${alteradas} de ${lidas} transações ${teste ? 'seriam' : 'foram'} atualizadas.`);
process.exit(0);
