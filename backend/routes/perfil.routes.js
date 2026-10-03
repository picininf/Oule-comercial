import { Router } from 'express';
import { z } from 'zod';
import { autenticado } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { resolverUsuarioAlvo } from '../utils/acesso.js';
import { httpError } from '../utils/http.js';
import { idadeEmAnos } from '../utils/financeUtils.js';
import { CATEGORIAS, TIPOS_GASTO } from '../utils/categorias.js';
import {
  FORMAS_TRABALHO, UFS, ESTADOS_CIVIS, FAIXAS_ETARIAS, faixaEtaria, tagsAutomaticas, completudeCadastro,
} from '../utils/perfil.js';
import { validar } from '../validators/validate.js';

const router = Router();
router.use(autenticado);

const COLUNAS = [
  'id', 'codigo_cliente', 'nome', 'telefone', 'banco_conectado', 'role', 'planejador_id',
  'data_nascimento', 'cidade', 'estado', 'pais', 'profissao', 'forma_trabalho', 'renda_mensal',
  'estado_civil', 'dependentes', 'tags', 'observacoes_planejador',
  'lembrete_dias_antecedencia', 'lembrete_whatsapp', 'dia_importacao_extrato', 'updated_at',
].join(', ');

/**
 * GET /api/perfil/opcoes — listas fixas usadas nos formulários
 * (categorias Oule, tipos de gasto, formas de trabalho, UFs...).
 */
router.get('/opcoes', (req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json({
    categorias: CATEGORIAS,
    tiposGasto: Object.values(TIPOS_GASTO),
    formasTrabalho: Object.entries(FORMAS_TRABALHO).map(([id, nome]) => ({ id, nome })),
    ufs: UFS,
    estadosCivis: ESTADOS_CIVIS,
    faixasEtarias: FAIXAS_ETARIAS.map(({ id, nome }) => ({ id, nome })),
  });
});

function paraApi(p, { email, ehStaff }) {
  const faixa = faixaEtaria(p.data_nascimento);
  return {
    id: p.id,
    email,
    codigoCliente: p.codigo_cliente,
    nome: p.nome || '',
    telefone: p.telefone || '',
    bancoConectado: p.banco_conectado || '',
    role: p.role,
    planejadorId: p.planejador_id,
    dataNascimento: p.data_nascimento,
    idade: idadeEmAnos(p.data_nascimento),
    faixaEtaria: faixa?.nome || null,
    cidade: p.cidade || '',
    estado: p.estado || '',
    pais: p.pais || 'Brasil',
    profissao: p.profissao || '',
    formaTrabalho: p.forma_trabalho || '',
    rendaMensal: p.renda_mensal !== null ? Number(p.renda_mensal) : null,
    estadoCivil: p.estado_civil || '',
    dependentes: p.dependentes,
    tags: p.tags || [],
    tagsAutomaticas: tagsAutomaticas(p),
    // Anotações internas da equipe: o cliente não vê.
    observacoesPlanejador: ehStaff ? p.observacoes_planejador || '' : undefined,
    lembreteDiasAntecedencia: p.lembrete_dias_antecedencia,
    lembreteWhatsapp: p.lembrete_whatsapp,
    diaImportacaoExtrato: p.dia_importacao_extrato,
    completude: completudeCadastro(p),
    atualizadoEm: p.updated_at,
  };
}

async function emailDe(userId) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email || '';
}

/** GET /api/perfil?userId= */
router.get('/', async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.query.userId);
    const { data, error } = await supabaseAdmin.from('profiles').select(COLUNAS).eq('id', alvo).maybeSingle();
    if (error) throw error;
    if (!data) throw httpError(404, 'Perfil não encontrado.');
    const email = alvo === req.userId ? req.userEmail : await emailDe(alvo);
    res.json(paraApi(data, { email, ehStaff: req.profile.role !== 'cliente' }));
  } catch (err) {
    next(err);
  }
});

const textoOpcional = (max) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

const perfilSchema = z.object({
  userId: z.string().uuid().optional(),
  nome: z.string().trim().min(2, 'Informe o nome completo.').max(120).optional(),
  telefone: z.string().trim().max(30).regex(/^[\d\s()+-]*$/, 'Telefone inválido.').optional(),
  bancoConectado: textoOpcional(60),
  dataNascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida.')
    .refine((d) => idadeEmAnos(d) !== null && idadeEmAnos(d) <= 110, 'Data de nascimento inválida.')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  cidade: textoOpcional(80),
  estado: z.enum(UFS).optional().nullable().or(z.literal('').transform(() => null)),
  pais: textoOpcional(60),
  profissao: textoOpcional(80),
  formaTrabalho: z.enum(Object.keys(FORMAS_TRABALHO)).optional().nullable().or(z.literal('').transform(() => null)),
  rendaMensal: z.coerce.number().finite().min(0).max(100_000_000).optional().nullable(),
  estadoCivil: z.enum(ESTADOS_CIVIS).optional().nullable().or(z.literal('').transform(() => null)),
  dependentes: z.coerce.number().int().min(0).max(20).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  observacoesPlanejador: textoOpcional(2000),
  lembreteDiasAntecedencia: z.coerce.number().int().min(0).max(15).optional(),
  lembreteWhatsapp: z.boolean().optional(),
});

const MAPA = {
  nome: 'nome',
  telefone: 'telefone',
  bancoConectado: 'banco_conectado',
  dataNascimento: 'data_nascimento',
  cidade: 'cidade',
  estado: 'estado',
  pais: 'pais',
  profissao: 'profissao',
  formaTrabalho: 'forma_trabalho',
  rendaMensal: 'renda_mensal',
  estadoCivil: 'estado_civil',
  dependentes: 'dependentes',
  tags: 'tags',
  lembreteDiasAntecedencia: 'lembrete_dias_antecedencia',
  lembreteWhatsapp: 'lembrete_whatsapp',
};

/** PUT /api/perfil — o próprio cliente ou a equipe responsável por ele. */
router.put('/', validar(perfilSchema), async (req, res, next) => {
  try {
    const alvo = await resolverUsuarioAlvo(req, req.body.userId);
    const ehStaff = req.profile.role !== 'cliente';
    const payload = { updated_at: new Date().toISOString() };

    for (const [campoApi, coluna] of Object.entries(MAPA)) {
      if (req.body[campoApi] !== undefined) payload[coluna] = req.body[campoApi];
    }
    if (payload.tags) payload.tags = [...new Set(payload.tags.map((t) => t.trim()))];
    if (ehStaff && req.body.observacoesPlanejador !== undefined) {
      payload.observacoes_planejador = req.body.observacoesPlanejador;
    }

    const { data, error } = await supabaseAdmin.from('profiles').update(payload).eq('id', alvo).select(COLUNAS).single();
    if (error) throw error;

    const email = alvo === req.userId ? req.userEmail : await emailDe(alvo);
    res.json(paraApi(data, { email, ehStaff }));
  } catch (err) {
    next(err);
  }
});

export default router;
