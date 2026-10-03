import 'dotenv/config';
import { supabaseAdmin } from '../config/supabaseAdmin.js';

/**
 * Cria (ou redefine a senha de) a conta de administrador no Supabase
 * Auth. Rode uma vez com:  npm run admin:criar
 *
 * A conta é reconhecida como admin porque o e-mail bate com ADMIN_EMAIL
 * (ver middleware/auth.js) e é criada já com o e-mail confirmado.
 *
 * SEGURANÇA: esta conta enxerga os dados financeiros de TODOS os
 * clientes. Não existe senha padrão — defina ADMIN_PASSWORD (mínimo 12
 * caracteres, com letras e números) e apague-a do .env depois.
 */

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ADMIN_EMAIL)) {
  console.error('❌ Defina ADMIN_EMAIL no .env com um e-mail válido.');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 12 || !/[A-Za-z]/.test(ADMIN_PASSWORD) || !/\d/.test(ADMIN_PASSWORD)) {
  console.error('❌ Defina ADMIN_PASSWORD no .env com pelo menos 12 caracteres, incluindo letras e números.');
  process.exit(1);
}

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
  console.log('⚠️  Agora apague ADMIN_PASSWORD do .env.');
}

main().catch((err) => {
  console.error('❌ Falha ao criar/atualizar a conta admin:', err.message || err);
  process.exit(1);
});
