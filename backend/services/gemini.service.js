import { GoogleGenerativeAI } from '@google/generative-ai';
import { comprovanteSchema } from '../validators/schemas.js';
import { extratoRespostaSchema } from '../validators/extrato.schema.js';
import { CATEGORIA_IDS } from '../utils/categorias.js';
import { httpError } from '../utils/http.js';

const LISTA_CATEGORIAS = CATEGORIA_IDS.join(' | ');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// IMPORTANTE: os modelos "2.5"/"3.5" fazem "thinking" (raciocínio interno)
// por padrão, e esses tokens de raciocínio SAEM do mesmo orçamento de
// maxOutputTokens da resposta. Sem thinkingConfig.thinkingBudget = 0, o
// modelo pode gastar o budget inteiro "pensando" e devolver texto vazio
// (finishReason MAX_TOKENS, response.text() === ''), o que quebra o
// JSON.parse abaixo com "A IA não retornou um JSON válido" — mesmo com a
// leitura funcionando perfeitamente do lado do Gemini. Como aqui é só
// extração estruturada (sem necessidade de raciocínio), desligamos o
// thinking em todos os modelos.
const primaryModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    maxOutputTokens: 8192,
    thinkingConfig: { thinkingBudget: 0 },
  },
});

const fallbackModel = genAI.getGenerativeModel({
  model: 'gemini-3.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    maxOutputTokens: 8192,
    thinkingConfig: { thinkingBudget: 0 },
  },
});

// Modelo dedicado à leitura de extratos: mesmo prompt em JSON mode, mas
// com um teto de saída bem mais alto — um extrato mensal pode ter
// centenas de linhas, diferente de um comprovante único. Sem thinking
// desligado, esse era justamente o modelo mais afetado pelo bug acima.
const extratoModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    maxOutputTokens: 32768,
    thinkingConfig: { thinkingBudget: 0 },
  },
});

const extratoFallbackModel = genAI.getGenerativeModel({
  model: 'gemini-3.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    maxOutputTokens: 32768,
    thinkingConfig: { thinkingBudget: 0 },
  },
});

const PROMPT_COMPROVANTE = `Analise este comprovante de pagamento ou nota fiscal e retorne EXATAMENTE um JSON válido no formato:
{
  "estabelecimento": "Nome da empresa/recebedor",
  "valor": 0.00,
  "data": "AAAA-MM-DD",
  "categoria": "${LISTA_CATEGORIAS}",
  "metodo_pagamento": "Pix | Cartão | Boleto | Dinheiro"
}
Regras de categoria:
- Pix, TED ou transferência para OUTRA pessoa ou empresa é um pagamento: escolha a categoria pelo que provavelmente foi pago (ou "Outros"), NUNCA "Transferências".
- Use "Transferências" somente quando pagador e recebedor forem a MESMA pessoa (mesmo nome/CPF) ou for pagamento da fatura do próprio cartão.
Responda APENAS o JSON bruto sem formatação Markdown extra. Não inclua nenhum texto fora do JSON.`;

const PROMPT_EXTRATO = `Você é um leitor especializado em extratos bancários e faturas de cartão brasileiros (PDF ou foto/print). Extraia TODOS os lançamentos (débitos e créditos) visíveis no documento, ignorando saldo, cabeçalho, rodapé e totalizadores.

Retorne EXATAMENTE um JSON válido no formato:
{
  "transacoes": [
    {
      "data": "AAAA-MM-DD",
      "descricao": "Descrição/estabelecimento exatamente como aparece",
      "valor": -123.45,
      "tipo": "entrada | saida",
      "categoria": "${LISTA_CATEGORIAS}"
    }
  ]
}

Regras OBRIGATÓRIAS:
- "valor" é sempre negativo para saídas/débitos/compras e positivo para entradas/créditos/depósitos.
- "tipo" deve ser "saida" quando valor < 0 e "entrada" quando valor > 0.
- Se o extrato não informar o ano, assuma o ano mais recente coerente com o contexto do documento.
- Nunca invente lançamentos que não estão no documento. Se não conseguir ler nenhum lançamento, retorne {"transacoes": []}.
- Escolha a categoria mais próxima da lista acima; se nenhuma encaixar bem, use "Outros".
- Pagamento da própria fatura do cartão e transferência entre contas da mesma pessoa são "Transferências".
- Em FATURA de cartão, compras são saídas (valor negativo) e o pagamento da fatura é "Transferências".
- Responda APENAS o JSON bruto, sem Markdown, sem comentários, sem texto fora do JSON.`;

async function chamarComRetry(model, payload, maxRetries = 2) {
  for (let tentativa = 1; tentativa <= maxRetries; tentativa++) {
    try {
      return await model.generateContent(payload);
    } catch (error) {
      const isRateLimit = error.message?.includes('429') || error.status === 429;
      const isUnavailable = error.message?.includes('503') || error.status === 503;

      if ((isRateLimit || isUnavailable) && tentativa < maxRetries) {
        const espera = isRateLimit ? 10000 : 3000;
        console.warn(`⏳ Gemini instável. Aguardando ${espera / 1000}s para retry...`);
        await new Promise((r) => setTimeout(r, espera));
      } else {
        throw error;
      }
    }
  }
}

/**
 * Chama o modelo principal e, se falhar, o de reserva. Qualquer falha de
 * infraestrutura (cota, rede, chave ausente) vira um erro com mensagem
 * pública genérica — a mensagem interna do Google fica só no log.
 */
async function gerarComFallback(principal, reserva, partes, contexto) {
  if (!process.env.GEMINI_API_KEY) {
    throw httpError(503, 'A leitura com IA não está configurada no servidor. Use um arquivo CSV, XLS, XLSX ou OFX.');
  }
  try {
    return await chamarComRetry(principal, partes);
  } catch (errPrincipal) {
    console.warn(`⚠️ Falha no modelo principal do Gemini (${contexto}), tentando fallback...`, errPrincipal.message);
    try {
      return await chamarComRetry(reserva, partes);
    } catch (errReserva) {
      console.error(`❌ Gemini indisponível (${contexto}):`, errReserva.message);
      throw httpError(503, 'O serviço de leitura com IA está indisponível agora. Tente novamente em alguns minutos.');
    }
  }
}

function lerJsonDaResposta(response, mensagemErro) {
  const textoLimpo = response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
  if (!textoLimpo) {
    console.error('⚠️ Gemini devolveu resposta vazia.', {
      finishReason: response.candidates?.[0]?.finishReason,
      usage: response.usageMetadata,
    });
  }
  try {
    return JSON.parse(textoLimpo);
  } catch {
    throw httpError(422, mensagemErro);
  }
}

/**
 * Analisa um comprovante com a IA e SEMPRE valida a saída com zod antes
 * de devolver. Uma alucinação da IA (categoria fora da lista, valor
 * absurdo, string maliciosa) nunca chega "crua" ao banco de dados.
 */
export async function analisarComprovante(buffer, mimeType = 'image/jpeg') {
  const imagePart = { inlineData: { data: buffer.toString('base64'), mimeType } };
  const result = await gerarComFallback(primaryModel, fallbackModel, [PROMPT_COMPROVANTE, imagePart], 'comprovante');
  const bruto = lerJsonDaResposta(await result.response, 'A IA não conseguiu ler este comprovante.');

  const validado = comprovanteSchema.safeParse(bruto);
  if (!validado.success) {
    throw httpError(422, 'Dados extraídos do comprovante estão fora do formato esperado.');
  }
  return validado.data;
}

/**
 * Analisa um extrato bancário ou fatura (PDF, imagem ou texto de
 * planilha com layout desconhecido) com a IA e SEMPRE valida a saída com
 * zod antes de devolver.
 */
export async function analisarExtratoBancario(buffer, mimeType = 'application/pdf') {
  const filePart = { inlineData: { data: buffer.toString('base64'), mimeType } };
  const result = await gerarComFallback(extratoModel, extratoFallbackModel, [PROMPT_EXTRATO, filePart], 'extrato');
  const bruto = lerJsonDaResposta(
    await result.response,
    'A IA não conseguiu ler este extrato. Tente novamente ou envie um arquivo mais legível (de preferência CSV/XLS/OFX exportado do banco).'
  );

  const validado = extratoRespostaSchema.safeParse(bruto);
  if (!validado.success) {
    throw httpError(422, 'Os lançamentos extraídos do extrato estão fora do formato esperado.');
  }
  return validado.data.transacoes;
}

export function calcularValorPelaCategoria(categoria, valorBruto) {
  const cat = (categoria || '').toLowerCase();
  const isSalario = cat.includes('salário') || cat.includes('salario');
  const valorNumerico = Math.abs(Number(valorBruto) || 0);
  return isSalario ? valorNumerico : -valorNumerico;
}
