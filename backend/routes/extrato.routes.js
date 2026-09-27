import { Router } from 'express';
import multer from 'multer';
import { requireAuth, attachProfile } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/rateLimit.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { idsVisiveisPara, resolverUsuarioAlvo } from '../utils/acesso.js';
import { gerarHashExtrato } from '../utils/financeUtils.js';
import { analisarExtratoBancario } from '../services/gemini.service.js';
import { validarBody, extratoConfigSchema } from '../validators/extrato.schema.js';

const router = Router();

router.use(requireAuth, attachProfile);

// Guardamos o arquivo só em memória (nunca em disco): um extrato bancário
// é dado sensível, e o disco do Render é efêmero e não criptografado por
// nós. Assim que a IA extrai os lançamentos, o buffer é descartado — só
// os lançamentos validados (e um resumo do lote) vão para o banco.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB
  fileFilter: (req, file, cb) => {
    const tiposAceitos = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!tiposAceitos.includes(file.mimetype)) {
      return cb(new Error('Formato não suportado. Envie um PDF ou uma foto/print nítida do extrato (JPG, PNG ou WEBP).'));
    }
    cb(null, true);
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

/**
 * GET /api/extrato/config?userId=...
 * Devolve o dia do mês combinado para a importação do extrato (definido
 * pelo planejador, ou pela própria pessoa quando ela não tem planejador).
 */
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

/**
 * PUT /api/extrato/config
 * Define/alterar o dia do mês do lembrete de importação. Cliente comum
 * só ajusta o próprio; planejador/oule podem ajustar o de um cliente
 * sob sua responsabilidade (garantirAcesso cuida disso).
 */
router.put('/config', validarBody(extratoConfigSchema), async (req, res, next) => {
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

/**
 * GET /api/extrato/importacoes?userId=...
 * Histórico de importações (para a pessoa acompanhar o que já foi
 * processado e quando). Sem userId, staff vê o histórico agregado do
 * seu escopo (planejador: seus clientes; oule: todos).
 */
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
 * POST /api/extrato/importar
 * multipart/form-data: campo "arquivo" (PDF ou imagem) + opcional
 * "userId" (só usado por staff, para importar em nome de um cliente).
 *
 * Fluxo: valida acesso -> lê o arquivo com a IA -> valida cada
 * lançamento com zod -> descarta o que já existe (mesmo hash) -> grava
 * só os lançamentos novos -> registra o resultado no histórico.
 */
router.post(
  '/importar',
  sensitiveLimiter,
  (req, res, next) => {
    upload.single('arquivo')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Falha ao processar o arquivo enviado.' });
      next();
    });
  },
  async (req, res, next) => {
    try {
      const alvoUserId = await resolverUsuarioAlvo(req, req.body.userId);

      if (!req.file) {
        return res.status(400).json({ error: 'Envie o extrato em PDF, JPG, PNG ou WEBP.' });
      }

      let transacoesExtraidas;
      try {
        transacoesExtraidas = await analisarExtratoBancario(req.file.buffer, req.file.mimetype);
      } catch (erroIa) {
        await supabaseAdmin.from('extrato_importacoes').insert({
          user_id: alvoUserId,
          nome_arquivo: req.file.originalname?.slice(0, 200) || 'extrato',
          quantidade_transacoes: 0,
          quantidade_duplicadas: 0,
          status: 'erro',
          mensagem_erro: erroIa.message?.slice(0, 300) || 'Falha ao ler o extrato.',
          importado_por: req.userId,
        });
        return res.status(422).json({ error: erroIa.message || 'Não foi possível ler este extrato.' });
      }

      if (transacoesExtraidas.length === 0) {
        await supabaseAdmin.from('extrato_importacoes').insert({
          user_id: alvoUserId,
          nome_arquivo: req.file.originalname?.slice(0, 200) || 'extrato',
          quantidade_transacoes: 0,
          quantidade_duplicadas: 0,
          status: 'vazio',
          importado_por: req.userId,
        });
        return res.status(422).json({ error: 'Não encontramos nenhum lançamento legível neste arquivo. Tente um PDF exportado direto do banco ou uma foto mais nítida.' });
      }

      const linhas = transacoesExtraidas.map((t) => {
        const hash = gerarHashExtrato({ userId: alvoUserId, data: t.data, descricao: t.descricao, valor: t.valor });
        return {
          user_id: alvoUserId,
          descricao: t.descricao,
          valor: t.valor,
          tipo: t.valor < 0 ? 'despesa' : 'receita',
          categoria: t.categoria || 'Outros',
          data_transacao: t.data,
          origem: 'extrato_manual',
          extrato_hash: hash,
        };
      });

      // Deduplicação: nunca grava duas vezes o mesmo lançamento (mesmo
      // que a pessoa reenvie o mesmo extrato, ou dois arquivos que se
      // sobrepõem em alguns dias).
      const hashes = linhas.map((l) => l.extrato_hash);
      const { data: existentes, error: erroExistentes } = await supabaseAdmin
        .from('transacoes')
        .select('extrato_hash')
        .eq('user_id', alvoUserId)
        .in('extrato_hash', hashes);
      if (erroExistentes) throw erroExistentes;

      const hashesExistentes = new Set((existentes || []).map((e) => e.extrato_hash));
      const linhasNovas = linhas.filter((l) => !hashesExistentes.has(l.extrato_hash));
      const quantidadeDuplicadas = linhas.length - linhasNovas.length;

      if (linhasNovas.length > 0) {
        const { error: erroInsert } = await supabaseAdmin.from('transacoes').insert(linhasNovas);
        if (erroInsert) throw erroInsert;
      }

      await supabaseAdmin.from('extrato_importacoes').insert({
        user_id: alvoUserId,
        nome_arquivo: req.file.originalname?.slice(0, 200) || 'extrato',
        quantidade_transacoes: linhasNovas.length,
        quantidade_duplicadas: quantidadeDuplicadas,
        status: 'concluido',
        importado_por: req.userId,
      });

      res.json({
        success: true,
        count: linhasNovas.length,
        duplicadas: quantidadeDuplicadas,
        totalLidos: linhas.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
