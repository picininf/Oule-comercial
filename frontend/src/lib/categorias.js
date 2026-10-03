/**
 * Categorias Oule e Tipos de gasto — espelho de
 * backend/utils/categorias.js (mantenha os dois em sincronia).
 */

export const TIPOS_GASTO = [
  { id: 'recorrente_obrigatorio', nome: 'Recorrente | Obrigatório', curto: 'Fixo essencial', cor: '#2563eb' },
  { id: 'recorrente_nao_obrigatorio', nome: 'Recorrente | Não obrigatório', curto: 'Fixo opcional', cor: '#a855f7' },
  { id: 'variavel_obrigatorio', nome: 'Variável | Obrigatório', curto: 'Variável essencial', cor: '#0d9488' },
  { id: 'variavel_nao_obrigatorio', nome: 'Variável | Não obrigatório', curto: 'Variável opcional', cor: '#f59e0b' },
];

export const TIPO_GASTO_POR_ID = Object.fromEntries(TIPOS_GASTO.map((t) => [t.id, t]));

export const CATEGORIAS = [
  { id: 'Moradia', icone: '🏠', cor: '#f97316', grupo: 'despesa', tipoGasto: 'recorrente_obrigatorio' },
  { id: 'Alimentação', icone: '🍽️', cor: '#ef4444', grupo: 'despesa', tipoGasto: 'variavel_obrigatorio' },
  { id: 'Transporte', icone: '🚗', cor: '#3b82f6', grupo: 'despesa', tipoGasto: 'variavel_obrigatorio' },
  { id: 'Saúde', icone: '🩺', cor: '#14b8a6', grupo: 'despesa', tipoGasto: 'variavel_obrigatorio' },
  { id: 'Educação', icone: '🎓', cor: '#6366f1', grupo: 'despesa', tipoGasto: 'recorrente_obrigatorio' },
  { id: 'Serviços', icone: '🧾', cor: '#64748b', grupo: 'despesa', tipoGasto: 'recorrente_obrigatorio' },
  { id: 'Assinaturas', icone: '📺', cor: '#a855f7', grupo: 'despesa', tipoGasto: 'recorrente_nao_obrigatorio' },
  { id: 'Lazer', icone: '🎬', cor: '#ec4899', grupo: 'despesa', tipoGasto: 'variavel_nao_obrigatorio' },
  { id: 'Compras', icone: '🛍️', cor: '#f59e0b', grupo: 'despesa', tipoGasto: 'variavel_nao_obrigatorio' },
  { id: 'Cuidados Pessoais', icone: '💇', cor: '#d946ef', grupo: 'despesa', tipoGasto: 'variavel_nao_obrigatorio' },
  { id: 'Viagens', icone: '✈️', cor: '#0ea5e9', grupo: 'despesa', tipoGasto: 'variavel_nao_obrigatorio' },
  { id: 'Pets', icone: '🐾', cor: '#84cc16', grupo: 'despesa', tipoGasto: 'variavel_obrigatorio' },
  { id: 'Seguros', icone: '🛡️', cor: '#0891b2', grupo: 'despesa', tipoGasto: 'recorrente_obrigatorio' },
  { id: 'Impostos e Taxas', icone: '🏛️', cor: '#78716c', grupo: 'despesa', tipoGasto: 'variavel_obrigatorio' },
  { id: 'Dívidas e Empréstimos', icone: '💳', cor: '#b91c1c', grupo: 'despesa', tipoGasto: 'recorrente_obrigatorio' },
  { id: 'Doações', icone: '🤝', cor: '#22c55e', grupo: 'despesa', tipoGasto: 'variavel_nao_obrigatorio' },
  { id: 'Investimentos', icone: '📈', cor: '#059669', grupo: 'despesa', tipoGasto: 'recorrente_nao_obrigatorio' },
  { id: 'Outros', icone: '📦', cor: '#94a3b8', grupo: 'despesa', tipoGasto: 'variavel_nao_obrigatorio' },
  { id: 'Salário', icone: '💼', cor: '#10b981', grupo: 'receita', tipoGasto: null },
  { id: 'Renda Extra', icone: '💸', cor: '#22c55e', grupo: 'receita', tipoGasto: null },
  { id: 'Rendimentos', icone: '🪙', cor: '#16a34a', grupo: 'receita', tipoGasto: null },
  { id: 'Reembolsos', icone: '↩️', cor: '#4ade80', grupo: 'receita', tipoGasto: null },
  { id: 'Transferências', icone: '🔁', cor: '#cbd5e1', grupo: 'neutro', tipoGasto: null },
];

const POR_ID = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));

export const CATEGORIAS_DESPESA = CATEGORIAS.filter((c) => c.grupo === 'despesa');
export const CATEGORIAS_RECEITA = CATEGORIAS.filter((c) => c.grupo === 'receita');

export function categoriaInfo(id) {
  return POR_ID[id] || { id: id || 'Outros', icone: '🏷️', cor: '#94a3b8', grupo: 'despesa', tipoGasto: null };
}
