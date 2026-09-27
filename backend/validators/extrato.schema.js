import { z } from 'zod';

/**
 * Schema de cada lançamento que a IA (Gemini) extrai de um extrato
 * bancário (PDF ou imagem). Assim como no comprovanteSchema, NUNCA
 * gravamos no banco o que a IA devolve sem validar formato/tipo — um
 * extrato malformado ou uma alucinação da IA não pode virar um valor
 * ou data fora do esperado dentro do banco de dados financeiro.
 */
export const extratoTransacaoSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).'),
  descricao: z.string().trim().min(1).max(200).default('Lançamento sem descrição'),
  valor: z.coerce.number().finite().min(-1_000_000).max(1_000_000),
  tipo: z.enum(['entrada', 'saida']).optional(),
  categoria: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => v || 'Outros')
    .default('Outros'),
});

export const extratoRespostaSchema = z.object({
  transacoes: z.array(extratoTransacaoSchema).max(600),
});

// Body de POST /api/extrato/importar (multipart — o arquivo em si vem
// pelo multer; aqui só validamos os campos de texto que acompanham).
export const extratoImportarBodySchema = z.object({
  userId: z.string().uuid().optional(),
});

// Body de PUT /api/extrato/config
export const extratoConfigSchema = z.object({
  userId: z.string().uuid().optional(),
  diaImportacao: z.coerce.number().int().min(1, 'Escolha um dia entre 1 e 31.').max(31, 'Escolha um dia entre 1 e 31.').nullable(),
});

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
