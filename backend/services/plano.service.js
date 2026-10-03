import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { categoriaInfo } from '../utils/categorias.js';
import {
  getValorAjustado, ehTransferencia, dataNoRegime, hojeBrasil, mesDe, somarMeses, formatarMoeda, formatarPct } from '../utils/financeUtils.js';
import { vigenteNoMes } from './pagamentos.service.js';

/**
 * Plano x Vida Real.
 *
 * Para cada mês do ano escolhido (passado, atual ou futuro) monta:
 *   - realizado: o que de fato entrou/saiu (transações);
 *   - planejado: o orçamento definido pela pessoa/planejador, incluindo
 *     RECEITAS planejadas (ex.: Salário) — antes só havia despesas;
 *   - comprometido: o que já está "contratado" para aquele mês mesmo sem
 *     plano: parcelas de cartão que caem naquela fatura + contas fixas
 *     cadastradas em Pagamentos;
 *   - previsto: para meses sem realizado, a melhor estimativa disponível
 *     (plano > histórico recente corrigido pelas premissas do ano).
 *
 * E tira conclusões automáticas (fechamento do ano, meses no vermelho,
 * plano otimista demais, peso das parcelas, sonhos que cabem no plano).
 */

const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const PREMISSAS_PADRAO = {
  inflacaoAnual: 4.5,
  reajusteRendaAnual: 5,
  metaPoupancaPct: 20,
  patrimonioInicial: null,
  observacoes: '',
};

export function premissasParaApi(p) {
  if (!p) return { ...PREMISSAS_PADRAO };
  return {
    inflacaoAnual: Number(p.inflacao_anual),
    reajusteRendaAnual: Number(p.reajuste_renda_anual),
    metaPoupancaPct: Number(p.meta_poupanca_pct),
    patrimonioInicial: p.patrimonio_inicial !== null ? Number(p.patrimonio_inicial) : null,
    observacoes: p.observacoes || '',
  };
}

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Classifica uma transação em entrada/saída ignorando transferências. */
function classificar(t) {
  if (ehTransferencia(t)) return null;
  const valor = getValorAjustado(t);
  if (valor === 0) return null;
  return { valor, categoria: t.categoria || 'Outros', entrada: valor > 0 };
}

async function buscarTransacoes(userId, coluna, de, ate) {
  const linhas = [];
  const pagina = 1000;
  for (let inicio = 0; inicio < 20000; inicio += pagina) {
    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .select('valor, categoria, descricao, origem, open_finance_id, data_transacao, data_competencia, data_caixa, cartao_id, parcelas_total, tipo_gasto')
      .eq('user_id', userId)
      .gte(coluna, de)
      .lt(coluna, ate)
      .range(inicio, inicio + pagina - 1);
    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < pagina) break;
  }
  return linhas;
}

/**
 * Média mensal real dos últimos `meses` meses FECHADOS (antes do mês
 * atual), por categoria. É a base "honesta" para checar se um plano é
 * realista e para prever meses sem plano.
 */
export async function mediaHistorica(userId, { meses = 3, regime = 'competencia' } = {}) {
  const mesAtual = mesDe(hojeBrasil());
  const de = `${somarMeses(mesAtual, -meses)}-01`;
  const ate = `${mesAtual}-01`;
  const coluna = regime === 'caixa' ? 'data_caixa' : 'data_competencia';
  const transacoes = await buscarTransacoes(userId, coluna, de, ate);

  const mesesComDado = new Set();
  const porCategoria = {};
  let entradas = 0;
  let saidas = 0;
  for (const t of transacoes) {
    const c = classificar(t);
    if (!c) continue;
    mesesComDado.add(mesDe(dataNoRegime(t, regime)));
    if (c.entrada) {
      entradas += c.valor;
      porCategoria[c.categoria] = (porCategoria[c.categoria] || 0) + c.valor;
    } else {
      saidas += -c.valor;
      porCategoria[c.categoria] = (porCategoria[c.categoria] || 0) + -c.valor;
    }
  }

  const divisor = Math.max(mesesComDado.size, 1);
  const media = Object.fromEntries(Object.entries(porCategoria).map(([k, v]) => [k, arred(v / divisor)]));
  return {
    mesesConsiderados: mesesComDado.size,
    entradas: arred(entradas / divisor),
    saidas: arred(saidas / divisor),
    porCategoria: media,
  };
}

/**
 * Sugestão de orçamento para um mês: média real recente por categoria,
 * arredondada para cima em múltiplos de R$ 10, + contas fixas que não
 * apareceram no histórico.
 */
export async function sugerirOrcamento(userId, { meses = 3 } = {}) {
  const [hist, { data: contas }] = await Promise.all([
    mediaHistorica(userId, { meses }),
    supabaseAdmin.from('pagamentos_recorrentes').select('categoria, valor, ativo').eq('user_id', userId).eq('ativo', true),
  ]);

  const itens = { ...hist.porCategoria };
  const fixasPorCategoria = {};
  for (const c of contas || []) fixasPorCategoria[c.categoria] = (fixasPorCategoria[c.categoria] || 0) + Number(c.valor);
  for (const [cat, valor] of Object.entries(fixasPorCategoria)) {
    itens[cat] = Math.max(itens[cat] || 0, valor);
  }

  return Object.entries(itens)
    .filter(([cat, v]) => v > 0 && categoriaInfo(cat).grupo !== 'neutro')
    .map(([categoria, v]) => ({ categoria, valorPlanejado: Math.ceil(v / 10) * 10 }))
    .sort((a, b) => b.valorPlanejado - a.valorPlanejado);
}

function novoMes(ano, i) {
  return {
    mes: `${ano}-${String(i + 1).padStart(2, '0')}`,
    label: NOMES_MES[i],
    real: { entradas: 0, saidas: 0, categorias: {} },
    plano: { receitas: 0, despesas: 0, categorias: {} },
    comprometido: { parcelas: 0, contasFixas: 0 },
  };
}

/**
 * Monta o painel anual completo + conclusões.
 */
export async function montarPainel(userId, { ano, regime = 'competencia' }) {
  const hoje = hojeBrasil();
  const mesAtual = mesDe(hoje);
  const anoAtual = Number(hoje.slice(0, 4));
  const coluna = regime === 'caixa' ? 'data_caixa' : 'data_competencia';
  const inicio = `${ano}-01-01`;
  const fim = `${ano + 1}-01-01`;

  const [
    transacoes, parcelasFuturas,
    { data: plano, error: e1 }, { data: premissasLinha }, { data: contas, error: e2 },
    { data: objetivos, error: e3 }, { data: perfil }, historico,
  ] = await Promise.all([
    buscarTransacoes(userId, coluna, inicio, fim),
    // Parcelas de cartão que VENCEM no ano (independente do regime): é o
    // dinheiro que já está comprometido nos meses futuros.
    buscarTransacoes(userId, 'data_caixa', inicio, fim),
    supabaseAdmin.from('plano_mensal').select('mes, categoria, valor_planejado').eq('user_id', userId).like('mes', `${ano}-%`),
    supabaseAdmin.from('plano_premissas').select('*').eq('user_id', userId).eq('ano', ano).maybeSingle(),
    supabaseAdmin.from('pagamentos_recorrentes').select('*').eq('user_id', userId),
    supabaseAdmin.from('objetivos').select('id, titulo, valor_alvo, valor_atual, prazo, status').eq('user_id', userId).eq('status', 'em_andamento'),
    supabaseAdmin.from('profiles').select('renda_mensal').eq('id', userId).maybeSingle(),
    mediaHistorica(userId, { meses: 3, regime }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  const premissas = premissasParaApi(premissasLinha);
  const meses = Array.from({ length: 12 }, (_, i) => novoMes(ano, i));
  const porChave = new Map(meses.map((m) => [m.mes, m]));

  // 1) Realizado
  for (const t of transacoes) {
    const m = porChave.get(mesDe(dataNoRegime(t, regime)));
    const c = m && classificar(t);
    if (!c) continue;
    const cat = (m.real.categorias[c.categoria] ||= { categoria: c.categoria, real: 0, planejado: 0, comprometido: 0 });
    if (c.entrada) m.real.entradas += c.valor;
    else m.real.saidas += -c.valor;
    cat.real += Math.abs(c.valor);
  }

  // 2) Planejado (receitas e despesas)
  for (const p of plano || []) {
    const m = porChave.get(p.mes);
    if (!m) continue;
    const valor = Number(p.valor_planejado) || 0;
    const receita = categoriaInfo(p.categoria).grupo === 'receita';
    if (receita) m.plano.receitas += valor;
    else m.plano.despesas += valor;
    const cat = (m.real.categorias[p.categoria] ||= { categoria: p.categoria, real: 0, planejado: 0, comprometido: 0 });
    cat.planejado += valor;
    m.plano.categorias[p.categoria] = (m.plano.categorias[p.categoria] || 0) + valor;
  }

  // 3) Comprometido nos meses ainda não encerrados
  for (const t of parcelasFuturas) {
    if (!t.cartao_id || Number(t.valor) >= 0 || ehTransferencia(t)) continue;
    const mesCaixa = mesDe(t.data_caixa);
    if (mesCaixa < mesAtual) continue;
    // Só conta como "comprometido" o que foi comprado ANTES do mês da
    // fatura (parcelas e compras já feitas que ainda vão vencer).
    const m = porChave.get(mesCaixa);
    if (m && mesDe(t.data_competencia || t.data_transacao) < mesCaixa) m.comprometido.parcelas += -Number(t.valor);
  }
  for (const m of meses) {
    if (m.mes < mesAtual) continue;
    m.comprometido.contasFixas = (contas || [])
      .filter((c) => vigenteNoMes(c, m.mes))
      .reduce((s, c) => s + Number(c.valor), 0);
  }

  // 4) Previsto para meses sem realizado
  const anosAFrente = Math.max(0, ano - anoAtual);
  const fatorInflacao = (1 + premissas.inflacaoAnual / 100) ** anosAFrente;
  const fatorRenda = (1 + premissas.reajusteRendaAnual / 100) ** anosAFrente;
  const rendaBase = historico.entradas || Number(perfil?.renda_mensal) || 0;
  const gastoBase = historico.saidas;

  let saldoAcumulado = 0;
  const resultado = meses.map((m) => {
    const estado = m.mes < mesAtual ? 'realizado' : m.mes === mesAtual ? 'em_andamento' : 'futuro';
    const temPlano = m.plano.receitas > 0 || m.plano.despesas > 0;
    const temReal = m.real.entradas > 0 || m.real.saidas > 0;
    // No regime de competência a compra parcelada inteira já pesou no mês
    // em que foi feita; somar as parcelas de novo nos meses seguintes
    // contaria o mesmo gasto duas vezes. No regime de caixa, cada parcela
    // é dinheiro saindo naquele mês.
    const comprometidoTotal = m.comprometido.contasFixas + (regime === 'caixa' ? m.comprometido.parcelas : 0);

    let previstoEntradas;
    let previstoSaidas;
    let fontePrevisao;
    if (estado === 'realizado') {
      previstoEntradas = m.real.entradas;
      previstoSaidas = m.real.saidas;
      fontePrevisao = 'realizado';
    } else {
      previstoEntradas = m.plano.receitas || rendaBase * fatorRenda;
      // Nunca prevê gastar menos do que já está comprometido.
      previstoSaidas = Math.max(m.plano.despesas || gastoBase * fatorInflacao, comprometidoTotal);
      fontePrevisao = temPlano ? 'plano' : historico.mesesConsiderados > 0 ? 'historico' : 'sem_dados';
      if (estado === 'em_andamento') {
        // mês corrente: o que já aconteceu nunca é "desfeito" pela previsão
        previstoEntradas = Math.max(previstoEntradas, m.real.entradas);
        previstoSaidas = Math.max(previstoSaidas, m.real.saidas);
      }
    }
    const saldoPrevisto = previstoEntradas - previstoSaidas;
    saldoAcumulado += saldoPrevisto;

    const categorias = Object.values(m.real.categorias)
      .map((c) => ({
        ...c,
        real: arred(c.real),
        planejado: arred(c.planejado),
        grupo: categoriaInfo(c.categoria).grupo,
        mediaHistorica: historico.porCategoria[c.categoria] || 0,
      }))
      .sort((a, b) => b.real + b.planejado - (a.real + a.planejado));

    return {
      mes: m.mes,
      label: m.label,
      estado,
      ehMesAtual: m.mes === mesAtual,
      temMovimento: temReal,
      temPlano,
      entradas: arred(m.real.entradas),
      saidas: arred(m.real.saidas),
      saldo: arred(m.real.entradas - m.real.saidas),
      planejadoReceitas: arred(m.plano.receitas),
      planejadoDespesas: arred(m.plano.despesas),
      planejadoTotal: arred(m.plano.despesas), // compatibilidade com a versão anterior
      comprometidoParcelas: arred(m.comprometido.parcelas),
      comprometidoContasFixas: arred(m.comprometido.contasFixas),
      previstoEntradas: arred(previstoEntradas),
      previstoSaidas: arred(previstoSaidas),
      saldoPrevisto: arred(saldoPrevisto),
      saldoAcumulado: arred(saldoAcumulado),
      fontePrevisao,
      categorias,
      alertas: alertasDoMes({ m, estado, categorias, comprometidoTotal, previstoEntradas, previstoSaidas }),
    };
  });

  const conclusoes = gerarConclusoes({
    ano, meses: resultado, historico, premissas, objetivos: objetivos || [], anoAtual,
  });

  // Competência e caixa só divergem em compras no cartão pagas em outro
  // mês. Sem nenhuma no ano, os dois regimes dão exatamente os mesmos
  // números — a tela avisa em vez de parecer que o botão não funciona.
  const lancamentosEmOutroMes = [...transacoes, ...parcelasFuturas].filter(
    (t) => mesDe(t.data_caixa || t.data_transacao) !== mesDe(t.data_competencia || t.data_transacao)
  ).length;

  return {
    ano,
    regime,
    regimesIguais: lancamentosEmOutroMes === 0,
    premissas,
    historico,
    meses: resultado,
    resumo: resumoDoAno(resultado, premissas),
    conclusoes,
  };
}

function alertasDoMes({ m, estado, categorias, comprometidoTotal, previstoEntradas, previstoSaidas }) {
  const alertas = [];
  const saldoReal = m.real.entradas - m.real.saidas;

  if (estado === 'realizado' && (m.real.entradas > 0 || m.real.saidas > 0) && saldoReal < 0) {
    const vilao = categorias.filter((c) => c.grupo === 'despesa').sort((a, b) => b.real - a.real)[0];
    alertas.push(
      vilao
        ? `Mês fechou negativo (${formatarMoeda(saldoReal)}). Maior gasto: ${vilao.categoria} (${formatarMoeda(vilao.real)}).`
        : `Mês fechou negativo (${formatarMoeda(saldoReal)}).`
    );
  }

  for (const c of categorias) {
    if (c.grupo === 'despesa' && c.planejado > 0 && c.real > c.planejado * 1.001) {
      const excesso = ((c.real / c.planejado) - 1) * 100;
      alertas.push(`${c.categoria} passou do planejado em ${formatarPct(excesso, 0)} (${formatarMoeda(c.real)} de ${formatarMoeda(c.planejado)}).`);
    }
  }

  if (estado !== 'realizado') {
    if (previstoSaidas > previstoEntradas) {
      alertas.push(`Previsão de mês no vermelho: ${formatarMoeda(previstoEntradas - previstoSaidas)}.`);
    }
    if (previstoEntradas > 0 && comprometidoTotal / previstoEntradas > 0.5) {
      alertas.push(`${formatarPct(((comprometidoTotal / previstoEntradas) * 100), 0)} da renda prevista já está comprometida com parcelas e contas fixas.`);
    }
  }
  return alertas;
}

function resumoDoAno(meses, premissas) {
  const soma = (campo) => arred(meses.reduce((s, m) => s + m[campo], 0));
  const entradasPrevistas = soma('previstoEntradas');
  const saidasPrevistas = soma('previstoSaidas');
  const saldoPrevisto = arred(entradasPrevistas - saidasPrevistas);
  return {
    entradasRealizadas: soma('entradas'),
    saidasRealizadas: soma('saidas'),
    planejadoReceitas: soma('planejadoReceitas'),
    planejadoDespesas: soma('planejadoDespesas'),
    comprometidoParcelas: soma('comprometidoParcelas'),
    entradasPrevistas,
    saidasPrevistas,
    saldoPrevisto,
    taxaPoupancaPrevista: entradasPrevistas > 0 ? arred((saldoPrevisto / entradasPrevistas) * 100) : 0,
    patrimonioFimDoAno: premissas.patrimonioInicial !== null ? arred(premissas.patrimonioInicial + saldoPrevisto) : null,
    mesesComPlano: meses.filter((m) => m.temPlano).length,
  };
}

/**
 * Conclusões lógicas sobre o ano, em ordem de importância. Cada uma traz
 * um tom (positivo | atencao | alerta) para a interface colorir.
 */
function gerarConclusoes({ ano, meses, historico, premissas, objetivos, anoAtual }) {
  const c = [];
  const r = resumoDoAno(meses, premissas);
  const futuros = meses.filter((m) => m.estado !== 'realizado');

  // 1. Fechamento do ano
  if (r.entradasPrevistas > 0 || r.saidasPrevistas > 0) {
    const verbo = ano < anoAtual ? 'fechou' : 'deve fechar';
    c.push({
      tom: r.saldoPrevisto >= 0 ? 'positivo' : 'alerta',
      titulo: `${ano} ${verbo} com ${formatarMoeda(r.saldoPrevisto)}`,
      texto: `Entradas de ${formatarMoeda(r.entradasPrevistas)} e saídas de ${formatarMoeda(r.saidasPrevistas)}` +
        ` — taxa de poupança de ${formatarPct(r.taxaPoupancaPrevista, 1)} (meta: ${premissas.metaPoupancaPct}%).` +
        (r.patrimonioFimDoAno !== null ? ` Patrimônio estimado no fim do ano: ${formatarMoeda(r.patrimonioFimDoAno)}.` : ''),
    });
  }

  // 2. Meta de poupança
  if (r.entradasPrevistas > 0 && r.taxaPoupancaPrevista < premissas.metaPoupancaPct) {
    const falta = (premissas.metaPoupancaPct / 100) * r.entradasPrevistas - r.saldoPrevisto;
    const mesesRestantes = Math.max(futuros.length, 1);
    c.push({
      tom: 'atencao',
      titulo: 'Abaixo da meta de poupança',
      texto: `Para chegar a ${premissas.metaPoupancaPct}% faltam ${formatarMoeda(falta)} no ano — cerca de ${formatarMoeda(falta / mesesRestantes)} a menos de gastos por mês nos ${mesesRestantes} meses restantes.`,
    });
  }

  // 3. Meses no vermelho
  const vermelhos = futuros.filter((m) => m.saldoPrevisto < 0);
  if (vermelhos.length > 0) {
    c.push({
      tom: 'alerta',
      titulo: `${vermelhos.length} ${vermelhos.length === 1 ? 'mês previsto' : 'meses previstos'} no vermelho`,
      texto: `${vermelhos.map((m) => `${m.label} (${formatarMoeda(m.saldoPrevisto)})`).join(', ')}. Antecipe cortes ou reserve a sobra dos meses anteriores.`,
    });
  }
  const primeiroAcumuladoNegativo = meses.find((m) => m.estado !== 'realizado' && m.saldoAcumulado < 0);
  if (primeiroAcumuladoNegativo) {
    c.push({
      tom: 'alerta',
      titulo: `O caixa do ano fica negativo em ${primeiroAcumuladoNegativo.label}`,
      texto: `Somando os meses, a partir de ${primeiroAcumuladoNegativo.label} o acumulado do ano fica em ${formatarMoeda(primeiroAcumuladoNegativo.saldoAcumulado)} — sinal de uso de crédito/cheque especial se nada mudar.`,
    });
  }

  // 4. Plano otimista demais (planejado bem abaixo do histórico real)
  if (historico.mesesConsiderados >= 2) {
    const otimistas = [];
    const planoMedio = {};
    const mesesComPlano = futuros.filter((m) => m.temPlano);
    for (const m of mesesComPlano) {
      for (const cat of m.categorias) {
        if (cat.grupo !== 'despesa' || cat.planejado <= 0) continue;
        planoMedio[cat.categoria] = (planoMedio[cat.categoria] || 0) + cat.planejado / mesesComPlano.length;
      }
    }
    for (const [cat, plan] of Object.entries(planoMedio)) {
      const media = historico.porCategoria[cat] || 0;
      if (media > 50 && plan < media * 0.8) otimistas.push({ cat, plan, media });
    }
    if (otimistas.length > 0) {
      c.push({
        tom: 'atencao',
        titulo: 'Plano mais otimista que a realidade',
        texto: otimistas
          .slice(0, 4)
          .map((o) => `${o.cat}: planejado ${formatarMoeda(o.plan)}/mês, média real ${formatarMoeda(o.media)} (−${formatarPct((100 - (o.plan / o.media) * 100), 0)})`)
          .join('; ') + '. Ou o plano exige uma mudança concreta de hábito, ou precisa ser revisto.',
      });
    }

    // Categorias relevantes que ficaram fora do plano
    if (mesesComPlano.length > 0) {
      const esquecidas = Object.entries(historico.porCategoria)
        .filter(([cat, v]) => categoriaInfo(cat).grupo === 'despesa' && v >= 100 && !planoMedio[cat])
        .sort((a, b) => b[1] - a[1]);
      if (esquecidas.length > 0) {
        c.push({
          tom: 'atencao',
          titulo: 'Gastos frequentes fora do plano',
          texto: `${esquecidas.slice(0, 4).map(([cat, v]) => `${cat} (~${formatarMoeda(v)}/mês)`).join(', ')} aparecem no histórico mas não no orçamento.`,
        });
      }
    }
  }

  // 5. Parcelas já comprometidas
  const comParcelas = futuros.filter((m) => m.comprometidoParcelas > 0);
  if (comParcelas.length > 0) {
    const total = comParcelas.reduce((s, m) => s + m.comprometidoParcelas, 0);
    const ultimo = comParcelas[comParcelas.length - 1];
    c.push({
      tom: total > r.entradasPrevistas * 0.15 ? 'atencao' : 'neutro',
      titulo: `${formatarMoeda(total)} em parcelas de cartão já comprometidas`,
      texto: `Distribuídas em ${comParcelas.length} ${comParcelas.length === 1 ? 'fatura' : 'faturas'}, até ${ultimo.label}/${ano}. Novas compras parceladas somam a esse valor.`,
    });
  }

  // 6. Sonhos x Plano
  const sonhos = avaliarSonhos({ objetivos, meses, ano });
  if (sonhos.length > 0) {
    const atrasados = sonhos.filter((s) => !s.cabeNoPrazo);
    c.push({
      tom: atrasados.length === 0 ? 'positivo' : 'atencao',
      titulo: atrasados.length === 0
        ? 'Os sonhos com prazo cabem no plano'
        : `${atrasados.length} ${atrasados.length === 1 ? 'sonho não cabe' : 'sonhos não cabem'} no prazo com esta sobra`,
      texto: sonhos
        .map((s) => `${s.titulo}: precisa de ${formatarMoeda(s.aporteMensalNecessario)}/mês${s.cabeNoPrazo ? ' ✓' : ` — ${s.motivo}`}`)
        .join('; ') + '.',
    });
  }

  if (meses.every((m) => !m.temPlano) && ano >= anoAtual) {
    c.push({
      tom: 'neutro',
      titulo: 'Ainda não há orçamento para este ano',
      texto: 'As previsões acima usam a média dos últimos meses. Use "Sugerir pela média" e "Copiar para os próximos meses" para montar o plano em poucos cliques.',
    });
  }

  return c;
}

/**
 * Cruza os sonhos em andamento com a sobra prevista: quanto cada um
 * precisa por mês até o prazo e se a sobra média prevista comporta todos
 * (em ordem de prazo).
 */
function avaliarSonhos({ objetivos, meses }) {
  const hoje = hojeBrasil();
  const futuros = meses.filter((m) => m.estado !== 'realizado');
  const sobraMedia = futuros.length > 0 ? futuros.reduce((s, m) => s + m.saldoPrevisto, 0) / futuros.length : 0;
  let sobraDisponivel = Math.max(sobraMedia, 0);

  return objetivos
    .filter((o) => o.prazo && Number(o.valor_alvo) > Number(o.valor_atual))
    .sort((a, b) => a.prazo.localeCompare(b.prazo))
    .map((o) => {
      const falta = Number(o.valor_alvo) - Number(o.valor_atual);
      const mesesAtePrazo = Math.max(
        (Number(o.prazo.slice(0, 4)) - Number(hoje.slice(0, 4))) * 12 + (Number(o.prazo.slice(5, 7)) - Number(hoje.slice(5, 7))),
        1
      );
      const necessario = falta / mesesAtePrazo;
      const cabe = necessario <= sobraDisponivel + 0.01;
      const motivo = sobraMedia <= 0
        ? 'não há sobra prevista'
        : `com a sobra restante (${formatarMoeda(sobraDisponivel)}/mês) leva ~${Math.ceil(falta / Math.max(sobraDisponivel, 1))} meses`;
      if (cabe) sobraDisponivel -= necessario;
      return { id: o.id, titulo: o.titulo, prazo: o.prazo, falta, aporteMensalNecessario: arred(necessario), cabeNoPrazo: cabe, motivo };
    });
}
