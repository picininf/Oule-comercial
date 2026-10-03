import { z } from 'zod';
import { validar } from './validate.js';
import { normalizarCategoria } from '../utils/categorias.js';
import { hojeBrasil } from '../utils/financeUtils.js';

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
    .default(() => hojeBrasil()),
  // Qualquer texto que a IA devolver é convertido para uma Categoria Oule.
  categoria: z.string().trim().max(60).optional().default('Outros'),
  metodo_pagamento: z.enum(['Pix', 'Cartão', 'Boleto', 'Dinheiro']).catch('Pix').default('Pix'),
}).transform((c) => ({ ...c, categoria: normalizarCategoria(c.categoria, c.estabelecimento) }));

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

export const validateBody = (schema) => validar(schema, 'body');
export const validateParams = (schema) => validar(schema, 'params');
