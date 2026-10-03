/**
 * Testes das regras de negócio puras (sem banco). Rode com: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import { calcularFatura, gerarParcelas } from '../utils/fatura.js';
import { normalizarCategoria, tipoGastoPadrao } from '../utils/categorias.js';
import { getValorAjustado, somarMeses, dataNoMes, idadeEmAnos } from '../utils/financeUtils.js';
import { lerPlanilha, parseValor, parseData } from '../services/planilha.service.js';
import { calcularAposentadoria } from '../services/projecao.service.js';

test('fatura: compra antes do fechamento cai na fatura do mês', () => {
  const f = calcularFatura({ dataCompra: '2026-03-10', diaFechamento: 25, diaVencimento: 5 });
  assert.equal(f.dataVencimento, '2026-04-05');
});

test('fatura: compra no dia do fechamento ou depois vai para a próxima', () => {
  assert.equal(calcularFatura({ dataCompra: '2026-03-25', diaFechamento: 25, diaVencimento: 5 }).dataVencimento, '2026-05-05');
  assert.equal(calcularFatura({ dataCompra: '2026-03-26', diaFechamento: 25, diaVencimento: 5 }).dataVencimento, '2026-05-05');
});

test('fatura: vencimento depois do fechamento no mesmo mês', () => {
  assert.equal(calcularFatura({ dataCompra: '2026-03-02', diaFechamento: 3, diaVencimento: 10 }).dataVencimento, '2026-03-10');
});

test('fatura: dia 31 é ajustado para o fim do mês', () => {
  const f = calcularFatura({ dataCompra: '2026-02-10', diaFechamento: 31, diaVencimento: 8 });
  assert.equal(f.dataFechamento, '2026-02-28');
  assert.equal(f.dataVencimento, '2026-03-08');
});

test('parcelas: soma exata e uma fatura por parcela', () => {
  const p = gerarParcelas({ dataCompra: '2026-03-26', valorTotal: 100, parcelas: 3, diaFechamento: 25, diaVencimento: 5 });
  assert.deepEqual(p.map((x) => x.dataCaixa), ['2026-05-05', '2026-06-05', '2026-07-05']);
  assert.equal(p.reduce((s, x) => s + Math.round(x.valor * 100), 0), 10000);
  assert.ok(p.every((x) => x.dataCompetencia === '2026-03-26'));
});

test('categorias: Pluggy, descrições e transferências', () => {
  assert.equal(normalizarCategoria('Groceries'), 'Alimentação');
  assert.equal(normalizarCategoria('Taxi and ride-hailing'), 'Transporte');
  assert.equal(normalizarCategoria('', 'MERCADO LIVRE'), 'Compras');
  assert.equal(normalizarCategoria('Credit card payment'), 'Transferências');
  assert.equal(normalizarCategoria('Transfer - PIX', 'PIX RECEBIDO FULANO', 300), 'Renda Extra');
  assert.equal(normalizarCategoria('Transfer - PIX', 'PIX ENVIADO FULANO', -300), 'Outros');
  assert.equal(normalizarCategoria('Transfer - PIX', 'PIX ENVIADO UBER', -30), 'Transporte');
  assert.equal(tipoGastoPadrao('Moradia'), 'recorrente_obrigatorio');
  assert.equal(tipoGastoPadrao('Salário'), null);
});

test('sinal: origem confiável mantém o sinal; legado usa a categoria', () => {
  assert.equal(getValorAjustado({ valor: 50, categoria: 'Outros', origem: 'open_finance' }), 50);
  assert.equal(getValorAjustado({ valor: 50, categoria: 'Alimentação', origem: 'manual' }), -50);
  assert.equal(getValorAjustado({ valor: -3000, categoria: 'Salário', origem: 'manual' }), 3000);
});

test('datas utilitárias', () => {
  assert.equal(somarMeses('2026-11', 3), '2027-02');
  assert.equal(somarMeses('2026-01', -1), '2025-12');
  assert.equal(dataNoMes('2028-02', 31), '2028-02-29');
  assert.equal(idadeEmAnos('1990-06-15', '2026-06-14'), 35);
  assert.equal(idadeEmAnos('1990-06-15', '2026-06-15'), 36);
});

test('planilha: valores e datas no padrão brasileiro', () => {
  assert.equal(parseValor('1.234,56'), 1234.56);
  assert.equal(parseValor('-R$ 10,00'), -10);
  assert.equal(parseValor('150,00 D'), -150);
  assert.equal(parseValor('(20.5)'), -20.5);
  assert.equal(parseValor('1,234.56'), 1234.56);
  assert.equal(parseData('05/03/26'), '2026-03-05');
  assert.equal(parseData('2026-03-05'), '2026-03-05');
  assert.equal(parseData('31/02/2026'), null);
});

test('planilha: CSV com cabeçalho, saldo e débito/crédito', () => {
  const csv = 'Extrato\n\nData;Histórico;Débito;Crédito;Saldo\n01/03/2026;SALDO ANTERIOR;;;100,00\n02/03/2026;PADARIA;12,50;;87,50\n03/03/2026;SALARIO;;3.000,00;3.087,50\n';
  const { transacoes } = lerPlanilha(Buffer.from(csv), 'extrato.csv');
  assert.deepEqual(transacoes.map((t) => [t.data, t.descricao, t.valor]), [
    ['2026-03-02', 'PADARIA', -12.5],
    ['2026-03-03', 'SALARIO', 3000],
  ]);
});

test('planilha: fatura de cartão com compras positivas é invertida', () => {
  const csv = 'date,title,amount\n2026-03-10,IFOOD,45.90\n2026-03-11,UBER,20.00\n2026-03-12,Pagamento recebido,-500.00\n';
  const { transacoes } = lerPlanilha(Buffer.from(csv), 'fatura.csv', { ehFatura: true });
  assert.deepEqual(transacoes.map((t) => t.valor), [-45.9, -20, 500]);
});

test('planilha: XLSX e OFX', () => {
  const ws = XLSX.utils.aoa_to_sheet([['Data', 'Descrição', 'Valor'], [new Date(2026, 2, 15), 'Netflix', -55.9]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Extrato');
  const xlsx = lerPlanilha(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'a.xlsx');
  assert.deepEqual(xlsx.transacoes[0], { data: '2026-03-15', descricao: 'Netflix', valor: -55.9, categoria: null });

  const ofx = '<OFX><STMTTRN><DTPOSTED>20260314<TRNAMT>-89.90<MEMO>POSTO SHELL</STMTTRN></OFX>';
  assert.equal(lerPlanilha(Buffer.from(ofx), 'x.ofx').transacoes[0].valor, -89.9);
});

test('aposentadoria: patrimônio necessário pela regra dos 4%', () => {
  const r = calcularAposentadoria(
    { idadeAposentadoria: 60, rendaDesejada: 10000, patrimonioAtual: 0, aporteMensal: 2000, rentabilidadeRealAnual: 4, taxaRetiradaAnual: 4, outrasRendas: 2000 },
    30
  );
  assert.equal(r.patrimonioNecessario, 2_400_000);
  assert.equal(r.anosAteAposentadoria, 30);
  assert.ok(r.patrimonioNaAposentadoria > 1_300_000 && r.patrimonioNaAposentadoria < 1_450_000);
  assert.ok(r.aporteMensalNecessario > 3000);
  assert.equal(r.noCaminho, false);
});
