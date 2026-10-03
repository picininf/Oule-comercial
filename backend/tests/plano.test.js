/**
 * Plano x Vida Real com banco em memória: confere realizado, regime de
 * caixa x competência, parcelas comprometidas, plano de ano futuro e
 * conclusões.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { criarSupabaseFalso } from './supabaseFalso.js';
import { hojeBrasil, somarMeses, mesDe } from '../utils/financeUtils.js';

const U = 'usuario-1';
const mesAtual = mesDe(hojeBrasil());
const anoAtual = Number(mesAtual.slice(0, 4));
const passados = [1, 2, 3].map((n) => somarMeses(mesAtual, -n));

const transacoes = [];
for (const mes of passados) {
  const d = `${mes}-05`;
  const base = { user_id: U, origem: 'lancamento', data_transacao: d, data_competencia: d, data_caixa: d, cartao_id: null };
  transacoes.push({ ...base, valor: 5000, categoria: 'Salário', descricao: 'Salário' });
  transacoes.push({ ...base, valor: -1500, categoria: 'Alimentação', descricao: 'Mercado' });
  transacoes.push({ ...base, valor: -2000, categoria: 'Moradia', descricao: 'Aluguel' });
  // Transferência entre contas próprias: não pode contar como gasto.
  transacoes.push({ ...base, valor: -1000, categoria: 'Transferências', descricao: 'Para poupança' });
}
// Compra de R$ 600 em 3x feita no mês atual: cada parcela vence num mês seguinte.
for (let p = 1; p <= 3; p++) {
  transacoes.push({
    user_id: U, origem: 'lancamento', valor: -200, categoria: 'Compras', descricao: `TV (${p}/3)`,
    data_transacao: `${mesAtual}-02`, data_competencia: `${mesAtual}-02`, data_caixa: `${somarMeses(mesAtual, p)}-05`,
    cartao_id: 'cartao-1', parcelas_total: 3,
  });
}

const proximoAno = anoAtual + 1;
const plano = [];
for (let m = 1; m <= 12; m++) {
  const mes = `${proximoAno}-${String(m).padStart(2, '0')}`;
  plano.push({ user_id: U, mes, categoria: 'Salário', valor_planejado: 5500 });
  plano.push({ user_id: U, mes, categoria: 'Alimentação', valor_planejado: 800 });
  plano.push({ user_id: U, mes, categoria: 'Moradia', valor_planejado: 2000 });
}

const banco = criarSupabaseFalso({
  transacoes,
  plano_mensal: plano,
  plano_premissas: [],
  pagamentos_recorrentes: [{ id: 'p1', user_id: U, descricao: 'Aluguel', categoria: 'Moradia', valor: 2000, dia_vencimento: 10, ativo: true, inicio_mes: null, fim_mes: null }],
  objetivos: [{ id: 'o1', user_id: U, titulo: 'Viagem', valor_alvo: 10000, valor_atual: 0, prazo: `${somarMeses(mesAtual, 6)}-28`, status: 'em_andamento' }],
  profiles: [{ id: U, renda_mensal: 5000 }],
});

mock.module('../config/supabaseAdmin.js', { namedExports: { supabaseAdmin: banco } });
const { montarPainel, mediaHistorica } = await import('../services/plano.service.js');

test('média histórica ignora transferências', async () => {
  const h = await mediaHistorica(U, { meses: 3 });
  assert.equal(h.mesesConsiderados, 3);
  assert.equal(h.entradas, 5000);
  assert.equal(h.saidas, 3500);
});

test('ano atual: realizado nos meses passados', async () => {
  const p = await montarPainel(U, { ano: anoAtual, regime: 'competencia' });
  const mes = p.meses.find((m) => m.mes === passados[0]);
  if (mes) {
    assert.equal(mes.estado, 'realizado');
    assert.equal(mes.entradas, 5000);
    assert.equal(mes.saidas, 3500);
  }
});

test('regime de caixa: parcelas comprometidas nos meses das faturas', async () => {
  const caixa = await montarPainel(U, { ano: anoAtual, regime: 'caixa' });
  const proximo = caixa.meses.find((m) => m.mes === somarMeses(mesAtual, 1));
  if (proximo) {
    assert.equal(proximo.comprometidoParcelas, 200);
    // Conta fixa de aluguel também aparece como comprometida.
    assert.equal(proximo.comprometidoContasFixas, 2000);
  }
  // Na competência, a compra inteira pesa no mês em que foi feita.
  const comp = await montarPainel(U, { ano: anoAtual, regime: 'competencia' });
  const atual = comp.meses.find((m) => m.mes === mesAtual);
  assert.equal(atual.saidas, 600);
  // Há compra no cartão paga em outro mês: os regimes diferem.
  assert.equal(comp.regimesIguais, false);
  // Ano futuro sem lançamentos: competência = caixa (a tela avisa).
  assert.equal((await montarPainel(U, { ano: proximoAno + 1, regime: 'caixa' })).regimesIguais, true);
});

test('ano futuro: usa o plano e aponta plano otimista', async () => {
  const p = await montarPainel(U, { ano: proximoAno, regime: 'competencia' });
  const jan = p.meses[0];
  assert.equal(jan.estado, 'futuro');
  assert.equal(jan.fontePrevisao, 'plano');
  assert.equal(jan.previstoEntradas, 5500);
  assert.equal(jan.previstoSaidas, 2800);
  assert.equal(p.resumo.saldoPrevisto, 2700 * 12);

  const titulos = p.conclusoes.map((c) => c.titulo);
  assert.ok(titulos.some((t) => t.includes('otimista')), `esperava alerta de plano otimista em: ${titulos.join(' | ')}`);
  const otimista = p.conclusoes.find((c) => c.titulo.includes('otimista'));
  assert.match(otimista.texto, /Alimentação/);
});
