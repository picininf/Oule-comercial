# Atualização — Metas (categoria) + Importar Extrato

## 1. Correção: "adicionar categoria" em Criar Meta

Em `frontend/src/pages/ObjetivosPage.jsx`, o seletor de categoria da meta
agora tem um chip **"+ Nova categoria"**: clicar nele abre um campo de
texto para digitar um nome livre, que é adicionado à lista e já fica
selecionado. Antes só existiam as 8 categorias fixas e não havia nenhuma
forma de criar uma nova — por isso "nada acontecia".

Categorias personalizadas usadas em metas antigas também aparecem
automaticamente no seletor ao editar (não ficam "escondidas").

## 2. Nova aba: Importar Extrato

Alternativa manual ao Open Finance (que continua exatamente como estava).
A pessoa envia o PDF (ou uma foto/print) do extrato mensal; a IA (Gemini,
já usada no bot do WhatsApp) lê os lançamentos e grava direto nas
transações do usuário, sem duplicar caso o mesmo extrato seja reenviado.

- **Cliente:** nova aba "📄 Importar Extrato" na barra lateral — envia o
  arquivo, define/edita o dia do mês do lembrete e vê o histórico de
  importações.
- **Planejador/Oule:** a mesma tela aparece dentro de "Usuários → ver
  detalhes do cliente", para importar em nome dele e combinar o dia do
  mês (é isso que atende ao "dia escolhido pelo planejador da pessoa").
- **Privacidade:** o arquivo do extrato é lido em memória e descartado —
  só o resultado (nome do arquivo, quantidade de lançamentos, status) fica
  salvo no histórico. O extrato em si nunca é salvo em disco.

## 3. Passos obrigatórios antes de rodar

1. **Backend:** `npm install` (foi adicionada a dependência `multer` para
   o upload do arquivo).
2. **Banco (Supabase):** rode `backend/sql/schema_v3_extrato.sql` no SQL
   Editor — ele cria a tabela `extrato_importacoes`, a coluna
   `dia_importacao_extrato` em `profiles` e as colunas `origem` /
   `extrato_hash` em `transacoes` (com o índice de deduplicação).
3. **Variável de ambiente:** confirme que `GEMINI_API_KEY` está definida
   no Render (o `.env.example` já foi atualizado — antes essa variável
   nem estava documentada, apesar de já ser usada pelo bot do WhatsApp).
4. **Frontend:** rode `npm install && npm run build` normalmente — o
   `dist/` antigo foi removido deste pacote por estar desatualizado em
   relação a estas mudanças.

## 4. Arquivos novos/alterados (resumo técnico)

**Backend**
- `routes/extrato.routes.js` (novo) — upload, config do dia, histórico
- `services/gemini.service.js` — nova função `analisarExtratoBancario()`
- `validators/extrato.schema.js` (novo)
- `utils/financeUtils.js` — novo helper `gerarHashExtrato()`
- `sql/schema_v3_extrato.sql` (novo)
- `server.js`, `package.json`, `.env.example` — registrados/atualizados

**Frontend**
- `pages/ImportarExtratoPage.jsx` (novo)
- `pages/ObjetivosPage.jsx` — categoria personalizada
- `components/Sidebar.jsx`, `App.jsx`, `pages/admin/AdminUsuariosPage.jsx`
- `lib/api.js` — novo helper `uploadApi()` (multipart)
- `App.css` — estilos do chip de nova categoria e da área de upload
