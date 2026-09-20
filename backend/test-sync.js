import 'dotenv/config';
import { sincronizarTransacoesDoItem } from './services/pluggy.service.js';
import { supabaseAdmin } from './config/supabaseAdmin.js';

async function rodarTeste() {
  const itemId = '2614117c-814d-49d2-bb5a-917328c7063e';
  
  // Busca o user_id associado a esse item na tabela open_finance_items
  const { data: itemData, error } = await supabaseAdmin
    .from('open_finance_items')
    .select('user_id')
    .eq('item_id', itemId)
    .single();

  if (error || !itemData) {
    console.error('❌ Item não encontrado no Supabase:', error?.message);
    return;
  }

  console.log(`⏳ Sincronizando transações para o usuário ${itemData.user_id}...`);
  try {
    const resultado = await sincronizarTransacoesDoItem(itemId, itemData.user_id);
    console.log('✅ Sincronização concluída com sucesso!', resultado);
  } catch (err) {
    console.error('❌ Erro na sincronização:', err.message);
  }
}

rodarTeste();