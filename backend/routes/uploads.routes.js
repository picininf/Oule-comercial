import { Router } from 'express';
import path from 'path';
import { autenticado } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { garantirAcesso } from '../utils/acesso.js';

const router = Router();
const uploadsFolder = path.join(process.cwd(), 'uploads');

// Serve comprovantes SOMENTE para o dono da transação ou para a equipe
// responsável por ele (planejador do cliente / oule). Nunca use
// express.static() para essa pasta — isso tornaria os comprovantes de
// todo mundo públicos e adivinháveis.
router.get('/:filename', autenticado, async (req, res, next) => {
  try {
    const { filename } = req.params;

    // impede path traversal (ex: ../../.env)
    if (!/^[a-f0-9-]{36}\.jpg$/i.test(filename)) {
      return res.status(400).json({ error: 'Nome de arquivo inválido.' });
    }

    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .select('user_id')
      .eq('image_url', `/uploads/${filename}`)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return res.status(404).json({ error: 'Comprovante não encontrado.' });
    }

    try {
      await garantirAcesso(req, data.user_id);
    } catch {
      return res.status(404).json({ error: 'Comprovante não encontrado.' });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(path.join(uploadsFolder, filename), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Comprovante não encontrado.' });
    });
  } catch (err) {
    next(err);
  }
});

export default router;
