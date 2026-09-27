import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/rateLimit.js';
import { validateParams, itemIdParamSchema } from '../validators/schemas.js';
import {
  criarConnectToken,
  vincularItemAoUsuario,
  sincronizarTransacoesDoItem,
} from '../services/pluggy.service.js';

const router = Router();

// Só usuários logados podem gerar um Connect Token (evita que qualquer
// visitante anônimo gaste sua cota da Pluggy).
router.get('/token', requireAuth, sensitiveLimiter, async (req, res, next) => {
  try {
    // Use includeSandbox: true apenas em ambiente de desenvolvimento.
    // Antes de ir para produção com o Nubank real, mude para false.
    const includeSandbox = process.env.NODE_ENV !== 'production';
    // userId vai preso ao token como clientUserId — é isso que permite
    // provar depois, de forma independente, que o item pertence a este
    // usuário (ver services/pluggy.service.js).
    const connectToken = await criarConnectToken({ includeSandbox, userId: req.userId });
    res.json({ connectToken });
  } catch (err) {
    next(err);
  }
});

// Chamado pelo frontend logo após o usuário concluir o Pluggy Connect.
// Aqui só REGISTRAMOS a relação item -> usuário e disparamos a primeira
// sincronização; as próximas atualizações chegam pelo webhook.
router.post('/transacoes/:itemId', requireAuth, sensitiveLimiter, validateParams(itemIdParamSchema), async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const userId = req.userId; // nunca de req.body

    await vincularItemAoUsuario({ itemId, userId });
    const resultado = await sincronizarTransacoesDoItem(itemId, userId);

    res.json({ success: true, count: resultado.count });
  } catch (err) {
    next(err);
  }
});

export default router;
