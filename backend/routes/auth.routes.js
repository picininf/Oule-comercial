import { Router } from 'express';
import { requireAuth, attachProfile } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/auth/me
 * Fonte única de verdade para o frontend saber quem está logado e qual
 * o papel dessa pessoa (cliente / planejador / oule). Substitui a
 * antiga checagem separada (`/admin/status` + consulta direta do
 * frontend à tabela `profiles`).
 */
router.get('/me', requireAuth, attachProfile, (req, res) => {
  res.json({
    id: req.userId,
    email: req.userEmail,
    nome: req.profile.nome || req.userEmail.split('@')[0],
    telefone: req.profile.telefone || '',
    bancoConectado: req.profile.bancoConectado || '',
    role: req.profile.role,
    planejadorId: req.profile.planejadorId,
  });
});

export default router;
