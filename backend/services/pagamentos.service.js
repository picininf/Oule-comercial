import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { dataNoMes, diferencaEmDias, hojeBrasil, mesDe, somarMeses } from '../utils/financeUtils.js';

export function pagamentoParaApi(p) {
  return {
    id: p.id,
    userId: p.user_id,
    descricao: p.descricao,
    categoria: p.categoria,
    tipoGasto: p.tipo_gasto,
    valor: Number(p.valor),
    diaVencimento: p.dia_vencimento,
    formaPagamento: p.forma_pagamento,
    cartaoId: p.cartao_id,
    inicioMes: p.inicio_mes,
    fimMes: p.fim_mes,
    lembrar: p.lembrar,
    ativo: p.ativo,
    observacao: p.observacao,
  };
}

export function vigenteNoMes(p, mes) {
  if (!p.ativo) return false;
  // Sem mês inicial informado, a conta vale a partir do mês em que foi
  // cadastrada — senão uma conta criada hoje apareceria como "atrasada"
  // em meses em que ela nem existia no app.
  const inicio = p.inicio_mes || (p.created_at ? mesDe(String(p.created_at)) : null);
  if (inicio && mes < inicio) return false;
  if (p.fim_mes && mes > p.fim_mes) return false;
  return true;
}

/**
 * Situação de uma conta num mês: pago | atrasado | vence_hoje |
 * vence_em_breve (dentro da antecedência configurada) | pendente.
 */
export function situacaoNoMes(p, mes, pagamentoMensal, { hoje = hojeBrasil(), antecedencia = 3 } = {}) {
  const vencimento = dataNoMes(mes, p.dia_vencimento);
  const dias = diferencaEmDias(hoje, vencimento);
  let status;
  if (pagamentoMensal) status = 'pago';
  else if (dias < 0) status = 'atrasado';
  else if (dias === 0) status = 'vence_hoje';
  else if (dias <= antecedencia) status = 'vence_em_breve';
  else status = 'pendente';

  return {
    ...pagamentoParaApi(p),
    mes,
    vencimento,
    diasParaVencer: dias,
    status,
    pago: pagamentoMensal
      ? {
          valorPago: pagamentoMensal.valor_pago !== null ? Number(pagamentoMensal.valor_pago) : Number(p.valor),
          pagoEm: pagamentoMensal.pago_em,
          transacaoId: pagamentoMensal.transacao_id,
        }
      : null,
  };
}

/** Contas de um usuário num mês, com a situação de cada uma. */
export async function contasDoMes(userId, mes, opcoes = {}) {
  const [{ data: recorrentes, error: e1 }, { data: pagos, error: e2 }] = await Promise.all([
    supabaseAdmin.from('pagamentos_recorrentes').select('*').eq('user_id', userId).order('dia_vencimento'),
    supabaseAdmin.from('pagamentos_mensais').select('*').eq('user_id', userId).eq('mes', mes),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const pagoPorId = new Map((pagos || []).map((pm) => [pm.pagamento_id, pm]));
  return (recorrentes || [])
    .filter((p) => vigenteNoMes(p, mes))
    .map((p) => situacaoNoMes(p, mes, pagoPorId.get(p.id), opcoes));
}

/**
 * Próximos vencimentos (e atrasos) considerando o mês anterior, o atual
 * e o seguinte — usado no aviso do painel e no robô de lembretes.
 */
export async function proximosVencimentos(userId, { dias = 7, antecedencia = 3 } = {}) {
  const hoje = hojeBrasil();
  const mesAtual = mesDe(hoje);
  const meses = [somarMeses(mesAtual, -1), mesAtual, somarMeses(mesAtual, 1)];
  const listas = await Promise.all(meses.map((m) => contasDoMes(userId, m, { hoje, antecedencia })));
  return listas
    .flat()
    .filter((c) => c.status !== 'pago' && c.diasParaVencer <= dias && c.diasParaVencer >= -31)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}
