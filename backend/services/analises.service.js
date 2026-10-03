import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { categoriaInfo, semAcento, TIPOS_GASTO } from '../utils/categorias.js';
import {
  getValorAjustado, ehTransferencia, hojeBrasil, mesDe, somarMeses, diasNoMes, formatarMoeda, formatarPct } from '../utils/financeUtils.js';
import { faixaEtaria, FORMAS_TRABALHO } from '../utils/perfil.js';
import { proximosVencimentos } from './pagamentos.service.js';

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;
const COLUNAS_T = 'user_id, valor, categoria, descricao, origem, open_finance_id, data_transacao, data_competencia, tipo_gasto';

/** Grupo mínimo para mostrar comparativos entre pessoas (privacidade / k-anonimato). */
export const TAMANHO_MINIMO_GRUPO = 5;

async function buscarTransacoesDe(userIds, de, ate) {
  const linhas = [];
  for (let i = 0; i < userIds.length; i += 100) {
    const lote = userIds.slice(i, i + 100);
    for (let inicio = 0; inicio < 50000; inicio += 1000) {
      const { data, error } = await supabaseAdmin
        .from('transacoes')
        .select(COLUNAS_T)
        .in('user_id', lote)
        .gte('data_competencia', de)
        .lt('data_competencia', ate)
        .range(inicio, inicio + 999);
      if (error) throw error;
      linhas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return linhas;
}

/** Agrega transações por usuário: entradas, saídas, por categoria, por tipo de gasto e por mês. */
function agregar(transacoes) {
  const porUsuario = new Map();
  for (const t of transacoes) {
    if (ehTransferencia(t)) continue;
    const valor = getValorAjustado(t);
    if (!valor) continue;
    const mes = mesDe(t.data_competencia || t.data_transacao);
    if (!porUsuario.has(t.user_id)) {
      porUsuario.set(t.user_id, { entradas: 0, saidas: 0, categorias: {}, tipos: {}, meses: new Set(), porMes: {} });
    }
    const u = porUsuario.get(t.user_id);
    u.meses.add(mes);
    const m = (u.porMes[mes] ||= { entradas: 0, saidas: 0, categorias: {} });
    if (valor > 0) {
      u.entradas += valor;
      m.entradas += valor;
    } else {
      const abs = -valor;
      const cat = t.categoria || 'Outros';
      u.saidas += abs;
      m.saidas += abs;
      u.categorias[cat] = (u.categorias[cat] || 0) + abs;
      m.categorias[cat] = (m.categorias[cat] || 0) + abs;
      const tipo = t.tipo_gasto || categoriaInfo(cat).tipoGasto || 'variavel_nao_obrigatorio';
      u.tipos[tipo] = (u.tipos[tipo] || 0) + abs;
    }
  }
  return porUsuario;
}

function mediaMensal(u) {
  const n = Math.max(u.meses.size, 1);
  return {
    meses: u.meses.size,
    entradas: u.entradas / n,
    saidas: u.saidas / n,
    categorias: Object.fromEntries(Object.entries(u.categorias).map(([k, v]) => [k, v / n])),
    tipos: Object.fromEntries(Object.entries(u.tipos).map(([k, v]) => [k, v / n])),
  };
}

// ---------------------------------------------------------------------
// Dicas inteligentes (Inteligência | comportamento de gastos x planos)
// ---------------------------------------------------------------------

export async function gerarDicas(userId) {
  const hoje = hojeBrasil();
  const mesAtual = mesDe(hoje);
  const de = `${somarMeses(mesAtual, -3)}-01`;
  const ate = `${somarMeses(mesAtual, 1)}-01`;

  const [transacoes, { data: objetivos }, vencimentos] = await Promise.all([
    buscarTransacoesDe([userId], de, ate),
    supabaseAdmin.from('objetivos').select('titulo, valor_alvo, valor_atual, prazo').eq('user_id', userId).eq('status', 'em_andamento'),
    proximosVencimentos(userId, { dias: 5 }).catch(() => []),
  ]);

  const atual = agregar(transacoes.filter((t) => mesDe(t.data_competencia || t.data_transacao) === mesAtual)).get(userId);
  const passadoBruto = agregar(transacoes.filter((t) => mesDe(t.data_competencia || t.data_transacao) < mesAtual)).get(userId);
  const passado = passadoBruto ? mediaMensal(passadoBruto) : null;
  const dicas = [];

  if (!passado || passado.meses === 0) {
    return [{
      tom: 'neutro',
      titulo: 'Ainda estamos conhecendo seus hábitos',
      texto: 'Com pelo menos um mês de transações (Open Finance, extrato ou lançamentos manuais) as dicas passam a comparar seu ritmo com a sua própria média.',
    }];
  }

  // 1. Contas vencendo / atrasadas
  const atrasadas = vencimentos.filter((v) => v.status === 'atrasado');
  if (atrasadas.length > 0) {
    dicas.push({
      tom: 'alerta',
      titulo: `${atrasadas.length} ${atrasadas.length === 1 ? 'conta atrasada' : 'contas atrasadas'}`,
      texto: `${atrasadas.map((a) => a.descricao).join(', ')}. Atraso gera multa e juros — priorize antes de gastos opcionais.`,
    });
  }

  // 2. Ritmo do mês atual
  const diaHoje = Number(hoje.slice(8, 10));
  if (atual && diaHoje >= 5 && passado.saidas > 0) {
    const projetado = (atual.saidas / diaHoje) * diasNoMes(mesAtual);
    const variacao = (projetado / passado.saidas - 1) * 100;
    if (variacao > 15) {
      dicas.push({
        tom: 'atencao',
        titulo: `No ritmo atual, o mês fecha com ${formatarMoeda(projetado)} em gastos`,
        texto: `${formatarPct(variacao, 0)} acima da sua média (${formatarMoeda(passado.saidas)}). Faltam ${diasNoMes(mesAtual) - diaHoje} dias para ajustar.`,
      });
    } else if (variacao < -10) {
      dicas.push({
        tom: 'positivo',
        titulo: 'Mês mais econômico que a média',
        texto: `Projeção de ${formatarMoeda(projetado)} contra média de ${formatarMoeda(passado.saidas)}. Que tal mandar a diferença para um sonho?`,
      });
    }
  }

  // 3. Categorias em alta (mês atual proporcional x média)
  if (atual && diaHoje >= 10) {
    const altas = Object.entries(atual.categorias)
      .map(([cat, v]) => {
        const projetado = (v / diaHoje) * diasNoMes(mesAtual);
        const media = passado.categorias[cat] || 0;
        return { cat, projetado, media, excesso: projetado - media };
      })
      .filter((c) => c.media > 50 && c.projetado > c.media * 1.3 && c.excesso > 80)
      .sort((a, b) => b.excesso - a.excesso);
    for (const a of altas.slice(0, 2)) {
      dicas.push({
        tom: 'atencao',
        titulo: `${a.cat} acima do normal`,
        texto: `Projeção de ${formatarMoeda(a.projetado)} no mês contra média de ${formatarMoeda(a.media)} (+${formatarPct(((a.projetado / a.media - 1) * 100), 0)}).`,
        impacto: impactoEmSonho(objetivos, passado, a.excesso),
      });
    }
  }

  // 4. Peso dos gastos opcionais
  const opcionais = (passado.tipos.variavel_nao_obrigatorio || 0) + (passado.tipos.recorrente_nao_obrigatorio || 0);
  if (passado.saidas > 0 && opcionais / passado.saidas > 0.35) {
    const corte = opcionais * 0.2;
    dicas.push({
      tom: 'atencao',
      titulo: `${formatarPct(((opcionais / passado.saidas) * 100), 0)} dos gastos são opcionais`,
      texto: `Cortar 20% deles libera ~${formatarMoeda(corte)} por mês (${formatarMoeda(corte * 12)} no ano).`,
      impacto: impactoEmSonho(objetivos, passado, corte),
    });
  }

  // 5. Assinaturas
  const assinaturas = passado.categorias.Assinaturas || 0;
  if (assinaturas > 0 && passado.entradas > 0 && assinaturas / passado.entradas > 0.04) {
    dicas.push({
      tom: 'neutro',
      titulo: `Assinaturas: ${formatarMoeda(assinaturas)} por mês`,
      texto: 'Revise serviços pouco usados — assinatura é gasto recorrente invisível que soma muito no ano.',
    });
  }

  // 6. Dívidas
  const dividas = passado.categorias['Dívidas e Empréstimos'] || 0;
  if (passado.entradas > 0 && dividas / passado.entradas > 0.15) {
    dicas.push({
      tom: 'alerta',
      titulo: `Dívidas consomem ${formatarPct(((dividas / passado.entradas) * 100), 0)} da renda`,
      texto: 'Considere renegociar ou portabilidade para juros menores, e priorize quitar as de juros mais altos (cartão rotativo e cheque especial).',
    });
  }

  // 7. Taxa de poupança
  if (passado.entradas > 0) {
    const taxa = ((passado.entradas - passado.saidas) / passado.entradas) * 100;
    if (taxa < 0) {
      dicas.push({ tom: 'alerta', titulo: 'Gastando mais do que ganha', texto: `Nos últimos meses, saídas superaram entradas em ${formatarMoeda(passado.saidas - passado.entradas)} por mês, em média.` });
    } else if (taxa < 10) {
      dicas.push({ tom: 'atencao', titulo: `Taxa de poupança de ${formatarPct(taxa, 1)}`, texto: 'O ideal é guardar ao menos 10–20% da renda. Comece automatizando um valor fixo no dia do salário.' });
    } else if (taxa >= 20) {
      dicas.push({ tom: 'positivo', titulo: `Ótimo: você guarda ${formatarPct(taxa, 1)} da renda`, texto: 'Mantenha o ritmo e direcione essa sobra para os sonhos e para a aposentadoria.' });
    }
  }

  return dicas.length > 0
    ? dicas
    : [{ tom: 'positivo', titulo: 'Tudo dentro do esperado', texto: 'Nenhum desvio relevante em relação à sua média. Continue assim!' }];
}

/** "Se você economizar X por mês, o sonho Y chega N meses antes." */
function impactoEmSonho(objetivos, passado, economiaMensal) {
  const sonho = (objetivos || [])
    .filter((o) => Number(o.valor_alvo) > Number(o.valor_atual))
    .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'))[0];
  const sobra = passado.entradas - passado.saidas;
  if (!sonho || economiaMensal <= 0) return null;
  const falta = Number(sonho.valor_alvo) - Number(sonho.valor_atual);
  if (sobra <= 0) {
    return `Essa economia sozinha realizaria "${sonho.titulo}" em ~${Math.ceil(falta / economiaMensal)} meses.`;
  }
  const antes = Math.ceil(falta / sobra);
  const depois = Math.ceil(falta / (sobra + economiaMensal));
  return antes - depois > 0 ? `"${sonho.titulo}" chegaria ~${antes - depois} ${antes - depois === 1 ? 'mês' : 'meses'} antes.` : null;
}

// ---------------------------------------------------------------------
// Retrospectiva do ano (Bônus | Ano — cinema e outras ideias)
// ---------------------------------------------------------------------

const DIVERSAO = [
  { id: 'cinema', nome: 'Idas ao cinema', icone: '🎬', re: /cinema|cinemark|kinoplex|\buci\b|cinepolis|ingresso\.com/ },
  { id: 'delivery', nome: 'Pedidos de delivery', icone: '🛵', re: /ifood|rappi|ze delivery|aiqfome|delivery/ },
  { id: 'apps_transporte', nome: 'Corridas de app', icone: '🚕', re: /\buber\b|99app|99 ?pop|cabify/ },
  { id: 'cafe', nome: 'Cafés', icone: '☕', re: /\bcafe\b|cafeteria|starbucks|coffee/ },
  { id: 'shows', nome: 'Shows e eventos', icone: '🎤', re: /sympla|eventim|ticketmaster|\bshows?\b|teatro/ },
  { id: 'viagens', nome: 'Compras de viagem', icone: '✈️', re: /latam|gol linhas|azul linhas|decolar|booking|airbnb|hotel|pousada/ },
];

export async function gerarRetrospectiva(userId, ano) {
  const [doAno, doAnoAnterior, { data: objetivos }] = await Promise.all([
    buscarTransacoesDe([userId], `${ano}-01-01`, `${ano + 1}-01-01`),
    buscarTransacoesDe([userId], `${ano - 1}-01-01`, `${ano}-01-01`),
    supabaseAdmin.from('objetivos').select('titulo, status, updated_at, valor_alvo').eq('user_id', userId),
  ]);

  const agg = agregar(doAno).get(userId);
  if (!agg) return { ano, vazio: true };
  const anterior = agregar(doAnoAnterior).get(userId);

  const meses = Object.entries(agg.porMes).map(([mes, m]) => ({ mes, ...m }));
  const maisCaro = [...meses].sort((a, b) => b.saidas - a.saidas)[0];
  const maisEconomico = [...meses].filter((m) => m.saidas > 0).sort((a, b) => a.saidas - b.saidas)[0];

  const lugares = new Map();
  const diversao = Object.fromEntries(DIVERSAO.map((d) => [d.id, { ...d, re: undefined, vezes: 0, total: 0 }]));
  const diasComGasto = new Set();
  let maiorCompra = null;

  for (const t of doAno) {
    if (ehTransferencia(t)) continue;
    const valor = getValorAjustado(t);
    if (valor >= 0) continue;
    const abs = -valor;
    const dia = t.data_competencia || t.data_transacao;
    diasComGasto.add(dia);
    const nome = (t.descricao || 'Outros').replace(/\s*\(\d+\/\d+\)$/, '').replace(/[*#].*$/, '').trim().slice(0, 40) || 'Outros';
    const chave = semAcento(nome);
    const l = lugares.get(chave) || { nome, vezes: 0, total: 0 };
    l.vezes += 1;
    l.total += abs;
    lugares.set(chave, l);
    if (!maiorCompra || abs > maiorCompra.valor) maiorCompra = { descricao: t.descricao, valor: abs, data: dia, categoria: t.categoria };
    const texto = semAcento(t.descricao);
    for (const d of DIVERSAO) {
      if (d.re.test(texto)) {
        diversao[d.id].vezes += 1;
        diversao[d.id].total += abs;
      }
    }
  }

  const fimDoPeriodo = ano === Number(hojeBrasil().slice(0, 4)) ? hojeBrasil() : `${ano}-12-31`;
  const diasNoPeriodo = Math.round((Date.parse(`${fimDoPeriodo}T00:00:00Z`) - Date.parse(`${ano}-01-01T00:00:00Z`)) / 86_400_000) + 1;
  const sonhosRealizados = (objetivos || []).filter((o) => o.status === 'concluido' && String(o.updated_at || '').startsWith(String(ano)));
  const variacaoGastos = anterior?.saidas > 0 ? ((agg.saidas / anterior.saidas) - 1) * 100 : null;

  const categorias = Object.entries(agg.categorias)
    .map(([categoria, total]) => ({ categoria, total: arred(total), icone: categoriaInfo(categoria).icone, pct: arred((total / agg.saidas) * 100) }))
    .sort((a, b) => b.total - a.total);

  return {
    ano,
    vazio: false,
    totais: {
      entradas: arred(agg.entradas),
      saidas: arred(agg.saidas),
      saldo: arred(agg.entradas - agg.saidas),
      taxaPoupanca: agg.entradas > 0 ? arred(((agg.entradas - agg.saidas) / agg.entradas) * 100) : 0,
      transacoes: doAno.length,
      mediaMensalGastos: arred(agg.saidas / Math.max(agg.meses.size, 1)),
    },
    variacaoGastosVsAnoAnterior: variacaoGastos !== null ? arred(variacaoGastos) : null,
    mesMaisCaro: maisCaro ? { mes: maisCaro.mes, total: arred(maisCaro.saidas) } : null,
    mesMaisEconomico: maisEconomico ? { mes: maisEconomico.mes, total: arred(maisEconomico.saidas) } : null,
    topCategorias: categorias.slice(0, 6),
    lugaresFavoritos: [...lugares.values()]
      .sort((a, b) => b.vezes - a.vezes || b.total - a.total)
      .slice(0, 5)
      .map((l) => ({ ...l, total: arred(l.total) })),
    maiorCompra: maiorCompra ? { ...maiorCompra, valor: arred(maiorCompra.valor) } : null,
    diversao: Object.values(diversao).filter((d) => d.vezes > 0).map((d) => ({ ...d, total: arred(d.total) })),
    diasSemGastar: Math.max(diasNoPeriodo - diasComGasto.size, 0),
    sonhosRealizados: sonhosRealizados.map((s) => s.titulo),
  };
}

// ---------------------------------------------------------------------
// Comparativos por perfil (estado, faixa etária, forma de trabalho)
// ---------------------------------------------------------------------

async function perfisClientes(ids = null) {
  let query = supabaseAdmin
    .from('profiles')
    .select('id, role, estado, data_nascimento, forma_trabalho, profissao, pais, tags, renda_mensal, codigo_cliente, nome')
    .eq('role', 'cliente');
  if (ids) query = query.in('id', ids);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function periodo(meses) {
  const mesAtual = mesDe(hojeBrasil());
  return { de: `${somarMeses(mesAtual, -meses)}-01`, ate: `${mesAtual}-01` };
}

/**
 * Compara os gastos do cliente com a média de pessoas parecidas (mesmo
 * estado, faixa etária e forma de trabalho). Só mostra um grupo quando
 * ele tem ao menos TAMANHO_MINIMO_GRUPO pessoas com dados — abaixo disso
 * daria para deduzir os gastos de alguém específico.
 */
export async function compararComPares(userId, { meses = 3 } = {}) {
  const { de, ate } = periodo(meses);
  const todos = await perfisClientes();
  const eu = todos.find((p) => p.id === userId);
  if (!eu) return { grupos: [], meu: null };

  const transacoes = await buscarTransacoesDe(todos.map((p) => p.id), de, ate);
  const porUsuario = agregar(transacoes);
  const meuAgg = porUsuario.get(userId);
  const meu = meuAgg ? mediaMensal(meuAgg) : null;

  const minhaFaixa = faixaEtaria(eu.data_nascimento);
  const criterios = [
    eu.estado && { id: 'estado', nome: `Pessoas de ${eu.estado}`, filtro: (p) => p.estado === eu.estado },
    minhaFaixa && { id: 'faixa', nome: `Pessoas de ${minhaFaixa.nome.toLowerCase()}`, filtro: (p) => faixaEtaria(p.data_nascimento)?.id === minhaFaixa.id },
    eu.forma_trabalho && { id: 'trabalho', nome: `Profissionais ${FORMAS_TRABALHO[eu.forma_trabalho] || ''}`.trim(), filtro: (p) => p.forma_trabalho === eu.forma_trabalho },
    { id: 'todos', nome: 'Todos os clientes Oule', filtro: () => true },
  ].filter(Boolean);

  const grupos = criterios.map((c) => {
    const membros = todos.filter((p) => p.id !== userId && c.filtro(p) && porUsuario.get(p.id)?.saidas > 0);
    if (membros.length < TAMANHO_MINIMO_GRUPO) {
      return { id: c.id, nome: c.nome, pessoas: membros.length, suficiente: false };
    }
    const medias = membros.map((m) => mediaMensal(porUsuario.get(m.id)));
    const n = medias.length;
    const categorias = {};
    for (const m of medias) for (const [cat, v] of Object.entries(m.categorias)) categorias[cat] = (categorias[cat] || 0) + v / n;
    const gastoMedio = medias.reduce((s, m) => s + m.saidas, 0) / n;
    const rendaMedia = medias.reduce((s, m) => s + m.entradas, 0) / n;
    return {
      id: c.id,
      nome: c.nome,
      pessoas: n,
      suficiente: true,
      gastoMensalMedio: arred(gastoMedio),
      taxaPoupancaMedia: rendaMedia > 0 ? arred(((rendaMedia - gastoMedio) / rendaMedia) * 100) : null,
      categorias: Object.entries(categorias)
        .map(([categoria, media]) => ({
          categoria,
          media: arred(media),
          pctDosGastos: arred((media / gastoMedio) * 100),
          meu: arred(meu?.categorias[categoria] || 0),
          meuPct: meu?.saidas > 0 ? arred(((meu.categorias[categoria] || 0) / meu.saidas) * 100) : 0,
        }))
        .sort((a, b) => b.media - a.media),
    };
  });

  return {
    meses,
    tamanhoMinimoGrupo: TAMANHO_MINIMO_GRUPO,
    meu: meu
      ? {
          gastoMensal: arred(meu.saidas),
          rendaMensal: arred(meu.entradas),
          taxaPoupanca: meu.entradas > 0 ? arred(((meu.entradas - meu.saidas) / meu.entradas) * 100) : null,
          porTipoGasto: Object.fromEntries(Object.entries(meu.tipos).map(([k, v]) => [k, arred(v)])),
        }
      : null,
    grupos,
  };
}

/**
 * Visão da equipe: gastos por categoria cruzados por estado, faixa
 * etária e forma de trabalho, só com os clientes visíveis para quem
 * pede (planejador: os dele; oule: todos).
 */
export async function analisarSegmentos(idsVisiveis, { meses = 3, filtros = {} } = {}) {
  const { de, ate } = periodo(meses);
  let clientes = await perfisClientes(idsVisiveis);
  if (filtros.estado) clientes = clientes.filter((c) => c.estado === filtros.estado);
  if (filtros.faixa) clientes = clientes.filter((c) => faixaEtaria(c.data_nascimento)?.id === filtros.faixa);
  if (filtros.formaTrabalho) clientes = clientes.filter((c) => c.forma_trabalho === filtros.formaTrabalho);
  if (filtros.tag) clientes = clientes.filter((c) => (c.tags || []).some((t) => semAcento(t) === semAcento(filtros.tag)));

  const transacoes = await buscarTransacoesDe(clientes.map((c) => c.id), de, ate);
  const porUsuario = agregar(transacoes);

  const dimensoes = {
    estado: (c) => c.estado || 'Não informado',
    faixaEtaria: (c) => faixaEtaria(c.data_nascimento)?.nome || 'Não informado',
    formaTrabalho: (c) => FORMAS_TRABALHO[c.forma_trabalho] || 'Não informado',
  };

  const resultado = {};
  for (const [dim, chaveDe] of Object.entries(dimensoes)) {
    const grupos = new Map();
    for (const c of clientes) {
      const agg = porUsuario.get(c.id);
      if (!agg) continue;
      const m = mediaMensal(agg);
      const k = chaveDe(c);
      const g = grupos.get(k) || { grupo: k, clientes: 0, renda: 0, gasto: 0, categorias: {} };
      g.clientes += 1;
      g.renda += m.entradas;
      g.gasto += m.saidas;
      for (const [cat, v] of Object.entries(m.categorias)) g.categorias[cat] = (g.categorias[cat] || 0) + v;
      grupos.set(k, g);
    }
    resultado[dim] = [...grupos.values()]
      .map((g) => ({
        grupo: g.grupo,
        clientes: g.clientes,
        rendaMensalMedia: arred(g.renda / g.clientes),
        gastoMensalMedio: arred(g.gasto / g.clientes),
        taxaPoupanca: g.renda > 0 ? arred(((g.renda - g.gasto) / g.renda) * 100) : null,
        topCategorias: Object.entries(g.categorias)
          .map(([categoria, v]) => ({ categoria, media: arred(v / g.clientes), pct: arred((v / g.gasto) * 100) }))
          .sort((a, b) => b.media - a.media)
          .slice(0, 5),
      }))
      .sort((a, b) => b.clientes - a.clientes);
  }

  // Gasto por categoria do conjunto filtrado
  const totalCat = {};
  let totalGasto = 0;
  let comDados = 0;
  for (const c of clientes) {
    const agg = porUsuario.get(c.id);
    if (!agg) continue;
    comDados += 1;
    const m = mediaMensal(agg);
    totalGasto += m.saidas;
    for (const [cat, v] of Object.entries(m.categorias)) totalCat[cat] = (totalCat[cat] || 0) + v;
  }

  const porTipo = {};
  for (const agg of porUsuario.values()) {
    const m = mediaMensal(agg);
    for (const [tipo, v] of Object.entries(m.tipos)) porTipo[tipo] = (porTipo[tipo] || 0) + v;
  }

  return {
    meses,
    clientesNoFiltro: clientes.length,
    clientesComDados: comDados,
    categorias: Object.entries(totalCat)
      .map(([categoria, v]) => ({ categoria, mediaPorCliente: arred(v / Math.max(comDados, 1)), pct: arred((v / Math.max(totalGasto, 1)) * 100) }))
      .sort((a, b) => b.mediaPorCliente - a.mediaPorCliente),
    porTipoGasto: Object.entries(porTipo).map(([tipo, v]) => ({
      tipo,
      nome: TIPOS_GASTO[tipo]?.nome || tipo,
      mediaPorCliente: arred(v / Math.max(comDados, 1)),
    })),
    ...resultado,
  };
}
