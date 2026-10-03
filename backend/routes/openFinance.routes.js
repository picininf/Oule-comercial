import { Router } from 'express';
import { autenticado } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/rateLimit.js';
import { validateParams, itemIdParamSchema } from '../validators/schemas.js';
import { httpError } from '../utils/http.js';
import {
  criarConnectToken,
  vincularItemAoUsuario,
  sincronizarTransacoesDoItem,
  listarItensDoUsuario,
  removerItem,
  buscarUserIdPorItemId,
} from '../services/pluggy.service.js';

const router = Router();

router.use(autenticado);

// O Open Finance é sempre do próprio usuário logado: nem o planejador
// conecta o banco em nome do cliente (é o login bancário da pessoa).
const includeSandbox = process.env.NODE_ENV !== 'production';

/** GET /api/open-finance/token[?itemId=...] — itemId reabre uma conexão existente para atualizar a senha. */
router.get('/token', sensitiveLimiter, async (req, res, next) => {
  try {
    const { itemId } = req.query;
    if (itemId) {
      const dono = await buscarUserIdPorItemId(String(itemId));
      if (dono !== req.userId) throw httpError(404, 'Conexão bancária não encontrada.');
    }
    const connectToken = await criarConnectToken({ includeSandbox, userId: req.userId, itemId: itemId || undefined });
    res.json({ connectToken, includeSandbox });
  } catch (err) {
    next(err);
  }
});

/** GET /api/open-finance/items — conexões bancárias do usuário. */
router.get('/items', async (req, res, next) => {
  try {
    res.json(await listarItensDoUsuario(req.userId));
  } catch (err) {
    next(err);
  }
});

// Chamado pelo frontend logo após concluir o Pluggy Connect: registra
// item -> usuário (com prova de posse) e faz a primeira sincronização.
// As próximas atualizações chegam pelo webhook.
router.post('/transacoes/:itemId', sensitiveLimiter, validateParams(itemIdParamSchema), async (req, res, next) => {
  try {
    const { itemId } = req.params;
    await vincularItemAoUsuario({ itemId, userId: req.userId });
    const resultado = await sincronizarTransacoesDoItem(itemId, req.userId);
    res.json({ success: true, ...resultado });
  } catch (err) {
    next(err);
  }
});

/** POST /api/open-finance/items/:itemId/sincronizar — "atualizar agora". */
router.post('/items/:itemId/sincronizar', sensitiveLimiter, validateParams(itemIdParamSchema), async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const dono = await buscarUserIdPorItemId(itemId);
    if (dono !== req.userId) throw httpError(404, 'Conexão bancária não encontrada.');
    const resultado = await sincronizarTransacoesDoItem(itemId, req.userId);
    res.json({ success: true, ...resultado });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/open-finance/items/:itemId — desconecta o banco. */
router.delete('/items/:itemId', sensitiveLimiter, validateParams(itemIdParamSchema), async (req, res, next) => {
  try {
    await removerItem({ itemId: req.params.itemId, userId: req.userId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
