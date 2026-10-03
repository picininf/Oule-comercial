import crypto from 'crypto';

/**
 * Supabase em memória para testes e para o servidor de demonstração:
 * implementa o subconjunto do query builder usado pelo backend
 * (select/insert/update/upsert/delete, filtros, range, single...) e do
 * auth (getUser, admin.listUsers, admin.getUserById).
 */
export function criarSupabaseFalso(tabelas, { usuarios = [] } = {}) {
  const UNICOS = {
    transacoes: [['user_id', 'open_finance_id']],
    plano_mensal: [['user_id', 'mes', 'categoria']],
    plano_premissas: [['user_id', 'ano']],
    aposentadoria_planos: [['user_id']],
    pagamentos_mensais: [['pagamento_id', 'mes']],
    lembretes_enviados: [['pagamento_id', 'mes', 'canal', 'tipo']],
    open_finance_items: [['item_id']],
    profiles: [['id']],
  };
  const PADROES = {
    profiles: () => ({ codigo_cliente: `OUL-${String(1000 + (tabelas.profiles || []).length + 1).padStart(6, '0')}`, tags: [], pais: 'Brasil', lembrete_dias_antecedencia: 3, lembrete_whatsapp: true }),
    objetivos: () => ({ status: 'em_andamento', created_at: new Date().toISOString() }),
    cartoes: () => ({ ativo: true, created_at: new Date().toISOString() }),
    pagamentos_recorrentes: () => ({ ativo: true, lembrar: true, created_at: new Date().toISOString() }),
    extrato_importacoes: () => ({ created_at: new Date().toISOString(), quantidade_transacoes: 0, quantidade_duplicadas: 0 }),
    plano_premissas: () => ({ inflacao_anual: 4.5, reajuste_renda_anual: 5, meta_poupanca_pct: 20, patrimonio_inicial: null }),
    aposentadoria_planos: () => ({ outras_rendas: 0, taxa_retirada_anual: 4, rentabilidade_real_anual: 4 }),
  };

  function conflita(nome, a, b) {
    return (UNICOS[nome] || []).some((cols) => cols.every((c) => a[c] !== undefined && a[c] !== null && a[c] === b[c]));
  }

  function builder(nome) {
    tabelas[nome] ||= [];
    const filtros = [];
    let faixa = null;
    let unico = null; // 'maybe' | 'single'
    let operacao = 'select';
    let payload = null;
    let opcoes = {};
    let retornar = false;
    let somenteContagem = false;
    let ordem = null;
    let limite = null;

    const aplicarFiltros = (linhas) => linhas.filter((r) => filtros.every((f) => f(r)));

    const executar = () => {
      const tabela = tabelas[nome];
      let resultado;
      if (operacao === 'select') {
        resultado = aplicarFiltros(tabela);
        if (ordem) {
          const [col, asc] = ordem;
          resultado = [...resultado].sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : String(a[col] ?? '') > String(b[col] ?? '') ? 1 : 0) * (asc ? 1 : -1));
        }
        if (faixa) resultado = resultado.slice(faixa[0], faixa[1] + 1);
        if (limite) resultado = resultado.slice(0, limite);
        if (somenteContagem) return { data: null, count: resultado.length, error: null };
      } else if (operacao === 'insert' || operacao === 'upsert') {
        const linhas = (Array.isArray(payload) ? payload : [payload]).map((l) => ({
          id: crypto.randomUUID(),
          ...(PADROES[nome]?.() || {}),
          ...l,
        }));
        resultado = [];
        for (const l of linhas) {
          const existente = tabela.find((r) => conflita(nome, r, l));
          if (existente) {
            if (operacao === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key' } };
            const { id, ...semId } = l;
            Object.assign(existente, Object.fromEntries(Object.entries(semId).filter(([k]) => k in (Array.isArray(payload) ? payload[0] : payload))));
            resultado.push(existente);
          } else {
            tabela.push(l);
            resultado.push(l);
          }
        }
      } else if (operacao === 'update') {
        resultado = aplicarFiltros(tabela);
        for (const r of resultado) Object.assign(r, payload);
      } else if (operacao === 'delete') {
        resultado = aplicarFiltros(tabela);
        tabelas[nome] = tabela.filter((r) => !resultado.includes(r));
      }

      if (operacao !== 'select' && !retornar) return { data: null, error: null };
      if (unico) {
        if (unico === 'single' && resultado.length !== 1) return { data: null, error: { message: 'single row expected' } };
        return { data: resultado[0] || null, error: null };
      }
      return { data: resultado, error: null };
    };

    const api = {
      select: (_cols, o = {}) => {
        if (operacao !== 'select') retornar = true;
        if (o.head) somenteContagem = true;
        return api;
      },
      insert: (p) => ((operacao = 'insert'), (payload = p), api),
      upsert: (p, o = {}) => ((operacao = 'upsert'), (payload = p), (opcoes = o), api),
      update: (p) => ((operacao = 'update'), (payload = p), api),
      delete: () => ((operacao = 'delete'), api),
      order: (col, o = {}) => ((ordem = [col, o.ascending !== false]), api),
      limit: (n) => ((limite = n), api),
      eq: (c, v) => (filtros.push((r) => r[c] === v), api),
      gte: (c, v) => (filtros.push((r) => r[c] !== null && r[c] !== undefined && r[c] >= v), api),
      gt: (c, v) => (filtros.push((r) => r[c] !== null && r[c] !== undefined && r[c] > v), api),
      lt: (c, v) => (filtros.push((r) => r[c] !== null && r[c] !== undefined && r[c] < v), api),
      lte: (c, v) => (filtros.push((r) => r[c] !== null && r[c] !== undefined && r[c] <= v), api),
      like: (c, padrao) => {
        const re = new RegExp(`^${padrao.replace(/%/g, '.*')}$`);
        filtros.push((r) => re.test(String(r[c])));
        return api;
      },
      in: (c, lista) => (filtros.push((r) => lista.includes(r[c])), api),
      range: (de, ate) => ((faixa = [de, ate]), api),
      maybeSingle: () => ((unico = 'maybe'), api),
      single: () => ((unico = 'single'), api),
      then: (resolve, reject) => {
        try {
          void opcoes;
          resolve(executar());
        } catch (e) {
          reject(e);
        }
      },
    };
    return api;
  }

  const porToken = (token) => usuarios.find((u) => u.token === token);

  return {
    from: (nome) => builder(nome),
    auth: {
      getUser: async (token) => {
        const u = porToken(token);
        return u ? { data: { user: u.user }, error: null } : { data: null, error: { message: 'invalid' } };
      },
      admin: {
        listUsers: async () => ({ data: { users: usuarios.map((u) => u.user) }, error: null }),
        getUserById: async (id) => {
          const u = usuarios.find((x) => x.user.id === id);
          return u ? { data: { user: u.user }, error: null } : { data: null, error: { message: 'not found' } };
        },
      },
    },
  };
}
