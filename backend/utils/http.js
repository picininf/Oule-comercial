/**
 * Cria um erro com status HTTP e mensagem segura para o cliente. O
 * errorHandler central só repassa `publicMessage` — nunca a mensagem
 * interna de Supabase/Pluggy/Gemini.
 */
export function httpError(status, publicMessage) {
  const err = new Error(publicMessage);
  err.status = status;
  err.publicMessage = publicMessage;
  return err;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ehUuid(valor) {
  return typeof valor === 'string' && UUID_RE.test(valor);
}

/**
 * Middleware que recusa (400) parâmetros de rota que deveriam ser UUID.
 * Evita consultas inúteis ao banco e erros 500 por formato inválido.
 */
export function exigirUuid(...nomes) {
  return (req, res, next) => {
    for (const nome of nomes) {
      if (!ehUuid(req.params[nome])) {
        return res.status(400).json({ error: 'Identificador inválido.' });
      }
    }
    next();
  };
}
