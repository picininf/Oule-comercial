/**
 * Entradas de dinheiro (Pix recebido, salário...) não podem sumir:
 * categoria de transferência só para a própria pessoa, sinal certo em
 * planilha/IA e "Meta do mês" com o banco em memória.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { criarSupabaseFalso } from './supabaseFalso.js';
import { hojeBrasil, somarMeses, mesDe } from '../utils/financeUtils.js';
import { normalizarCategoria, revisarTransferencia, categoriaDaEntrada } from '../utils/categorias.js';
import { lerPlanilha } from '../services/planilha.service.js';
import { extratoRespostaSchema } from '../validators/extrato.schema.js';
import { comprovanteSchema } from '../validators/schemas.js';

test('Pix recebido de outra pessoa marcado como Transferências volta a ser entrada', () => {
  const revisar = (cat, descricao, valor, extra = {}) => revisarTransferencia(cat, { descricao, valor, ...extra });
  assert.equal(revisar('Transferências', 'Transferência recebida pelo Pix - EMPRESA XYZ LTDA', 3000), 'Renda Extra');
  assert.equal(revisar('Transferências', 'Transferência enviada pelo Pix - Pedro', -30), 'Outros');
  // Da própria pessoa / pagamento de fatura: continua Transferências.
  assert.equal(revisar('Transferências', 'Pix recebido - MARIA DA SILVA', 300, { nomeCliente: 'Maria da Silva' }), 'Transferências');
  assert.equal(revisar('Transferências', 'Pagamento de fatura', -900), 'Transferências');
  assert.equal(revisar('Transferências', 'Pix', 500, { categoriaOriginal: 'Same person transfer - PIX' }), 'Transferências');
  assert.equal(revisar('Transferências', 'Pagamento recebido', 500, { ehCartao: true }), 'Transferências');
  // "Pagamento recebido" numa conta (Mercado Pago, PicPay) é dinheiro entrando.
  assert.equal(revisar(normalizarCategoria(null, 'Pagamento recebido', 500), 'Pagamento recebido', 500), 'Renda Extra');
});

test('entrada nunca fica numa categoria de despesa', () => {
  assert.equal(normalizarCategoria('Educação', 'Pix recebido - Escola ABC', 2000), 'Renda Extra');
  assert.equal(normalizarCategoria(null, 'Recebimento de cliente Uber', 80), 'Renda Extra');
  assert.equal(categoriaDaEntrada('Compras', 'Estorno Amazon', 50), 'Reembolsos');
  assert.equal(categoriaDaEntrada('Investimentos', 'Resgate CDB', 50), 'Investimentos');
  // saídas não mudam
  assert.equal(normalizarCategoria('Educação', 'Mensalidade escola', -900), 'Educação');
});

test('planilha com valor sem sinal + coluna D/C ou colunas Valor Débito/Crédito', () => {
  const caixa = 'Data Mov.;Nr. Doc.;Histórico;Valor;Deb/Cred\n01/10/2026;1;PIX RECEBIDO JOAO;1.500,00;C\n02/10/2026;2;COMPRA MERCADO;50,00;D\n';
  assert.deepEqual(lerPlanilha(Buffer.from(caixa), 'x.csv').transacoes.map((t) => t.valor), [1500, -50]);
  const debCred = 'Data;Descrição;Valor Débito;Valor Crédito\n01/10/2026;Salário;;3000,00\n02/10/2026;Padaria;12,50;\n';
  assert.deepEqual(lerPlanilha(Buffer.from(debCred), 'x.csv').transacoes.map((t) => t.valor), [3000, -12.5]);
  const bb = '"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"\n"01/10/2026","Pix - Recebido","Fulano","1","150,00","Entrada"\n"02/10/2026","Pix - Enviado","Ciclano","2","30,00","Saída"\n';
  assert.deepEqual(lerPlanilha(Buffer.from(bb), 'x.csv').transacoes.map((t) => t.valor), [150, -30]);
});

test('extrato lido pela IA: o "tipo" manda no sinal', () => {
  const { transacoes } = extratoRespostaSchema.parse({
    transacoes: [
      { data: '2026-10-01', descricao: 'Pix recebido - Cliente', valor: 500, tipo: 'entrada', categoria: 'Transferências' },
      { data: '2026-10-02', descricao: 'Mercado', valor: 80, tipo: 'saida', categoria: 'Alimentação' },
    ],
  });
  assert.deepEqual(transacoes.map((t) => t.valor), [500, -80]);
});

test('comprovante do WhatsApp com Pix recebido é entrada', () => {
  const c = comprovanteSchema.parse({ estabelecimento: 'Fulano', valor: 250, data: '2026-10-01', categoria: 'Outros', direcao: 'entrada' });
  assert.equal(c.direcao, 'entrada');
  assert.equal(c.categoria, 'Renda Extra');
  const semDirecao = comprovanteSchema.parse({ estabelecimento: 'Padaria', valor: 20, data: '2026-10-01', categoria: 'Alimentação' });
  assert.equal(semDirecao.direcao, 'saida');
});

// ---------------------------------------------------------------------
// Meta do mês
// ---------------------------------------------------------------------
const U = 'usuario-meta';
const mesAtual = mesDe(hojeBrasil());
const passados = [1, 2, 3].map((n) => somarMeses(mesAtual, -n));
const linha = (mes, dia, valor, categoria) => {
  const d = `${mes}-${String(dia).padStart(2, '0')}`;
  return { user_id: U, origem: 'lancamento', valor, categoria, descricao: categoria, data_transacao: d, data_competencia: d, data_caixa: d };
};
const transacoes = [];
for (const mes of passados) {
  transacoes.push(linha(mes, 5, 4000, 'Salário'), linha(mes, 6, -1000, 'Alimentação'), linha(mes, 7, -1500, 'Moradia'));
}
transacoes.push(linha(mesAtual, 1, 4000, 'Salário'));
transacoes.push(linha(mesAtual, 1, -700, 'Alimentação'));
// Pix recebido que ficou em Transferências não conta como renda.
transacoes.push({ ...linha(mesAtual, 1, 999, 'Transferências'), descricao: 'Para mim' });

const banco = criarSupabaseFalso({
  transacoes,
  plano_mensal: [
    { user_id: U, mes: mesAtual, categoria: 'Alimentação', valor_planejado: 600 },
    { user_id: U, mes: mesAtual, categoria: 'Moradia', valor_planejado: 1500 },
  ],
  plano_premissas: [],
  pagamentos_recorrentes: [{ id: 'p1', user_id: U, descricao: 'Aluguel', categoria: 'Moradia', valor: 1500, dia_vencimento: 28, ativo: true, inicio_mes: null, fim_mes: null }],
  pagamentos_mensais: [],
  objetivos: [],
  profiles: [{ id: U }],
});
mock.module('../config/supabaseAdmin.js', { namedExports: { supabaseAdmin: banco } });
const { metaDoMes } = await import('../services/plano.service.js');

test('meta do mês: gastos x plano, contas a pagar e meta de guardar', async () => {
  const m = await metaDoMes(U, mesAtual);
  assert.equal(m.estado, 'em_andamento');
  assert.equal(m.entradas, 4000);
  assert.equal(m.saidas, 700);
  assert.equal(m.metaGastos, 2100);
  assert.equal(m.fonteMetaGastos, 'plano');
  assert.equal(m.aindaVaiSair, 1500);
  assert.equal(m.disponivel, 2100 - 700 - 1500);
  assert.equal(m.metaGuardar, 800); // 20% de 4000
  const alimentacao = m.categorias.find((c) => c.categoria === 'Alimentação');
  assert.equal(alimentacao.status, 'estourou');
  assert.ok(m.avisos.some((a) => a.texto.includes('Alimentação')));
});

test('meta do mês sem plano usa a média dos últimos meses', async () => {
  const m = await metaDoMes(U, somarMeses(mesAtual, -1));
  assert.equal(m.estado, 'encerrado');
  assert.equal(m.fonteMetaGastos, 'media');
  assert.equal(m.metaGastos, 2500);
  assert.equal(m.guardado, 1500);
});
