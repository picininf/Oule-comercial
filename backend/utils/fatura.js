import { somarMeses, dataNoMes, mesDe } from './financeUtils.js';

/**
 * Cálculo de fatura de cartão de crédito.
 *
 * O problema: "comprei hoje, mas a primeira fatura só cobra mês que vem".
 * Para o planejamento existem DUAS datas para a mesma compra:
 *
 *   - competência: o dia em que a compra aconteceu (o gasto é daquele
 *     mês, mesmo que seja pago depois);
 *   - caixa: o dia em que o dinheiro realmente sai da conta, ou seja, o
 *     vencimento da fatura em que a compra (ou a parcela) caiu.
 *
 * Regras usadas pelos bancos brasileiros:
 *   - A fatura "fecha" no dia de fechamento. Compras feitas ANTES do
 *     fechamento entram na fatura que fecha neste mês; compras NO dia do
 *     fechamento ou depois já vão para a fatura seguinte (por isso o dia
 *     do fechamento é o "melhor dia de compra").
 *   - O vencimento é alguns dias depois do fechamento. Se o dia de
 *     vencimento for menor ou igual ao de fechamento, ele cai no mês
 *     seguinte ao fechamento.
 *   - Compra parcelada: a parcela N cai N-1 faturas depois da primeira.
 *
 * Exemplo (fecha dia 25, vence dia 5):
 *   compra em 10/03 -> fecha 25/03 -> vence 05/04
 *   compra em 26/03 -> fecha 25/04 -> vence 05/05
 *   3x a partir de 26/03 -> vencimentos 05/05, 05/06, 05/07
 */
export function calcularFatura({ dataCompra, diaFechamento, diaVencimento, parcela = 1 }) {
  const mesCompra = mesDe(dataCompra);
  const diaCompra = Number(String(dataCompra).slice(8, 10));

  // Dia de fechamento efetivo naquele mês (dia 31 em abril vira 30).
  const fechamentoNoMesDaCompra = Number(dataNoMes(mesCompra, diaFechamento).slice(8, 10));
  const fechaNoMesSeguinte = diaCompra >= fechamentoNoMesDaCompra;

  const mesFechamento = somarMeses(mesCompra, (fechaNoMesSeguinte ? 1 : 0) + (parcela - 1));
  const mesVencimento = diaVencimento > diaFechamento ? mesFechamento : somarMeses(mesFechamento, 1);

  return {
    dataFechamento: dataNoMes(mesFechamento, diaFechamento),
    dataVencimento: dataNoMes(mesVencimento, diaVencimento),
    mesFatura: mesVencimento,
  };
}

/**
 * Gera as N parcelas de uma compra no cartão, já com competência e
 * caixa calculadas. O valor é dividido em centavos para que a soma das
 * parcelas bata exatamente com o total (a diferença de arredondamento
 * vai para a primeira parcela, como fazem os bancos).
 *
 * @param {number} valorTotal - valor POSITIVO da compra
 * @returns {Array<{parcela, valor, dataCompetencia, dataCaixa, mesFatura}>}
 */
export function gerarParcelas({ dataCompra, valorTotal, parcelas = 1, diaFechamento, diaVencimento }) {
  const totalCentavos = Math.round(Math.abs(valorTotal) * 100);
  const base = Math.floor(totalCentavos / parcelas);
  const resto = totalCentavos - base * parcelas;

  return Array.from({ length: parcelas }, (_, i) => {
    const numero = i + 1;
    const { dataVencimento, mesFatura } = calcularFatura({ dataCompra, diaFechamento, diaVencimento, parcela: numero });
    return {
      parcela: numero,
      valor: (base + (i === 0 ? resto : 0)) / 100,
      // Competência: o gasto pertence ao mês da compra. Cada parcela, no
      // entanto, é "consumida" no mês da sua fatura no regime de caixa.
      dataCompetencia: dataCompra,
      dataCaixa: dataVencimento,
      mesFatura,
    };
  });
}

/**
 * Para transações que chegam já separadas por parcela (Open Finance),
 * descobre o vencimento da fatura em que aquela linha cai.
 */
export function dataCaixaDaParcela({ dataLancamento, dataCompra, parcelaAtual, diaFechamento, diaVencimento }) {
  // Algumas instituições mandam todas as parcelas com a data original da
  // compra; outras já mandam com a data em que a parcela entrou na
  // fatura. Se a data do lançamento for a da compra, deslocamos pela
  // parcela; senão a própria data já indica a fatura certa.
  const mesmaDataDaCompra = dataCompra && dataLancamento === dataCompra;
  const parcela = mesmaDataDaCompra && parcelaAtual > 1 ? parcelaAtual : 1;
  return calcularFatura({ dataCompra: dataLancamento, diaFechamento, diaVencimento, parcela }).dataVencimento;
}
