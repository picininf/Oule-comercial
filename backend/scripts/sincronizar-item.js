/**
 * Força a sincronização de uma conexão do Open Finance (útil para
 * suporte/depuração).
 *
 * Uso: npm run sync:item -- <itemId>
 */
import 'dotenv/config';

const itemId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(itemId || '')) {
  console.error('Uso: npm run sync:item -- <itemId da Pluggy>');
  process.exit(1);
}

const { supabaseAdmin } = await import('../config/supabaseAdmin.js');
const { sincronizarTransacoesDoItem } = await import('../services/pluggy.service.js');

const { data, error } = await supabaseAdmin.from('open_finance_items').select('user_id').eq('item_id', itemId).maybeSingle();
if (error || !data) {
  console.error('❌ Item não encontrado em open_finance_items.', error?.message || '');
  process.exit(1);
}

console.log(`⏳ Sincronizando item ${itemId}...`);
const resultado = await sincronizarTransacoesDoItem(itemId, data.user_id);
console.log('✅ Concluído:', resultado);
process.exit(0);
