import { Router } from 'express';
import multer from 'multer';
import { autenticado } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/rateLimit.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { idsVisiveisPara, resolverUsuarioAlvo } from '../utils/acesso.js';
import { gerarHashExtrato } from '../utils/financeUtils.js';
import { httpError } from '../utils/http.js';
import { analisarExtratoBancario } from '../services/gemini.service.js';
import { lerPlanilha, ehPlanilha } from '../services/planilha.service.js';
import { carregarCartao, montarLinhas } from '../services/lancamentos.service.js';
import { validar } from '../validators/validate.js';
import { extratoConfigSchema, extratoImportarBodySchema } from '../validators/extrato.schema.js';

const router = Router();

router.use(autenticado);

const TIPOS_IA = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MENSAGEM_FORMATO =
  'Formato não suportado. Envie CSV, XLS, XLSX ou OFX exportado do banco, ou então PDF/foto nítida (JPG, PNG, WEBP).';

// Guardamos o arquivo só em memória (nunca em disco): extrato bancário é
// dado sensível. Assim que os lançamentos são extraídos, o buffer é
// descartado — só os lançamentos validados (e um resumo do lote) vão
// para o banco.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    if (TIPOS_IA.includes(file.mimetype) || ehPlanilha(file.originalname, file.mimetype)) return cb(null, true);
    cb(httpError(400, MENSAGEM_FORMATO));
  },
});

function importacaoParaApi(i) {
  return {
    id: i.id,
    userId: i.user_id,
    nomeArquivo: i.nome_arquivo,
    quantidadeTransacoes: i.quantidade_transacoes,
    quantidadeDuplicadas: i.quantidade_duplicadas,
    status: i.status,
    mensagemErro: i.mensagem_erro,
    importadoPor: i.importado_por,
    createdAt: i.created_at,
  };
}

/** Nome de arquivo seguro para guardar/exibir (sem caminho, sem controle). */
function nomeSeguro(nome) {
  return String(nome || 'extrato').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>]/g, '').slice(0, 200) || 'extrato';
}

async function registrarHistorico(dados) {
  const { error } = await supabaseAdmin.from('extrato_importacoes').insert(dados);
  if (error) console.error('⚠️ Falha ao registrar histórico de importação:', error.message);
}

/** GET /api/extrato/config?userId=... — dia do mês combinado para o envio. */
router.get('/config', async (req, res, next) => {
  try {
    const alvoUserId = await resolverUsuarioAlvo(req, req.query.userId);
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('dia_importacao_extrato')
      .eq('id', alvoUserId)
      .maybeSingle();
    if (error) throw error;
    res.json({ userId: alvoUserId, diaImportacao: data?.dia_importacao_extrato ?? null });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/extrato/config — define o dia do lembrete (cliente: o próprio; staff: do cliente). */
router.put('/config', validar(extratoConfigSchema), async (req, res, next) => {
  try {
    const alvoUserId = await resolverUsuarioAlvo(req, req.body.userId);
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ dia_importacao_extrato: req.body.diaImportacao })
      .eq('id', alvoUserId);
    if (error) throw error;
    res.json({ userId: alvoUserId, diaImportacao: req.body.diaImportacao });
  } catch (err) {
    next(err);
  }
});

/** GET /api/extrato/importacoes?userId=... — histórico de importações. */
router.get('/importacoes', async (req, res, next) => {
  try {
    const { userId } = req.query;

    if (req.profile.role === 'cliente' || userId) {
      const alvoUserId = await resolverUsuarioAlvo(req, userId);
      const { data, error } = await supabaseAdmin
        .from('extrato_importacoes')
        .select('*')
        .eq('user_id', alvoUserId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return res.json((data || []).map(importacaoParaApi));
    }

    const ids = await idsVisiveisPara(req);
    let query = supabaseAdmin.from('extrato_importacoes').select('*').order('created_at', { ascending: false }).limit(50);
    if (ids) query = query.in('user_id', ids);
    const { data, error } = await query;
    if (error) throw error;
    res.json((data || []).map(importacaoParaApi));
  } catch (err) {
    next(err);
  }
});

/**
 * Extrai os lançamentos do arquivo:
 *   1) planilha/OFX -> leitura direta das colunas (rápido, sem IA);
 *   2) se o layout da planilha for irreconhecível -> IA lê o texto;
 *   3) PDF/foto -> IA.
 */
async function extrairLancamentos(file, { ehFatura }) {
  if (ehPlanilha(file.originalname, file.mimetype)) {
    const { transacoes, textoBruto } = lerPlanilha(file.buffer, file.originalname, { ehFatura });
    if (transacoes.length > 0) return { transacoes, metodo: 'planilha' };
    if (!textoBruto.trim()) return { transacoes: [], metodo: 'planilha' };
    const viaIa = await analisarExtratoBancario(Buffer.from(textoBruto, 'utf8'), 'text/plain');
    return { transacoes: viaIa, metodo: 'ia_texto' };
  }
  return { transacoes: await analisarExtratoBancario(file.buffer, file.mimetype), metodo: 'ia' };
}

/**
 * POST /api/extrato/importar
 * multipart/form-data: "arquivo" + opcionais "userId" (staff importando
 * para um cliente) e "cartaoId" (o arquivo é a FATURA desse cartão: cada
 * compra ganha data de competência = dia da compra e data de caixa =
 * vencimento da fatura em que ela caiu).
 */
router.post(
  '/importar',
  sensitiveLimiter,
  (req, res, next) => {
    upload.single('arquivo')(req, res, (err) => {
      if (!err) return next();
      const mensagem = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande. O limite é 12MB.' : err.publicMessage || MENSAGEM_FORMATO;
      return res.status(400).json({ error: mensagem });
    });
  },
  validar(extratoImportarBodySchema),
  async (req, res, next) => {
    try {
      const alvoUserId = await resolverUsuarioAlvo(req, req.body.userId);
      if (!req.file) throw httpError(400, 'Envie o arquivo do extrato.');

      const cartao = await carregarCartao(alvoUserId, req.body.cartaoId);
      const nomeArquivo = nomeSeguro(req.file.originalname);
      const historicoBase = { user_id: alvoUserId, nome_arquivo: nomeArquivo, importado_por: req.userId };

      let extraidas;
      try {
        extraidas = await extrairLancamentos(req.file, { ehFatura: Boolean(cartao) });
      } catch (erroLeitura) {
        await registrarHistorico({
          ...historicoBase,
          status: 'erro',
          mensagem_erro: (erroLeitura.publicMessage || 'Falha ao ler o arquivo.').slice(0, 300),
        });
        throw erroLeitura.status ? erroLeitura : httpError(422, 'Não foi possível ler este arquivo.');
      } finally {
        req.file.buffer = null; // descarta o conteúdo do extrato da memória o quanto antes
      }

      if (extraidas.transacoes.length === 0) {
        await registrarHistorico({ ...historicoBase, status: 'vazio' });
        throw httpError(
          422,
          'Não encontramos nenhum lançamento neste arquivo. Confira se é o extrato/fatura e se as colunas Data, Descrição e Valor estão presentes.'
        );
      }

      const origem = extraidas.metodo === 'planilha' ? 'extrato_planilha' : 'extrato_manual';
      const linhas = extraidas.transacoes.flatMap((t) =>
        montarLinhas({
          userId: alvoUserId,
          data: t.data,
          descricao: t.descricao,
          valor: t.valor,
          categoria: t.categoria,
          categoriaOriginal: t.categoriaOriginal ?? t.categoria ?? null,
          origem,
          cartao,
          extra: {
            extrato_hash: gerarHashExtrato({ userId: alvoUserId, data: t.data, descricao: t.descricao, valor: t.valor }),
          },
        })
      );

      // Dentro do mesmo arquivo pode haver duas linhas idênticas de
      // verdade (ex.: duas passagens de ônibus no mesmo dia e valor).
      // Mantemos as duas, diferenciando o hash pela ocorrência — de forma
      // determinística, para que reenviar o arquivo continue deduplicando.
      const ocorrencias = new Map();
      for (const l of linhas) {
        const n = (ocorrencias.get(l.extrato_hash) || 0) + 1;
        ocorrencias.set(l.extrato_hash, n);
        if (n > 1) l.extrato_hash = `${l.extrato_hash}-${n}`;
      }

      // Deduplicação: nunca grava duas vezes o mesmo lançamento (mesmo
      // arquivo reenviado, ou dois períodos que se sobrepõem).
      const hashes = linhas.map((l) => l.extrato_hash);
      const hashesExistentes = new Set();
      for (let i = 0; i < hashes.length; i += 200) {
        const { data: existentes, error } = await supabaseAdmin
          .from('transacoes')
          .select('extrato_hash')
          .eq('user_id', alvoUserId)
          .in('extrato_hash', hashes.slice(i, i + 200));
        if (error) throw error;
        for (const e of existentes || []) hashesExistentes.add(e.extrato_hash);
      }

      const linhasNovas = linhas.filter((l) => !hashesExistentes.has(l.extrato_hash));
      const quantidadeDuplicadas = linhas.length - linhasNovas.length;

      for (let i = 0; i < linhasNovas.length; i += 200) {
        const { error } = await supabaseAdmin.from('transacoes').insert(linhasNovas.slice(i, i + 200));
        if (error) throw error;
      }

      await registrarHistorico({
        ...historicoBase,
        quantidade_transacoes: linhasNovas.length,
        quantidade_duplicadas: quantidadeDuplicadas,
        status: 'concluido',
      });

      res.json({
        success: true,
        count: linhasNovas.length,
        duplicadas: quantidadeDuplicadas,
        totalLidos: linhas.length,
        metodo: extraidas.metodo,
        cartao: cartao ? cartao.nome : null,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
