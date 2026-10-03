import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { hojeBrasil, idadeEmAnos, formatarMoeda, formatarPct } from '../utils/financeUtils.js';
import { mediaHistorica, premissasParaApi } from './plano.service.js';

/**
 * Visão de futuro (próximos anos) + Sonhos x Vida Real x Plano +
 * Aposentadoria / Liberdade Financeira.
 *
 * Todas as contas são em valores REAIS (de hoje): a rentabilidade usada
 * é a real (acima da inflação), então R$ 1.000 daqui a 10 anos significa
 * o poder de compra de R$ 1.000 hoje. É a forma mais honesta de mostrar
 * futuro para quem não é do mercado financeiro.
 */

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;

export const APOSENTADORIA_PADRAO = {
  idadeAposentadoria: 60,
  rendaDesejada: 0,
  patrimonioAtual: 0,
  aporteMensal: 0,
  rentabilidadeRealAnual: 4,
  taxaRetiradaAnual: 4,
  outrasRendas: 0,
};

export function aposentadoriaParaApi(a) {
  if (!a) return { ...APOSENTADORIA_PADRAO, configurado: false };
  return {
    idadeAposentadoria: a.idade_aposentadoria,
    rendaDesejada: Number(a.renda_desejada),
    patrimonioAtual: Number(a.patrimonio_atual),
    aporteMensal: Number(a.aporte_mensal),
    rentabilidadeRealAnual: Number(a.rentabilidade_real_anual),
    taxaRetiradaAnual: Number(a.taxa_retirada_anual),
    outrasRendas: Number(a.outras_rendas),
    configurado: true,
    atualizadoEm: a.updated_at,
  };
}

function taxaMensal(anualPct) {
  return (1 + anualPct / 100) ** (1 / 12) - 1;
}

/** Valor futuro de um patrimônio com aportes mensais (juros compostos). */
function valorFuturo({ presente, aporte, taxaMes, meses }) {
  if (meses <= 0) return presente;
  if (Math.abs(taxaMes) < 1e-9) return presente + aporte * meses;
  const fator = (1 + taxaMes) ** meses;
  return presente * fator + aporte * ((fator - 1) / taxaMes);
}

/** Aporte mensal necessário para sair de `presente` e chegar a `alvo` em `meses`. */
function aporteNecessario({ presente, alvo, taxaMes, meses }) {
  if (meses <= 0) return Math.max(alvo - presente, 0);
  const fator = (1 + taxaMes) ** meses;
  const falta = alvo - presente * fator;
  if (falta <= 0) return 0;
  return Math.abs(taxaMes) < 1e-9 ? falta / meses : (falta * taxaMes) / (fator - 1);
}

/**
 * Calcula o plano de aposentadoria / liberdade financeira (LF).
 * LF = patrimônio que, rendendo, paga a renda desejada para sempre
 *      (regra da taxa de retirada segura, padrão 4% ao ano).
 */
export function calcularAposentadoria(ap, idadeAtual) {
  const taxaMes = taxaMensal(ap.rentabilidadeRealAnual);
  const rendaAFinanciar = Math.max(ap.rendaDesejada - ap.outrasRendas, 0);
  const patrimonioNecessario = rendaAFinanciar > 0 ? (rendaAFinanciar * 12) / (ap.taxaRetiradaAnual / 100) : 0;

  if (idadeAtual === null) {
    return { patrimonioNecessario: arred(patrimonioNecessario), precisaDataNascimento: true };
  }

  const anosAte = Math.max(ap.idadeAposentadoria - idadeAtual, 0);
  const meses = anosAte * 12;
  const patrimonioNaAposentadoria = valorFuturo({ presente: ap.patrimonioAtual, aporte: ap.aporteMensal, taxaMes, meses });
  const aporteIdeal = aporteNecessario({ presente: ap.patrimonioAtual, alvo: patrimonioNecessario, taxaMes, meses });

  // Com o aporte atual, em que idade a pessoa atinge a LF?
  let idadeLF = null;
  if (patrimonioNecessario > 0) {
    let saldo = ap.patrimonioAtual;
    for (let m = 0; m <= 12 * 70; m++) {
      if (saldo >= patrimonioNecessario) { idadeLF = arred(idadeAtual + m / 12); break; }
      saldo = saldo * (1 + taxaMes) + ap.aporteMensal;
    }
  }

  const rendaPossivel = (patrimonioNaAposentadoria * (ap.taxaRetiradaAnual / 100)) / 12 + ap.outrasRendas;
  const progresso = patrimonioNecessario > 0 ? Math.min((ap.patrimonioAtual / patrimonioNecessario) * 100, 100) : 0;

  // Curva ano a ano até a aposentadoria (para o gráfico).
  const curva = [];
  for (let ano = 0; ano <= anosAte; ano++) {
    curva.push({
      idade: idadeAtual + ano,
      patrimonio: arred(valorFuturo({ presente: ap.patrimonioAtual, aporte: ap.aporteMensal, taxaMes, meses: ano * 12 })),
      necessario: arred(patrimonioNecessario),
    });
  }

  return {
    idadeAtual,
    anosAteAposentadoria: anosAte,
    patrimonioNecessario: arred(patrimonioNecessario),
    patrimonioNaAposentadoria: arred(patrimonioNaAposentadoria),
    diferenca: arred(patrimonioNaAposentadoria - patrimonioNecessario),
    aporteMensalNecessario: arred(aporteIdeal),
    rendaMensalPossivel: arred(rendaPossivel),
    idadeLiberdadeFinanceira: idadeLF,
    progressoPct: arred(progresso),
    noCaminho: patrimonioNaAposentadoria >= patrimonioNecessario,
    curva,
  };
}

/**
 * Projeção ano a ano (padrão 10 anos) a partir do ritmo real recente,
 * com reajuste de renda e inflação das premissas, e o caminho de cada
 * sonho em andamento.
 */
export async function projetarFuturo(userId, { anos = 10, aporteExtra = 0, cortePct = 0 } = {}) {
  const hoje = hojeBrasil();
  const anoAtual = Number(hoje.slice(0, 4));

  const [historico, { data: perfil }, { data: apLinha }, { data: premLinha }, { data: objetivos, error }] = await Promise.all([
    mediaHistorica(userId, { meses: 6 }),
    supabaseAdmin.from('profiles').select('data_nascimento, renda_mensal').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('aposentadoria_planos').select('*').eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('plano_premissas').select('*').eq('user_id', userId).eq('ano', anoAtual).maybeSingle(),
    supabaseAdmin.from('objetivos').select('id, titulo, valor_alvo, valor_atual, prazo, status, categoria').eq('user_id', userId).eq('status', 'em_andamento'),
  ]);
  if (error) throw error;

  const premissas = premissasParaApi(premLinha);
  const ap = aposentadoriaParaApi(apLinha);
  const idade = idadeEmAnos(perfil?.data_nascimento);

  const rendaMensal = historico.entradas || Number(perfil?.renda_mensal) || 0;
  // Simulador "e se?": corte de gastos (%) e aporte extra mensal.
  const gastoMensal = historico.saidas * (1 - cortePct / 100);
  const rentabilidade = ap.configurado ? ap.rentabilidadeRealAnual : 4;
  const taxaMes = taxaMensal(rentabilidade);
  // Reajuste de renda e inflação: só o ganho REAL (acima da inflação)
  // aumenta o poder de compra.
  const ganhoRealRenda = (1 + premissas.reajusteRendaAnual / 100) / (1 + premissas.inflacaoAnual / 100) - 1;

  let patrimonio = ap.configurado ? ap.patrimonioAtual : premissas.patrimonioInicial || 0;
  const linhaDoTempo = [];
  const metas = (objetivos || [])
    .map((o) => ({
      id: o.id,
      titulo: o.titulo,
      categoria: o.categoria,
      prazo: o.prazo,
      alvo: Number(o.valor_alvo),
      atual: Number(o.valor_atual),
    }))
    .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));

  // Sonhos: a sobra de cada mês vai enchendo os sonhos em ordem de prazo
  // (o mais urgente primeiro). Registramos o mês em que cada um é atingido.
  const fila = metas.map((m) => ({ ...m, acumulado: m.atual, atingidoEm: m.atual >= m.alvo ? hoje.slice(0, 7) : null }));
  let renda = rendaMensal;
  const mesInicial = Number(hoje.slice(5, 7));

  for (let a = 0; a < anos; a++) {
    const ano = anoAtual + a;
    let entradasAno = 0;
    let saidasAno = 0;
    let aporteAno = 0;
    const mesesNoAno = a === 0 ? 12 - mesInicial + 1 : 12;

    for (let i = 0; i < mesesNoAno; i++) {
      const mesNum = a === 0 ? mesInicial + i : i + 1;
      const chave = `${ano}-${String(mesNum).padStart(2, '0')}`;
      const sobra = renda - gastoMensal + aporteExtra;
      entradasAno += renda;
      saidasAno += gastoMensal;
      aporteAno += sobra;

      let restante = Math.max(sobra, 0);
      for (const meta of fila) {
        if (meta.atingidoEm || restante <= 0) continue;
        const usa = Math.min(meta.alvo - meta.acumulado, restante);
        meta.acumulado += usa;
        restante -= usa;
        if (meta.acumulado >= meta.alvo - 0.01) meta.atingidoEm = chave;
      }
      patrimonio = patrimonio * (1 + taxaMes) + sobra;
    }

    linhaDoTempo.push({
      ano,
      idade: idade !== null ? idade + a : null,
      rendaMensal: arred(renda),
      gastoMensal: arred(gastoMensal),
      entradas: arred(entradasAno),
      saidas: arred(saidasAno),
      aporte: arred(aporteAno),
      patrimonio: arred(patrimonio),
    });
    renda *= 1 + ganhoRealRenda;
  }

  const sonhos = fila.map((m) => {
    const noPrazo = m.prazo ? Boolean(m.atingidoEm && m.atingidoEm <= m.prazo.slice(0, 7)) : Boolean(m.atingidoEm);
    let atrasoMeses = null;
    if (m.prazo && m.atingidoEm && !noPrazo) {
      const [ap1, mp1] = m.atingidoEm.split('-').map(Number);
      const [ap2, mp2] = m.prazo.slice(0, 7).split('-').map(Number);
      atrasoMeses = (ap1 - ap2) * 12 + (mp1 - mp2);
    }
    return {
      id: m.id,
      titulo: m.titulo,
      categoria: m.categoria,
      prazo: m.prazo,
      valorAlvo: m.alvo,
      valorAtual: m.atual,
      atingidoEm: m.atingidoEm,
      noPrazo,
      atrasoMeses,
      situacao: !m.atingidoEm ? 'fora_do_horizonte' : noPrazo ? 'no_prazo' : 'atrasado',
    };
  });

  const sobraMensal = rendaMensal - gastoMensal + aporteExtra;
  const aposentadoria = ap.configurado ? calcularAposentadoria(ap, idade) : null;

  return {
    base: {
      mesesHistorico: historico.mesesConsiderados,
      rendaMensal: arred(rendaMensal),
      gastoMensal: arred(gastoMensal),
      sobraMensal: arred(sobraMensal),
      taxaPoupanca: rendaMensal > 0 ? arred((sobraMensal / rendaMensal) * 100) : 0,
      rentabilidadeRealAnual: rentabilidade,
      ganhoRealRendaAnualPct: arred(ganhoRealRenda * 100),
      patrimonioInicial: arred(ap.configurado ? ap.patrimonioAtual : premissas.patrimonioInicial || 0),
      cortePct,
      aporteExtra,
      idade,
    },
    linhaDoTempo,
    sonhos,
    aposentadoria,
    aposentadoriaConfig: ap,
    conclusoes: conclusoesFuturo({ sobraMensal, rendaMensal, sonhos, aposentadoria, linhaDoTempo, historico }),
  };
}

function conclusoesFuturo({ sobraMensal, rendaMensal, sonhos, aposentadoria, linhaDoTempo, historico }) {
  const c = [];
  if (historico.mesesConsiderados === 0) {
    c.push({ tom: 'neutro', titulo: 'Sem histórico suficiente', texto: 'Conecte o banco, importe um extrato ou lance transações para que a projeção use o seu ritmo real.' });
    return c;
  }

  if (sobraMensal < 0) {
    c.push({
      tom: 'alerta',
      titulo: `No ritmo atual faltam ${formatarMoeda(-sobraMensal)} por mês`,
      texto: 'Os gastos dos últimos meses superam a renda. Antes de qualquer sonho, o primeiro passo é equilibrar o mês (veja as Dicas na Visão Geral).',
    });
  } else {
    const ultimo = linhaDoTempo[linhaDoTempo.length - 1];
    c.push({
      tom: 'positivo',
      titulo: `Mantendo o ritmo, em ${ultimo.ano} o patrimônio chega a ${formatarMoeda(ultimo.patrimonio)}`,
      texto: `Sobra média de ${formatarMoeda(sobraMensal)} por mês (${formatarPct(((sobraMensal / Math.max(rendaMensal, 1)) * 100), 1)} da renda), investida com rentabilidade real.`,
    });
  }

  const atrasados = sonhos.filter((s) => s.situacao === 'atrasado');
  const fora = sonhos.filter((s) => s.situacao === 'fora_do_horizonte');
  if (atrasados.length > 0) {
    c.push({
      tom: 'atencao',
      titulo: `${atrasados.length} ${atrasados.length === 1 ? 'sonho atrasa' : 'sonhos atrasam'} em relação ao prazo`,
      texto: atrasados.map((s) => `${s.titulo}: ~${s.atrasoMeses} ${s.atrasoMeses === 1 ? 'mês' : 'meses'} depois do previsto`).join('; ') + '. Aumente o aporte, reduza gastos variáveis opcionais ou revise o prazo.',
    });
  }
  if (fora.length > 0) {
    c.push({ tom: 'alerta', titulo: 'Sonhos fora do alcance no horizonte simulado', texto: fora.map((s) => s.titulo).join(', ') + '.' });
  }

  if (aposentadoria && !aposentadoria.precisaDataNascimento) {
    c.push(aposentadoria.noCaminho
      ? {
          tom: 'positivo',
          titulo: 'Aposentadoria no caminho certo',
          texto: `Com o aporte atual, a liberdade financeira chega por volta dos ${Math.floor(aposentadoria.idadeLiberdadeFinanceira)} anos.`,
        }
      : {
          tom: 'atencao',
          titulo: `Para aposentar no plano, o aporte ideal é ${formatarMoeda(aposentadoria.aporteMensalNecessario)}/mês`,
          texto: `Mantido o aporte atual, a renda possível na aposentadoria é ${formatarMoeda(aposentadoria.rendaMensalPossivel)}/mês` +
            (aposentadoria.idadeLiberdadeFinanceira ? ` e a liberdade financeira viria aos ${Math.floor(aposentadoria.idadeLiberdadeFinanceira)} anos.` : '.'),
        });
  } else if (aposentadoria?.precisaDataNascimento) {
    c.push({ tom: 'neutro', titulo: 'Informe a data de nascimento', texto: 'Sem ela não dá para calcular quantos anos faltam para a aposentadoria (aba Meu Cadastro).' });
  }
  return c;
}
