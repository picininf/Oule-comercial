import { z } from 'zod';

export const objetivoCreateSchema = z.object({
  // Quem é staff (planejador/oule) pode criar em nome de um cliente;
  // clientes comuns sempre criam para si mesmos (o backend ignora este
  // campo nesse caso — ver objetivos.routes.js).
  userId: z.string().uuid().optional(),
  titulo: z.string().trim().min(1, 'Dê um título para a meta.').max(120),
  tipo: z.enum(['dinheiro', 'produto']).default('dinheiro'),
  descricao: z.string().trim().max(500).optional().nullable(),
  valorAlvo: z.coerce.number().finite().min(0).max(100_000_000),
  valorAtual: z.coerce.number().finite().min(0).max(100_000_000).default(0),
  prazo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).')
    .optional()
    .nullable(),
  categoria: z.string().trim().max(60).default('Outro'),
  imagemUrl: z.string().trim().url().max(1000).optional().nullable(),
});

export const objetivoUpdateSchema = z.object({
  titulo: z.string().trim().min(1).max(120).optional(),
  tipo: z.enum(['dinheiro', 'produto']).optional(),
  descricao: z.string().trim().max(500).optional().nullable(),
  valorAlvo: z.coerce.number().finite().min(0).max(100_000_000).optional(),
  valorAtual: z.coerce.number().finite().min(0).max(100_000_000).optional(),
  prazo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).')
    .optional()
    .nullable(),
  categoria: z.string().trim().max(60).optional(),
  imagemUrl: z.string().trim().url().max(1000).optional().nullable(),
  status: z.enum(['em_andamento', 'concluido', 'cancelado']).optional(),
}).refine((obj) => Object.keys(obj).length > 0, { message: 'Nada para atualizar.' });

export function validarBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Dados inválidos.', detalhes: result.error.flatten() });
    }
    req.body = result.data;
    next();
  };
}
