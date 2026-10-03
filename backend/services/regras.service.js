import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { semAcento, categoriaInfo, tipoGastoPadrao } from '../utils/categorias.js';

/**
 * "Minhas regras": classificação memorizada pelo cliente.
 *
 * Uma regra diz "toda descrição que contém X (no sentido saída/entrada)
 * vira categoria Y, tipo de gasto Z e passa a se chamar W". Ela é
 * aplicada em toda transação nova (planilha/extrato, Open Finance,
 * comprovante do WhatsApp) e, sob demanda, nas que já existem.
 *
 * O casamento é sempre feito contra a descrição ORIGINAL do banco
 * (`descricao_original`), para que um lançamento renomeado para
 * "Brownie" continue sendo reconhecido se a regra mudar depois.
 */

/** Texto comparável: sem acento, minúsculo, espaços simples. */
export function normalizarTexto(texto) {
  return semAcento(texto).replace(/\s+/g, ' ').trim();
}

// Prefixos genéricos que os bancos põem antes do nome de quem recebeu.
const PREFIXO_GENERICO = /^(transferencia|pix|ted|doc|compra|pagamento|pagto|pgto|debito|credito|envio|recebimento|boleto)\b/;
// Trechos que identificam conta/documento, não a pessoa ou a loja.
const TRECHO_TECNICO = /•|\*{2,}|agencia|conta:|\(\d{3,4}\)|^\d{2,3}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^[\d.\-/\s]+$/;

/**
 * Sugere o trecho estável de uma descrição de banco — normalmente o nome
 * de quem recebeu. Ex.:
 *   "Transferência enviada pelo Pix - Pedro Veiga Rela Tavares - •••.007.268-•• - MERCADO PAGO..."
 *   -> "Pedro Veiga Rela Tavares"
 *   "Compra no débito - AMAGI LANCHONETE BUFFE" -> "AMAGI LANCHONETE BUFFE"
 * Espelhado em frontend/src/lib/regras.js.
 */
export function sugerirPadrao(descricao) {
  const original = String(descricao || '').trim();
  const partes = original.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  const candidatas = partes.filter((p, i) => {
    const n = normalizarTexto(p);
    if (TRECHO_TECNICO.test(n) || TRECHO_TECNICO.test(p)) return false;
    // O primeiro trecho costuma ser "Transferência enviada pelo Pix".
    if (i === 0 && partes.length > 1 && PREFIXO_GENERICO.test(n)) return false;
    return true;
  });
  const escolhida = (candidatas[0] || original)
    // "29.828.104 CLAUDIO ..." -> "CLAUDIO ..." (CNPJ de MEI antes do nome)
    .replace(/^\d{2}\.\d{3}\.\d{3}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return escolhida.slice(0, 120);
}

/** A regra vale para este lançamento? */
export function regraCasa(regra, descricao, valor) {
  if (!regra || regra.ativo === false) return false;
  const v = Number(valor) || 0;
  if (regra.sentido === 'saida' && v >= 0) return false;
  if (regra.sentido === 'entrada' && v <= 0) return false;
  const padrao = normalizarTexto(regra.padrao);
  return padrao.length >= 2 && normalizarTexto(descricao).includes(padrao);
}

/** Regra mais específica (padrão mais longo) vence quando várias casam. */
export function encontrarRegra(regras, descricao, valor) {
  let melhor = null;
  for (const r of regras || []) {
    if (!regraCasa(r, descricao, valor)) continue;
    if (!melhor || normalizarTexto(r.padrao).length > normalizarTexto(melhor.padrao).length) melhor = r;
  }
  return melhor;
}

/**
 * Campos a gravar na transação quando a regra casa. `t` precisa de
 * descricao, valor e (se houver) descricao_original.
 */
export function camposDaRegra(regra, t) {
  const original = t.descricao_original || t.descricao || '';
  const campos = { regra_id: regra.id, descricao_original: original };
  if (regra.descricao) campos.descricao = regra.descricao;

  if (regra.categoria) {
    campos.categoria = regra.categoria;
    const despesa = Number(t.valor) < 0 && categoriaInfo(regra.categoria).grupo === 'despesa';
    campos.tipo_gasto = despesa ? regra.tipo_gasto || tipoGastoPadrao(regra.categoria) : null;
  } else if (regra.tipo_gasto && Number(t.valor) < 0) {
    campos.tipo_gasto = regra.tipo_gasto;
  }
  return campos;
}

/**
 * Regras ativas do usuário. Se a v5 do banco ainda não foi rodada, devolve
 * lista vazia (com aviso no log) para não travar importações e o bot.
 */
export async function carregarRegras(userId) {
  const { data, error } = await supabaseAdmin
    .from('regras_transacao')
    .select('*')
    .eq('user_id', userId)
    .eq('ativo', true);
  if (error) {
    console.warn('⚠️ Regras de classificação indisponíveis (rode o schema_v5_regras.sql?):', error.message);
    return [];
  }
  return data || [];
}

/**
 * Aplica as regras do usuário nas linhas que vão ser gravadas (mutando e
 * devolvendo a lista). Quando não há regras, as linhas ficam intactas —
 * assim nada quebra num banco sem as colunas da v5.
 */
export async function aplicarRegras(userId, linhas, regrasPreCarregadas = null) {
  const regras = regrasPreCarregadas || (await carregarRegras(userId));
  if (regras.length === 0) return linhas;
  for (const l of linhas) {
    const regra = encontrarRegra(regras, l.descricao_original || l.descricao, l.valor);
    if (regra) {
      Object.assign(l, camposDaRegra(regra, l));
    } else {
      // Toda linha do lote com as mesmas colunas (o upsert do Open
      // Finance trata coluna ausente como null).
      l.regra_id = null;
      l.descricao_original = l.descricao_original ?? null;
    }
  }
  return linhas;
}

/** Todas as transações do usuário com o mínimo para casar regras. */
async function transacoesDoUsuario(userId) {
  const todas = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .select('id, descricao, descricao_original, valor, categoria, tipo_gasto, regra_id, data_competencia, data_transacao')
      .eq('user_id', userId)
      .order('data_transacao', { ascending: false })
      .range(inicio, inicio + 999);
    if (error) throw error;
    todas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return todas;
}

/** Lançamentos já gravados que a regra pegaria (para a prévia). */
export async function transacoesQueCasam(userId, regra) {
  const todas = await transacoesDoUsuario(userId);
  return todas.filter((t) => regraCasa(regra, t.descricao_original || t.descricao, t.valor));
}

/**
 * Aplica uma regra nos lançamentos já existentes (os que casam com ela e
 * os que já tinham sido classificados por ela). Devolve quantos mudaram.
 */
export async function aplicarRegraNasExistentes(userId, regra) {
  const todas = await transacoesDoUsuario(userId);
  const alvo = todas.filter((t) => t.regra_id === regra.id || regraCasa(regra, t.descricao_original || t.descricao, t.valor));

  // Agrupa por conteúdo do update para gravar em lote (a maioria das
  // linhas recebe exatamente os mesmos campos).
  const grupos = new Map();
  for (const t of alvo) {
    const campos = regraCasa(regra, t.descricao_original || t.descricao, t.valor)
      ? camposDaRegra(regra, t)
      : desfazerCampos(t); // era desta regra, mas o padrão mudou e não casa mais
    const chave = JSON.stringify(campos);
    if (!grupos.has(chave)) grupos.set(chave, { campos, ids: [] });
    grupos.get(chave).ids.push(t.id);
  }

  const agora = new Date().toISOString();
  for (const { campos, ids } of grupos.values()) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabaseAdmin
        .from('transacoes')
        .update({ ...campos, updated_at: agora })
        .eq('user_id', userId)
        .in('id', ids.slice(i, i + 200));
      if (error) throw error;
    }
  }
  return alvo.length;
}

/** Devolve a descrição do banco e solta o vínculo com a regra. */
function desfazerCampos(t) {
  return {
    regra_id: null,
    descricao: t.descricao_original || t.descricao,
    descricao_original: null,
  };
}

/** Ao excluir uma regra com "desfazer": volta a descrição original do banco. */
export async function desfazerRegra(userId, regraId) {
  const { data, error } = await supabaseAdmin
    .from('transacoes')
    .select('id, descricao, descricao_original')
    .eq('user_id', userId)
    .eq('regra_id', regraId);
  if (error) throw error;
  for (const t of data || []) {
    const { error: erroUpd } = await supabaseAdmin
      .from('transacoes')
      .update({ ...desfazerCampos(t), updated_at: new Date().toISOString() })
      .eq('id', t.id);
    if (erroUpd) throw erroUpd;
  }
  return (data || []).length;
}
