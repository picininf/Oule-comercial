import { Router } from 'express';
import { autenticado, requireStaff } from '../middleware/auth.js';
import { resolverUsuarioAlvo, idsVisiveisPara } from '../utils/acesso.js';
import { httpError } from '../utils/http.js';
import { hojeBrasil } from '../utils/financeUtils.js';
import { UFS, FORMAS_TRABALHO, FAIXAS_ETARIAS } from '../utils/perfil.js';
import { gerarDicas, gerarRetrospectiva, compararComPares, analisarSegmentos } from '../services/analises.service.js';

const router = Router();
router.use(autenticado);

const mesesValidos = (v) => [3, 6, 12].includes(Number(v)) ? Number(v) : 3;

/** GET /api/analises/dicas?userId= — Inteligência: comportamento de gastos x planos. */
router.get('/dicas', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    res.json(await gerarDicas(alvo));
  } catch (err) {
    next(err);
  }
});

/** GET /api/analises/retrospectiva?ano=&userId= — Bônus: o ano em números. */
router.get('/retrospectiva', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const anoAtual = Number(hojeBrasil().slice(0, 4));
    const ano = Number(req.query.ano || anoAtual);
    if (!Number.isInteger(ano) || ano < 2000 || ano > anoAtual) throw httpError(400, 'Ano inválido.');
    res.json(await gerarRetrospectiva(alvo, ano));
  } catch (err) {
    next(err);
  }
});

/** GET /api/analises/comparativo?meses=3&userId= — eu x pessoas parecidas (anônimo, grupos >= 5). */
router.get('/comparativo', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    res.json(await compararComPares(alvo, { meses: mesesValidos(req.query.meses) }));
  } catch (err) {
    next(err);
  }
});

/** GET /api/analises/segmentos?meses=&estado=&faixa=&formaTrabalho=&tag= — só equipe. */
router.get('/segmentos', requireStaff, async (req, res, next) => {
  try {
    const { estado, faixa, formaTrabalho, tag } = req.query;
    if (estado && !UFS.includes(estado)) throw httpError(400, 'UF inválida.');
    if (faixa && !FAIXAS_ETARIAS.some((f) => f.id === faixa)) throw httpError(400, 'Faixa etária inválida.');
    if (formaTrabalho && !FORMAS_TRABALHO[formaTrabalho]) throw httpError(400, 'Forma de trabalho inválida.');

    const ids = await idsVisiveisPara(req); // null = todos (oule)
    res.json(await analisarSegmentos(ids, {
      meses: mesesValidos(req.query.meses),
      filtros: { estado, faixa, formaTrabalho, tag: tag ? String(tag).slice(0, 30) : undefined },
    }));
  } catch (err) {
    next(err);
  }
});

export default router;
