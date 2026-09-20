import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';

const router = Router();

// Sempre filtra por req.userId (vem do token validado), nunca por um
// userId enviado pelo cliente.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('transacoes')
      .select('*')
      .eq('user_id', req.userId)
      .order('data_transacao', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

export default router;
