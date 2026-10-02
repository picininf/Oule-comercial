/**
 * Categorias Oule — taxonomia única usada em todo o sistema (transações,
 * orçamento, pagamentos mensais, importação de extrato, IA e análises).
 *
 * Toda categoria que chega de fora (Pluggy em inglês, extrato lido pela
 * IA, planilha do banco, legenda antiga do WhatsApp) passa por
 * `normalizarCategoria()` antes de ir para o banco. Assim os gráficos e
 * comparativos sempre falam a mesma língua.
 *
 * Espelhado em frontend/src/lib/categorias.js — mantenha os dois em
 * sincronia.
 */

export const TIPOS_GASTO = {
  recorrente_obrigatorio: { id: 'recorrente_obrigatorio', nome: 'Recorrente | Obrigatório', curto: 'Fixo essencial' },
  recorrente_nao_obrigatorio: { id: 'recorrente_nao_obrigatorio', nome: 'Recorrente | Não obrigatório', curto: 'Fixo opcional' },
  variavel_obrigatorio: { id: 'variavel_obrigatorio', nome: 'Variável | Obrigatório', curto: 'Variável essencial' },
  variavel_nao_obrigatorio: { id: 'variavel_nao_obrigatorio', nome: 'Variável | Não obrigatório', curto: 'Variável opcional' },
};

export const TIPOS_GASTO_IDS = Object.keys(TIPOS_GASTO);

// grupo: 'despesa' | 'receita' | 'neutro' (transferências entre contas
// da própria pessoa, que não são nem gasto nem renda).
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

export const CATEGORIA_IDS = CATEGORIAS.map((c) => c.id);
const POR_ID = new Map(CATEGORIAS.map((c) => [c.id, c]));

export function semAcento(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const POR_NOME_NORMALIZADO = new Map(CATEGORIAS.map((c) => [semAcento(c.id), c.id]));

// Nomes antigos usados em versões anteriores do app (bot do WhatsApp,
// orçamento, IA de extrato) -> categoria Oule equivalente.
const ALIASES = {
  outro: 'Outros',
  investimento: 'Investimentos',
  transferencia: 'Transferências',
  renda: 'Renda Extra',
  receita: 'Renda Extra',
  cashback: 'Reembolsos',
  reembolso: 'Reembolsos',
  imposto: 'Impostos e Taxas',
  impostos: 'Impostos e Taxas',
  divida: 'Dívidas e Empréstimos',
  dividas: 'Dívidas e Empréstimos',
  emprestimo: 'Dívidas e Empréstimos',
  viagem: 'Viagens',
  pet: 'Pets',
  seguro: 'Seguros',
  doacao: 'Doações',
  assinatura: 'Assinaturas',
  streaming: 'Assinaturas',
  salary: 'Salário',
};

const TRANSFERENCIA_GENERICA = '__transferencia_generica__';

/**
 * Regras por palavra-chave, aplicadas primeiro sobre a categoria bruta
 * (ex.: categorias em inglês da Pluggy) e depois sobre a descrição do
 * lançamento. A ordem importa: a primeira regra que casar vence.
 */
const REGRAS = [
  [/salar|payroll|folha de pag|pro.?labore/, 'Salário'],
  [/dividend|juros sobre capital|rendimento|interests? (earned|income)|proceeds|cashback/, 'Rendimentos'],
  [/reembols|estorno|refund|chargeback/, 'Reembolsos'],
  [/entrepreneur|government aid|non.?recurring income|retirement|aposentadoria|beneficio|inss credito|freela|renda extra/, 'Renda Extra'],
  // Neutras de verdade: pagar a fatura do cartão (as compras já foram
  // contadas uma a uma) e mover dinheiro entre contas da própria pessoa.
  [/credit card payment|pagamento de fatura|pgto fatura|pag fatura|pagto cartao|same person transfer|mesma titularidade|entre contas|resgate automatico|aplicacao automatica/, 'Transferências'],
  // PIX/TED/DOC genérico: pode ser renda (cliente pagando) ou gasto
  // (pagando alguém). Decidido pelo sinal em normalizarCategoria().
  [/transfer|\btransf\b|\bted\b|\bdoc\b|\bpix\b|mercado ?pago|picpay/, TRANSFERENCIA_GENERICA],
  [/invest|fixed income|variable income|mutual fund|tesouro|\bcdb\b|\blci\b|\blca\b|corretora|previdencia privada/, 'Investimentos'],
  [/\bloans?\b|financing|financiamento|emprestimo|consignado|interests? charged|juros|late payment|encargos|iof atraso|cheque especial/, 'Dívidas e Empréstimos'],
  [/\btax(es)?\b|income tax|imposto|iptu|ipva|darf|tarifa governamental|multa de transito|licenciamento|cartorio/, 'Impostos e Taxas'],
  [/insurance|seguro/, 'Seguros'],
  [/transport|\btaxi\b|ride.?hailing|\buber\b|99app|99 ?pop|cabify|\bmetro\b|onibus|bilhete unico|gas station|\bposto\b|combustivel|\bshell\b|ipiranga|petrobras|br distribuidora|parking|estacionamento|\btolls?\b|pedagio|sem parar|conectcar|veloe|car rental|localiza|movida|unidas|auto ?pecas|oficina|mecanica/, 'Transporte'],
  [/\brent\b|aluguel|condominio|housing|utilities|electricity|energia eletrica|\benel\b|cemig|copel|light s\.?a|celesc|coelba|cpfl|equatorial|\bwater\b|sabesp|cedae|copasa|saneamento|agua e esgoto|comgas|naturgy|gas encanado|houseware|home improvement/, 'Moradia'],
  [/streaming|netflix|spotify|disney|\bhbo\b|max\.com|prime video|amazon prime|globoplay|deezer|youtube premium|apple\.com\/bill|icloud|google one|paramount|crunchyroll|subscription|assinatura/, 'Assinaturas'],
  [/telecom|internet|\bmobile\b|telefon|celular|\bvivo\b|\bclaro\b|\btim\b|\boi\b|net servicos|bank fees|tarifa|anuidade|cesta de servicos|\bservices?\b|servico/, 'Serviços'],
  [/grocer|supermerc|\bmercado\b(?! ?livre)|atacad|assai|carrefour|pao de acucar|hortifruti|padaria|acougue|eating out|restaurant|lanchonete|\bfood\b|ifood|rappi|ze delivery|\bbar\b|\bcafe\b|cafeteria|mcdonald|burger king|subway|pizzaria/, 'Alimentação'],
  [/health|saude|pharmac|farmacia|drogaria|drogasil|droga raia|pague menos|panvel|hospital|clinica|laboratorio|\bexames?\b|dentist|odonto|medic|psicolog|unimed|\bamil\b|hapvida/, 'Saúde'],
  [/educa|school|escola|colegio|universit|faculdade|\bcursos?\b|udemy|alura|coursera|livraria|material escolar/, 'Educação'],
  [/travel|viagem|airline|airport|aereas|latam|gol linhas|azul linhas|decolar|booking|airbnb|hotel|pousada|hostel|accomm?odation|\bcvc\b/, 'Viagens'],
  [/cinema|cinemark|kinoplex|\buci\b|cinepolis|ingresso|sympla|eventim|teatro|\bshows?\b|leisure|lazer|\bsports?\b|esporte|\bgames?\b|steam|playstation|xbox|nintendo|\bparque\b|museu|\bclube\b/, 'Lazer'],
  [/\bgym\b|academia|smart ?fit|bodytech|wellness|fitness|beauty|beleza|salao|barbearia|cabeleireir|estetica|cosmetic|perfumaria|boticario|\bnatura\b|sephora/, 'Cuidados Pessoais'],
  [/\bpets?\b|pet ?shop|veterin|\bpetz\b|cobasi|petlove|racao|racoes/, 'Pets'],
  [/donation|doacao|vakinha|igreja|dizimo|\bong\b/, 'Doações'],
  [/shopping|compras|electronic|eletronic|clothing|vestuario|roupa|calcado|magazine luiza|magalu|americanas|casas bahia|mercado ?livre|shopee|aliexpress|shein|amazon|renner|riachuelo|\bc&a\b|\bzara\b|centauro|netshoes|kalunga|leroy merlin|ikea|tok ?stok/, 'Compras'],
];

function porRegras(texto) {
  const t = semAcento(texto);
  if (!t) return null;
  for (const [regex, categoria] of REGRAS) {
    if (regex.test(t)) return categoria;
  }
  return null;
}

/**
 * Converte qualquer categoria (e opcionalmente a descrição do
 * lançamento) para uma categoria Oule válida.
 *
 * @param {string|null} categoriaBruta - ex.: "Groceries", "Serviços", "Outro"
 * @param {string} [descricao] - usada como pista quando a categoria
 *   bruta é vazia/genérica (ex.: "UBER *TRIP" -> Transporte).
 */
export function normalizarCategoria(categoriaBruta, descricao = '') {
  const bruto = semAcento(categoriaBruta);

  if (bruto) {
    const exata = POR_NOME_NORMALIZADO.get(bruto) || ALIASES[bruto];
    if (exata && exata !== 'Outros') return exata;

    const porCategoria = porRegras(bruto);
    if (porCategoria) return porCategoria;
  }

  const porDescricao = porRegras(descricao);
  if (porDescricao) return porDescricao;

  return 'Outros';
}

export function categoriaInfo(id) {
  return POR_ID.get(id) || POR_ID.get('Outros');
}

export function ehCategoriaValida(id) {
  return POR_ID.has(id);
}

/** Tipo de gasto sugerido para uma categoria (null para receitas). */
export function tipoGastoPadrao(categoria) {
  return categoriaInfo(categoria).tipoGasto;
}
