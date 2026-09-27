import 'dotenv/config';
import { supabaseAdmin } from '../config/supabaseAdmin.js';

/**
 * Script único para criar (ou atualizar a senha de) a conta de
 * administrador no Supabase Auth. Rode uma vez com:
 *
 *   cd backend && node scripts/create-admin-user.js
 *
 * A conta criada aqui é reconhecida como admin pelo backend porque o
 * e-mail dela bate com ADMIN_EMAIL (ver backend/middleware/auth.js).
 * Nenhum papel/flag precisa ser cadastrado em outra tabela.
 *
 * ⚠️ SEGURANÇA: a senha padrão abaixo (12345678) é fraca de propósito
 * apenas para você conseguir entrar pela primeira vez. Esta conta tem
 * acesso de leitura aos dados financeiros de TODOS os usuários — troque
 * a senha assim que possível (Supabase Studio → Authentication → Users
 * → selecione o admin → "Reset password", ou rode este script de novo
 * com outra senha na variável ADMIN_PASSWORD).
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '12345678';

async function main() {
  const { data: existentes, error: erroListagem } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (erroListagem) throw erroListagem;

  const jaExiste = existentes.users.find((u) => (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase());

  if (jaExiste) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(jaExiste.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`✅ Conta admin já existia (${ADMIN_EMAIL}). Senha atualizada.`);
    return;
  }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { nome: 'Administrador' },
  });
  if (error) throw error;

  console.log(`✅ Conta admin criada: ${ADMIN_EMAIL}`);
  console.log('⚠️  Troque a senha padrão assim que possível.');
}

main().catch((err) => {
  console.error('❌ Falha ao criar/atualizar a conta admin:', err.message || err);
  process.exit(1);
});
