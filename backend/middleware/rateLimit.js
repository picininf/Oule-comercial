import rateLimit from 'express-rate-limit';

// Limite geral para toda a API
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});

// Limite mais apertado para rotas sensíveis (geração de código, sync bancário)
export const sensitiveLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas nesta operação. Aguarde alguns minutos.' },
});

// Limite para o endpoint de webhook (protege contra flood, mesmo autenticado)
export const webhookLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
