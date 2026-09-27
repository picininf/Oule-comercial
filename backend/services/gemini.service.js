import { GoogleGenerativeAI } from '@google/generative-ai';
import { comprovanteSchema } from '../validators/schemas.js';
import { extratoRespostaSchema } from '../validators/extrato.schema.js';

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
  "categoria": "Salário | Alimentação | Transporte | Serviços | Lazer | Outros",
  "metodo_pagamento": "Pix | Cartão | Boleto | Dinheiro"
}
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
      "categoria": "Alimentação | Transporte | Moradia | Saúde | Educação | Lazer | Compras | Serviços | Salário | Investimento | Transferência | Outros"
    }
  ]
}

Regras OBRIGATÓRIAS:
- "valor" é sempre negativo para saídas/débitos/compras e positivo para entradas/créditos/depósitos.
- "tipo" deve ser "saida" quando valor < 0 e "entrada" quando valor > 0.
- Se o extrato não informar o ano, assuma o ano mais recente coerente com o contexto do documento.
- Nunca invente lançamentos que não estão no documento. Se não conseguir ler nenhum lançamento, retorne {"transacoes": []}.
- Escolha a categoria mais próxima da lista acima; se nenhuma encaixar bem, use "Outros".
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
 * Analisa um comprovante com a IA e SEMPRE valida a saída com zod antes
 * de devolver. Uma alucinação da IA (categoria fora da lista, valor
 * absurdo, string maliciosa) nunca chega "crua" ao banco de dados.
 */
export async function analisarComprovante(buffer, mimeType = 'image/jpeg') {
  const imagePart = { inlineData: { data: buffer.toString('base64'), mimeType } };

  let result;
  try {
    result = await chamarComRetry(primaryModel, [PROMPT_COMPROVANTE, imagePart]);
  } catch (err) {
    console.warn('⚠️ Falha no modelo principal do Gemini, tentando fallback...');
    result = await chamarComRetry(fallbackModel, [PROMPT_COMPROVANTE, imagePart]);
  }

  const response = await result.response;
  const textoLimpo = response.text().replace(/```json/gi, '').replace(/```/g, '').trim();

  let bruto;
  try {
    bruto = JSON.parse(textoLimpo);
  } catch (err) {
    throw new Error('A IA não retornou um JSON válido para este comprovante.');
  }

  const validado = comprovanteSchema.safeParse(bruto);
  if (!validado.success) {
    throw new Error('Dados extraídos do comprovante estão fora do formato esperado.');
  }

  return validado.data;
}

/**
 * Analisa um extrato bancário (PDF ou imagem) com a IA e SEMPRE valida
 * a saída com zod antes de devolver — mesma filosofia de
 * analisarComprovante(): uma alucinação da IA nunca chega "crua" ao
 * banco de dados financeiro da pessoa.
 */
export async function analisarExtratoBancario(buffer, mimeType = 'application/pdf') {
  const filePart = { inlineData: { data: buffer.toString('base64'), mimeType } };

  let result;
  try {
    result = await chamarComRetry(extratoModel, [PROMPT_EXTRATO, filePart]);
  } catch (err) {
    console.warn('⚠️ Falha no modelo principal do Gemini para extrato, tentando fallback...');
    result = await chamarComRetry(extratoFallbackModel, [PROMPT_EXTRATO, filePart]);
  }

  const response = await result.response;
  const textoLimpo = response.text().replace(/```json/gi, '').replace(/```/g, '').trim();

  if (!textoLimpo) {
    const finishReason = response.candidates?.[0]?.finishReason;
    console.error('⚠️ Gemini devolveu resposta vazia ao ler extrato.', {
      finishReason,
      usage: response.usageMetadata,
    });
  }

  let bruto;
  try {
    bruto = JSON.parse(textoLimpo);
  } catch (err) {
    throw new Error('A IA não retornou um JSON válido para este extrato. Tente novamente ou envie um arquivo mais legível.');
  }

  const validado = extratoRespostaSchema.safeParse(bruto);
  if (!validado.success) {
    throw new Error('Os lançamentos extraídos do extrato estão fora do formato esperado.');
  }

  return validado.data.transacoes;
}

export function calcularValorPelaCategoria(categoria, valorBruto) {
  const cat = (categoria || '').toLowerCase();
  const isSalario = cat.includes('salário') || cat.includes('salario');
  const valorNumerico = Math.abs(Number(valorBruto) || 0);
  return isSalario ? valorNumerico : -valorNumerico;
}
