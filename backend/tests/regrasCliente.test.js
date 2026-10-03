/**
 * "Minhas regras" (classificação memorizada pelo cliente) com banco em
 * memória: sugestão do trecho, aplicação em lançamentos novos e nos que
 * já existem, edição e desfazer.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { criarSupabaseFalso } from './supabaseFalso.js';

const U = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';
const PIX_PEDRO = 'Transferência enviada pelo Pix - Pedro Veiga Rela Tavares - •••.007.268-•• - MERCADO PAGO IP LTDA. (0323) Agência: 1 Conta: 3220947187-5';

const base = { user_id: U, origem: 'extrato_planilha', data_transacao: '2026-09-10', data_competencia: '2026-09-10', data_caixa: '2026-09-10', regra_id: null, descricao_original: null };
const banco = criarSupabaseFalso({
  regras_transacao: [],
  transacoes: [
    { ...base, id: 't1', descricao: PIX_PEDRO, valor: -10, categoria: 'Outros', tipo_gasto: 'variavel_nao_obrigatorio' },
    { ...base, id: 't2', descricao: PIX_PEDRO, valor: -5, categoria: 'Outros', tipo_gasto: 'variavel_nao_obrigatorio' },
    // Pedro devolvendo dinheiro: entrada, não pode virar "Brownie".
    { ...base, id: 't3', descricao: 'Transferência recebida pelo Pix - Pedro Veiga Rela Tavares - •••.007.268-••', valor: 5, categoria: 'Renda Extra', tipo_gasto: null },
    { ...base, id: 't4', descricao: 'Compra no débito - AMAGI LANCHONETE BUFFE', valor: -30, categoria: 'Alimentação', tipo_gasto: 'variavel_obrigatorio' },
    // Mesmo texto, outro cliente: nunca é tocado.
    { ...base, id: 't5', user_id: OUTRO, descricao: PIX_PEDRO, valor: -10, categoria: 'Outros', tipo_gasto: null },
  ],
});

mock.module('../config/supabaseAdmin.js', { namedExports: { supabaseAdmin: banco } });
const {
  sugerirPadrao, encontrarRegra, aplicarRegras, aplicarRegraNasExistentes, desfazerRegra, transacoesQueCasam,
} = await import('../services/regras.service.js');

const linhas = async () => (await banco.from('transacoes').select('*').eq('user_id', U)).data;
const porId = async (id) => (await linhas()).find((t) => t.id === id);

test('sugere o nome de quem recebeu como trecho da regra', () => {
  assert.equal(sugerirPadrao(PIX_PEDRO), 'Pedro Veiga Rela Tavares');
  assert.equal(sugerirPadrao('Compra no débito - AMAGI LANCHONETE BUFFE'), 'AMAGI LANCHONETE BUFFE');
  assert.equal(
    sugerirPadrao('Transferência Recebida - 29.828.104 CLAUDIO ANDERSON PICININ - 29.828.104/0001-70 - NU PAGAMENTOS - IP (0260) Agência: 1 Conta: 15687272-6'),
    'CLAUDIO ANDERSON PICININ'
  );
  assert.equal(sugerirPadrao('Transferência enviada pelo Pix - PASSAKI - 44.909.710/0001-04 - ITAÚ UNIBANCO S.A. (0341) Agência: 1546 Conta: 99750-1'), 'PASSAKI');
  assert.equal(sugerirPadrao('Débito em conta'), 'Débito em conta');
});

test('casamento ignora acento/maiúsculas, respeita o sentido e prefere a regra mais específica', () => {
  const regras = [
    { id: 'a', padrao: 'pedro', sentido: 'saida', ativo: true },
    { id: 'b', padrao: 'PEDRO VEIGA', sentido: 'saida', ativo: true },
    { id: 'c', padrao: 'pedro veiga', sentido: 'entrada', ativo: true },
  ];
  assert.equal(encontrarRegra(regras, PIX_PEDRO, -10).id, 'b');
  assert.equal(encontrarRegra(regras, PIX_PEDRO, 10).id, 'c');
  assert.equal(encontrarRegra([{ ...regras[1], ativo: false }], PIX_PEDRO, -10), null);
});

test('lançamento novo entra com nome, categoria e tipo da regra', async () => {
  const regra = { id: 'r-nova', padrao: 'Pedro Veiga Rela Tavares', sentido: 'saida', categoria: 'Alimentação', tipo_gasto: null, descricao: 'Brownie', ativo: true };
  const [l] = await aplicarRegras(U, [{ user_id: U, descricao: PIX_PEDRO, valor: -10, categoria: 'Outros', tipo_gasto: 'variavel_nao_obrigatorio' }], [regra]);
  assert.equal(l.descricao, 'Brownie');
  assert.equal(l.descricao_original, PIX_PEDRO);
  assert.equal(l.categoria, 'Alimentação');
  assert.equal(l.tipo_gasto, 'variavel_obrigatorio'); // padrão da categoria
  assert.equal(l.regra_id, 'r-nova');

  // Sem regras (ou v5 não rodada): linhas intactas, sem colunas novas.
  const [intacta] = await aplicarRegras(U, [{ descricao: PIX_PEDRO, valor: -10 }], []);
  assert.deepEqual(Object.keys(intacta), ['descricao', 'valor']);
});

test('regra aplicada nos existentes: só saídas do próprio cliente', async () => {
  const { data: regra } = await banco
    .from('regras_transacao')
    .insert({ user_id: U, padrao: 'pedro veiga rela tavares', sentido: 'saida', categoria: 'Alimentação', tipo_gasto: 'variavel_nao_obrigatorio', descricao: 'Brownie', ativo: true })
    .select('*')
    .single();

  assert.equal((await transacoesQueCasam(U, regra)).length, 2);
  assert.equal(await aplicarRegraNasExistentes(U, regra), 2);

  for (const id of ['t1', 't2']) {
    const t = await porId(id);
    assert.equal(t.descricao, 'Brownie');
    assert.equal(t.categoria, 'Alimentação');
    assert.equal(t.tipo_gasto, 'variavel_nao_obrigatorio');
    assert.equal(t.descricao_original, PIX_PEDRO);
  }
  assert.equal((await porId('t3')).categoria, 'Renda Extra');
  const outro = (await banco.from('transacoes').select('*').eq('id', 't5')).data[0];
  assert.equal(outro.descricao, PIX_PEDRO);

  // Editar a regra reaplica (continua casando pela descrição original).
  const editada = { ...regra, categoria: 'Lazer', descricao: 'Brownie do Pedro' };
  assert.equal(await aplicarRegraNasExistentes(U, editada), 2);
  assert.equal((await porId('t1')).descricao, 'Brownie do Pedro');
  assert.equal((await porId('t1')).categoria, 'Lazer');

  // Padrão mudou e não casa mais: solta o vínculo e volta o nome do banco.
  const mudou = { ...editada, padrao: 'outra pessoa' };
  await aplicarRegraNasExistentes(U, mudou);
  assert.equal((await porId('t1')).descricao, PIX_PEDRO);
  assert.equal((await porId('t1')).regra_id, null);

  // Desfazer devolve a descrição original.
  await aplicarRegraNasExistentes(U, editada);
  assert.equal(await desfazerRegra(U, regra.id), 2);
  assert.equal((await porId('t2')).descricao, PIX_PEDRO);
  assert.equal((await porId('t2')).regra_id, null);
});
