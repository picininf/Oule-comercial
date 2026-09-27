import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth, attachProfile, requireAdmin } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/rateLimit.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { getWhatsappEstado, reiniciarWhatsApp } from '../services/whatsapp.service.js';

const router = Router();
const EXPIRACAO_MINUTOS = 10;

router.post('/vincular', requireAuth, sensitiveLimiter, async (req, res, next) => {
  try {
    const userId = req.userId; // nunca de req.body

    const codigo = crypto.randomInt(100000, 999999).toString();
    const expiraEm = new Date(Date.now() + EXPIRACAO_MINUTOS * 60 * 1000).toISOString();

    // Remove pendências anteriores deste usuário para evitar duplicidade ou conflito
    await supabaseAdmin.from('vinculos_pendentes').delete().eq('user_id', userId);

    // Insere limpo, sem conflito forçado
    const { error } = await supabaseAdmin
      .from('vinculos_pendentes')
      .insert({ user_id: userId, codigo, expira_em: expiraEm });

    if (error) throw error;

    res.json({
      success: true,
      codigo,
      expiraEmMinutos: EXPIRACAO_MINUTOS,
      message: `Envie no WhatsApp: !vincular ${codigo}`,
    });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------
   CONEXÃO DO BOT (QR CODE) — SOMENTE ADMINISTRADOR

   Quem escaneia este QR vira um dispositivo autorizado da conta de WhatsApp
   do bot: lê e envia mensagens em nome dela. É uma credencial, não um dado
   público. Por isso:
     - exige token válido (requireAuth) E e-mail de admin (requireAdmin);
     - a imagem nunca é gravada em disco/banco, só existe na memória;
     - as respostas vão com no-store para não ficarem em cache de navegador,
       de WebView do Capacitor ou de proxy intermediário.
   ------------------------------------------------------------------------- */
const semCache = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
};

router.get('/status', requireAuth, attachProfile, requireAdmin, semCache, (req, res) => {
  res.json(getWhatsappEstado());
});

// Gera um QR novo sem descartar a sessão atual (usado quando o código expira).
router.post('/reconectar', requireAuth, attachProfile, requireAdmin, sensitiveLimiter, semCache, async (req, res, next) => {
  try {
    const estado = await reiniciarWhatsApp({ limparSessao: false });
    res.json(estado);
  } catch (err) {
    next(err);
  }
});

// Desconecta o número atual, apaga a credencial salva e volta pedindo QR.
// É também o botão de pânico caso a pasta auth_info_baileys tenha vazado.
router.post('/desconectar', requireAuth, attachProfile, requireAdmin, sensitiveLimiter, semCache, async (req, res, next) => {
  try {
    const estado = await reiniciarWhatsApp({ limparSessao: true });
    res.json(estado);
  } catch (err) {
    next(err);
  }
});

export default router;
