/**
 * Handler central de erros. Loga o erro completo no servidor (para você
 * debugar) mas NUNCA devolve stack trace, nomes de tabela ou mensagens
 * internas do Supabase/Pluggy/Gemini para o cliente — isso é informação
 * valiosa para um atacante mapear seu sistema.
 */
export function errorHandler(err, req, res, next) {
  console.error(`❌ [${req.method} ${req.originalUrl}]`, err);

  if (res.headersSent) return next(err);

  const status = err.status || 500;
  const publicMessage = status === 500
    ? 'Erro interno no servidor. Nossa equipe já foi notificada.'
    : err.publicMessage || 'Não foi possível processar sua solicitação.';

  res.status(status).json({ error: publicMessage });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Rota não encontrada.' });
}
