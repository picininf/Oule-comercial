import crypto from 'crypto';

/**
 * Dá um identificador a cada requisição. Ele volta no header
 * `X-Request-Id` e aparece no log de erro — quando um cliente reportar
 * um problema, basta pedir o código exibido na tela para achar o log.
 */
export function requestId(req, res, next) {
  const recebido = req.headers['x-request-id'];
  req.id = typeof recebido === 'string' && /^[\w-]{8,64}$/.test(recebido) ? recebido : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

/**
 * Handler central de erros. Loga o erro completo no servidor (para você
 * debugar) mas NUNCA devolve stack trace, nomes de tabela ou mensagens
 * internas do Supabase/Pluggy/Gemini para o cliente — isso é informação
 * valiosa para um atacante mapear seu sistema.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Erros "esperados" do próprio Express/body-parser.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Conteúdo enviado é grande demais.' });
  }

  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;

  if (status >= 500) {
    console.error(`❌ [${req.id}] ${req.method} ${req.originalUrl}`, err);
  } else {
    console.warn(`⚠️ [${req.id}] ${req.method} ${req.originalUrl} -> ${status}: ${err.publicMessage || err.message}`);
  }

  const publicMessage = status >= 500
    ? 'Erro interno no servidor. Tente novamente em instantes.'
    : err.publicMessage || 'Não foi possível processar sua solicitação.';

  res.status(status).json({ error: publicMessage, requestId: req.id });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Rota não encontrada.' });
}
