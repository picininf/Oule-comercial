import { GoogleGenerativeAI } from '@google/generative-ai';
import { comprovanteSchema } from '../validators/schemas.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const primaryModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { responseMimeType: 'application/json' },
});

const fallbackModel = genAI.getGenerativeModel({
  model: 'gemini-3.5-flash',
  generationConfig: { responseMimeType: 'application/json' },
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

export function calcularValorPelaCategoria(categoria, valorBruto) {
  const cat = (categoria || '').toLowerCase();
  const isSalario = cat.includes('salário') || cat.includes('salario');
  const valorNumerico = Math.abs(Number(valorBruto) || 0);
  return isSalario ? valorNumerico : -valorNumerico;
}
