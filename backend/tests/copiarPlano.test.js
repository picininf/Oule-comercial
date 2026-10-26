/**
 * "Copiar para todos os meses seguintes": cópia em lote, reajuste por ano
 * e respeito aos meses que já têm plano.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarSupabaseFalso } from './supabaseFalso.js';

const U = 'usuario-copia';
const banco = criarSupabaseFalso({
  plano_mensal: [
    { user_id: U, mes: '2026-10', categoria: 'Salário', valor_planejado: 5000 },
    { user_id: U, mes: '2026-10', categoria: 'Moradia', valor_planejado: 1000 },
    { user_id: U, mes: '2027-03', categoria: 'Moradia', valor_planejado: 1 },
  ],
});
mock.module('../config/supabaseAdmin.js', { namedExports: { supabaseAdmin: banco } });
mock.module('../middleware/auth.js', { namedExports: { autenticado: (req, _res, next) => { req.userId = U; req.profile = { role: 'cliente' }; next(); } } });
mock.module('../utils/acesso.js', { namedExports: { resolverUsuarioAlvo: async () => U } });
const { default: rotas } = await import('../routes/plano.routes.js');

const app = express();
app.use(express.json());
app.use('/plano', rotas);
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));

async function copiar(corpo) {
  const servidor = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${servidor.address().port}/plano/orcamento/copiar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    return { status: r.status, corpo: await r.json() };
  } finally {
    servidor.close();
  }
}

const destinos = [];
for (let a = 2026, m = 11; a < 2029 || m <= 12;) {
  destinos.push(`${a}-${String(m).padStart(2, '0')}`);
  if (a === 2028 && m === 12) break;
  m += 1; if (m > 12) { m = 1; a += 1; }
}

test('copia para todos os meses seguintes com reajuste por ano, sem tocar nos que já têm plano', async () => {
  const r = await copiar({ origem: '2026-10', destinos, reajustePct: 10, reajusteAnual: true, sobrescrever: false });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.copiados, destinos.length - 1);
  const linhas = (await banco.from('plano_mensal').select('*').eq('user_id', U)).data;
  const de = (mes, cat) => linhas.find((l) => l.mes === mes && l.categoria === cat)?.valor_planejado;
  assert.equal(de('2026-12', 'Moradia'), 1000);
  assert.equal(de('2027-01', 'Moradia'), 1100);
  assert.equal(de('2028-12', 'Salário'), 6050);
  assert.equal(de('2027-03', 'Moradia'), 1); // já tinha plano: mantido
});
