import { Router } from 'express';
import path from 'path';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';

const router = Router();
const uploadsFolder = path.join(process.cwd(), 'uploads');

// Serve comprovantes SOMENTE se o arquivo pertencer a uma transação do
// usuário autenticado. Nunca use express.static() para essa pasta —
// isso tornaria os comprovantes de todo mundo públicos e adivinháveis.
router.get('/:filename', requireAuth, async (req, res, next) => {
  try {
    const { filename } = req.params;

    // impede path traversal (ex: ../../.env)
    if (!/^[a-f0-9-]{36}\.jpg$/i.test(filename)) {
      return res.status(400).json({ error: 'Nome de arquivo inválido.' });
    }

    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .select('id')
      .eq('user_id', req.userId)
      .eq('image_url', `/uploads/${filename}`)
      .maybeSingle();

    if (error || !data) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    res.sendFile(path.join(uploadsFolder, filename));
  } catch (err) {
    next(err);
  }
});

export default router;
