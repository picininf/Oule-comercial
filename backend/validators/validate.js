import { z } from 'zod';

/**
 * Mensagens de validação em português para os erros que não têm texto
 * próprio no schema (o padrão do zod é inglês: "Invalid uuid",
 * "Required"...), já que elas chegam até a tela do usuário.
 */
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' ? 'Campo obrigatório não informado.' : 'Formato de dado inválido.' };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'uuid') return { message: 'Identificador inválido.' };
      if (issue.validation === 'url') return { message: 'Endereço (URL) inválido.' };
      if (issue.validation === 'email') return { message: 'E-mail inválido.' };
      return { message: 'Formato inválido.' };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Opção inválida.' };
    case z.ZodIssueCode.too_small:
      return { message: issue.type === 'string' ? 'Texto muito curto.' : issue.type === 'array' ? 'Lista vazia.' : 'Valor abaixo do mínimo permitido.' };
    case z.ZodIssueCode.too_big:
      return { message: issue.type === 'string' ? 'Texto muito longo.' : issue.type === 'array' ? 'Itens demais.' : 'Valor acima do máximo permitido.' };
    case z.ZodIssueCode.not_finite:
      return { message: 'Número inválido.' };
    default:
      return { message: ctx.defaultError };
  }
});

/**
 * Validação única (zod) para body, query ou params. Em caso de sucesso,
 * troca o objeto da requisição pela versão já convertida/limpa pelo zod
 * (coerce, trim, defaults).
 */
export function validar(schema, origem = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[origem]);
    if (!result.success) {
      const flat = result.error.flatten();
      const primeiraMensagem =
        Object.values(flat.fieldErrors).flat()[0] || flat.formErrors[0] || 'Dados inválidos.';
      return res.status(400).json({ error: primeiraMensagem, detalhes: flat });
    }
    req[origem] = result.data;
    next();
  };
}

export const validarBody = (schema) => validar(schema, 'body');
