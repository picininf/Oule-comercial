import { supabaseAdmin } from '../config/supabaseAdmin.js';

/**
 * Regra central de "quem pode ver os dados de quem" no sistema:
 *
 * - cliente: só os próprios dados.
 * - planejador: os próprios dados + os dados dos clientes cujo
 *   `profiles.planejador_id` aponta para ele.
 * - oule (admin): todos os dados.
 *
 * Nunca confiamos em nada vindo do corpo/query da requisição para
 * decidir isso — só em `req.userId` (do token) e `req.profile.role`
 * (carregado no backend a partir do banco).
 */

/**
 * Retorna a lista de IDs de usuário que o `req` autenticado pode
 * enxergar. Para 'oule', retorna null (= "todos", sem necessidade de
 * filtrar por lista).
 */
export async function idsVisiveisPara(req) {
  const { role } = req.profile || {};

  if (role === 'oule') return null; // null = sem restrição, vê todos

  if (role === 'planejador') {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('planejador_id', req.userId);
    if (error) throw error;
    const ids = (data || []).map((p) => p.id);
    ids.push(req.userId); // o planejador também vê os próprios dados
    return ids;
  }

  // cliente comum: só ele mesmo
  return [req.userId];
}

/**
 * Verifica se o `req` autenticado pode acessar (ler/editar) os dados
 * do usuário `targetUserId`. Lança um objeto de erro com `.status` em
 * caso negativo, para ser usado direto em rotas com try/catch +
 * `next(err)`.
 */
export async function garantirAcesso(req, targetUserId) {
  if (!targetUserId) {
    const err = new Error('Usuário alvo não informado.');
    err.status = 400;
    err.publicMessage = err.message;
    throw err;
  }

  const { role } = req.profile || {};

  if (role === 'oule') return true;

  if (role === 'cliente') {
    if (targetUserId !== req.userId) {
      const err = new Error('Você só pode acessar os seus próprios dados.');
      err.status = 403;
      err.publicMessage = err.message;
      throw err;
    }
    return true;
  }

  if (role === 'planejador') {
    if (targetUserId === req.userId) return true;
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', targetUserId)
      .eq('planejador_id', req.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const err = new Error('Esse cliente não está sob sua responsabilidade.');
      err.status = 403;
      err.publicMessage = err.message;
      throw err;
    }
    return true;
  }

  const err = new Error('Papel de usuário desconhecido.');
  err.status = 403;
  err.publicMessage = err.message;
  throw err;
}

/**
 * Resolve qual `userId` uma rota deve usar: se quem chama é um
 * cliente comum, sempre o próprio ID (ignora qualquer valor mandado
 * na query/body). Se é staff (planejador/oule), usa o `userId`
 * informado (obrigatório) e valida o acesso a ele.
 */
export async function resolverUsuarioAlvo(req, userIdInformado) {
  const { role } = req.profile || {};

  if (role === 'cliente') {
    return req.userId;
  }

  if (!userIdInformado) {
    const err = new Error('Informe o usuário (userId) que deseja consultar.');
    err.status = 400;
    err.publicMessage = err.message;
    throw err;
  }

  await garantirAcesso(req, userIdInformado);
  return userIdInformado;
}
