const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * CORS restrito a uma lista branca de origens (definida em ALLOWED_ORIGINS).
 * Nunca use "*" em um sistema que movimenta dados bancarios: isso permite
 * que qualquer site na internet chame sua API usando o token de sessao
 * de um usuario que esteja logado e visite uma pagina maliciosa.
 */
export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning');
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
}
