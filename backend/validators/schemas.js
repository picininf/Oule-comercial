import { z } from 'zod';

/**
 * Schema de validação do JSON que a IA (Gemini) devolve ao ler um
 * comprovante. Nunca gravamos no banco o que a IA devolve sem validar
 * formato/tipo — um comprovante malicioso ou uma alucinação da IA não
 * pode virar um valor ou categoria fora do esperado dentro do seu banco
 * de dados financeiro.
 */
export const comprovanteSchema = z.object({
  estabelecimento: z.string().trim().min(1).max(120).default('Não identificado'),
  valor: z.coerce.number().finite().min(0).max(1_000_000),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .default(() => new Date().toISOString().split('T')[0]),
  categoria: z.enum(['Salário', 'Alimentação', 'Transporte', 'Serviços', 'Lazer', 'Outros']).default('Outros'),
  metodo_pagamento: z.enum(['Pix', 'Cartão', 'Boleto', 'Dinheiro']).default('Pix'),
});

// Params de rota com itemId da Pluggy (uuid)
export const itemIdParamSchema = z.object({
  itemId: z.string().uuid('itemId inválido.'),
});

// Payload recebido no endpoint de webhook da Pluggy
export const pluggyWebhookSchema = z.object({
  event: z.string().min(1),
  eventId: z.string().min(1),
  itemId: z.string().uuid().optional(),
  connectorId: z.union([z.string(), z.number()]).optional(),
  accountId: z.string().uuid().optional(),
  clientUserId: z.string().optional(),
  triggeredBy: z.string().optional(),
  error: z.any().optional(),
}).passthrough();

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Dados inválidos.', detalhes: result.error.flatten() });
    }
    req.body = result.data;
    next();
  };
}

export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({ error: 'Parâmetros inválidos.' });
    }
    req.params = result.data;
    next();
  };
}
