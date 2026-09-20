import { supabaseAdmin } from '../config/supabaseAdmin.js';

// E-mail da conta de administrador "raiz". Configurável via .env; se não
// definido, cai no valor padrão combinado com o usuário. Esse e-mail
// sempre é tratado como papel 'oule' (admin), mesmo que a linha em
// `profiles` diga outra coisa — é uma trava de segurança extra que não
// depende do banco.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase();

const PAPEIS_VALIDOS = new Set(['oule', 'planejador', 'cliente']);

/**
 * Middleware de autenticacao.
 *
 * REGRA DE OURO: o userId NUNCA vem do body/query da requisicao.
 * Ele so pode vir do token JWT validado aqui, extraido pelo Supabase.
 * Isso impede que um usuario forje o userId de outra pessoa para
 * ler/gravar dados financeiros que nao sao dele.
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de acesso não fornecido.' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({ error: 'Token de acesso inválido.' });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Sessão expirada ou inválida. Faça login novamente.' });
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email;
    next();
  } catch (err) {
    console.error('Erro no middleware de autenticação:', err);
    return res.status(401).json({ error: 'Não foi possível validar sua sessão.' });
  }
}

/**
 * Busca (e cria de forma auto-curativa, se necessário) a linha de
 * `profiles` do usuário autenticado. Usuários criados antes da tabela
 * `profiles` existir não têm linha lá ainda — nesse caso criamos uma
 * com o papel padrão 'cliente' (ou 'oule' se o e-mail bater com
 * ADMIN_EMAIL) na primeira requisição autenticada dele.
 */
export async function carregarOuCriarPerfil(userId, userEmail) {
  const { data: existente, error: erroSelect } = await supabaseAdmin
    .from('profiles')
    .select('id, nome, telefone, banco_conectado, role, planejador_id')
    .eq('id', userId)
    .maybeSingle();

  if (erroSelect) throw erroSelect;

  const ehAdminRaiz = (userEmail || '').trim().toLowerCase() === ADMIN_EMAIL;

  if (existente) {
    // O e-mail-admin raiz sempre é forçado para 'oule', mesmo que a
    // linha no banco tenha ficado desatualizada.
    if (ehAdminRaiz && existente.role !== 'oule') {
      const { data: atualizado } = await supabaseAdmin
        .from('profiles')
        .update({ role: 'oule' })
        .eq('id', userId)
        .select('id, nome, telefone, banco_conectado, role, planejador_id')
        .single();
      return atualizado || { ...existente, role: 'oule' };
    }
    return existente;
  }

  const novoPerfil = {
    id: userId,
    role: ehAdminRaiz ? 'oule' : 'cliente',
  };

  const { data: criado, error: erroInsert } = await supabaseAdmin
    .from('profiles')
    .insert(novoPerfil)
    .select('id, nome, telefone, banco_conectado, role, planejador_id')
    .single();

  // Corrida rara: duas requisições simultâneas tentando criar o mesmo
  // perfil. Se o insert falhar por conflito de PK, apenas relemos.
  if (erroInsert) {
    const { data: releitura } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, telefone, banco_conectado, role, planejador_id')
      .eq('id', userId)
      .maybeSingle();
    if (releitura) return releitura;
    throw erroInsert;
  }

  return criado;
}

/**
 * Middleware que carrega o perfil (papel, planejador responsável, etc.)
 * do usuário autenticado e anexa em `req.profile`. Deve rodar sempre
 * depois de `requireAuth`.
 */
export async function attachProfile(req, res, next) {
  try {
    const perfil = await carregarOuCriarPerfil(req.userId, req.userEmail);
    req.profile = {
      role: perfil.role,
      planejadorId: perfil.planejador_id || null,
      nome: perfil.nome || null,
      telefone: perfil.telefone || null,
      bancoConectado: perfil.banco_conectado || null,
    };
    next();
  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
    return res.status(500).json({ error: 'Não foi possível carregar seu perfil.' });
  }
}

/**
 * Middleware de autorização de administrador (papel 'oule').
 *
 * IMPORTANTE: deve ser usado SEMPRE depois de `requireAuth` +
 * `attachProfile` na cadeia de middlewares.
 */
export function requireOule(req, res, next) {
  if (req.profile?.role !== 'oule') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }
  next();
}

/**
 * Middleware que libera acesso para papéis "staff" (oule OU
 * planejador). Os handlers são responsáveis por filtrar os dados de
 * acordo com `req.profile.role` (planejador só vê os próprios
 * clientes; oule vê todos).
 */
export function requireStaff(req, res, next) {
  if (req.profile?.role !== 'oule' && req.profile?.role !== 'planejador') {
    return res.status(403).json({ error: 'Acesso restrito à equipe (planejadores/administrador).' });
  }
  next();
}

/**
 * Mantido por compatibilidade: alguns pontos antigos do código ainda
 * podem importar `requireAdmin`. Equivalente a `requireOule`.
 */
export const requireAdmin = requireOule;

export function papelValido(valor) {
  return PAPEIS_VALIDOS.has(valor);
}

export { ADMIN_EMAIL };
