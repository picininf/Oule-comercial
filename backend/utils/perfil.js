import { idadeEmAnos } from './financeUtils.js';

export const FORMAS_TRABALHO = {
  clt: 'CLT',
  pj: 'PJ',
  autonomo: 'Autônomo / Freelancer',
  servidor: 'Servidor público',
  empresario: 'Empresário',
  aposentado: 'Aposentado',
  estudante: 'Estudante',
  sem_renda: 'Sem renda no momento',
};

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR',
  'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'];

export const FAIXAS_ETARIAS = [
  { id: 'ate_24', nome: 'Até 24 anos', min: 0, max: 24 },
  { id: '25_34', nome: '25 a 34 anos', min: 25, max: 34 },
  { id: '35_44', nome: '35 a 44 anos', min: 35, max: 44 },
  { id: '45_59', nome: '45 a 59 anos', min: 45, max: 59 },
  { id: '60_mais', nome: '60 anos ou mais', min: 60, max: 200 },
];

export function faixaEtaria(dataNascimento) {
  const idade = idadeEmAnos(dataNascimento);
  if (idade === null) return null;
  return FAIXAS_ETARIAS.find((f) => idade >= f.min && idade <= f.max) || null;
}

/**
 * TAGs automáticas do perfil (forma de trabalho, país, profissão, faixa
 * etária e UF). Elas alimentam os filtros e comparativos da equipe e
 * não precisam ser digitadas à mão — mudam sozinhas quando o cadastro
 * muda. As TAGs livres ficam em `profiles.tags`.
 */
export function tagsAutomaticas(p) {
  const tags = [];
  if (p.forma_trabalho && FORMAS_TRABALHO[p.forma_trabalho]) tags.push(FORMAS_TRABALHO[p.forma_trabalho]);
  if (p.profissao) tags.push(p.profissao);
  if (p.pais) tags.push(p.pais);
  if (p.estado) tags.push(p.estado);
  const faixa = faixaEtaria(p.data_nascimento);
  if (faixa) tags.push(faixa.nome);
  return tags;
}

const CAMPOS_CADASTRO = ['nome', 'telefone', 'data_nascimento', 'cidade', 'estado', 'pais', 'profissao', 'forma_trabalho', 'renda_mensal'];

/** Percentual do cadastro preenchido (para o aviso "complete seu cadastro"). */
export function completudeCadastro(p) {
  const preenchidos = CAMPOS_CADASTRO.filter((c) => p[c] !== null && p[c] !== undefined && String(p[c]).trim() !== '').length;
  return Math.round((preenchidos / CAMPOS_CADASTRO.length) * 100);
}
