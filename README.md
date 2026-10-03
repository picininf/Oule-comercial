# Oule | App — planejamento financeiro com planejador

App de gestão financeira pessoal acompanhada por um **planejador financeiro**:
Open Finance (Pluggy), importação de extratos (CSV/XLS/XLSX/OFX/PDF/foto),
cartões com faturas nas datas certas, plano anual e dos próximos anos,
sonhos, aposentadoria/liberdade financeira, pagamentos do mês com lembretes
e assistente no WhatsApp.

> 📱 App Android (Capacitor): veja **[README-ANDROID.md](./README-ANDROID.md)**.
> 🆕 O que mudou nesta versão (cartão por cartão do Trello): **[ATUALIZACOES.md](./ATUALIZACOES.md)**.

## Estrutura

```
backend/            API Node/Express (Supabase service_role, Pluggy, Gemini, WhatsApp)
  config/           cliente Supabase e conferência das variáveis de ambiente
  middleware/       autenticação/papéis, CORS, rate limit, erros (com request id)
  routes/           uma rota por área (transacoes, plano, cartoes, pagamentos, analises...)
  services/         regras de negócio (plano, projeção, faturas, planilhas, lembretes...)
  utils/            categorias Oule, fatura, datas, acesso por papel
  validators/       schemas zod (mensagens em português)
  sql/              migrações do Supabase (rode em ordem: v1 → v4)
  scripts/          admin, webhook, normalização de categorias, sync manual
  tests/            testes automatizados (npm test)
frontend/           React + Vite + Capacitor
  src/pages/        uma página por aba (cliente) e pages/admin (equipe)
  src/components/   UI compartilhada (modal, toasts, tabela, exportação...)
  src/lib/          API, categorias, formatação, exportação (CSV/Excel/PDF/PNG)
```

## Como rodar

### 1. Banco de dados (Supabase)

No SQL Editor do Supabase, rode **em ordem** (todos podem ser rodados de novo
sem quebrar nada):

1. `backend/sql/schema.sql`
2. `backend/sql/schema_v2_roles.sql`
3. `backend/sql/schema_v3_extrato.sql`
4. `backend/sql/schema_v4_oule.sql` ← **novo e obrigatório nesta versão**

### 2. Backend

```powershell
cd backend
copy .env.example .env      # preencha (veja os comentários no arquivo)
npm install
npm run normalizar:categorias -- --teste   # mostra o que mudaria nas categorias antigas
npm run normalizar:categorias              # aplica (uma vez, depois da migração v4)
npm run dev
```

Scripts úteis:

| Comando | O que faz |
|---|---|
| `npm run dev` | sobe a API com recarga automática |
| `npm test` | testes de regras (fatura, categorias, planilhas, plano, aposentadoria) |
| `npm run check` | confere a sintaxe de todos os arquivos |
| `npm run admin:criar` | cria/redefine a conta admin (exige `ADMIN_EMAIL` e `ADMIN_PASSWORD` forte) |
| `npm run setup:webhook` | registra o webhook na Pluggy (sempre que a URL pública mudar) |
| `npm run normalizar:categorias` | converte categorias antigas para as Categorias Oule |
| `npm run sync:item -- <itemId>` | força a sincronização de uma conexão do Open Finance |

### 3. Frontend

```powershell
cd frontend
copy .env.example .env      # VITE_API_URL = URL do backend + /api
npm install
npm run dev
```

## Papéis e acesso

| Papel | Vê |
|---|---|
| `cliente` | só os próprios dados |
| `planejador` | os próprios dados + os clientes atribuídos a ele |
| `oule` (admin) | todos os clientes; gerencia planejadores e o WhatsApp do robô |

- O papel é decidido **só no backend** (`profiles.role`), nunca pelo app.
- O admin "raiz" é o e-mail de `ADMIN_EMAIL`, e só depois de **confirmado** no
  Supabase Auth. Não existe mais e-mail/senha padrão (antes, quem criasse a
  conta `admin@gmail.com` virava administrador).
- A equipe abre um cliente em **Clientes** e tem todas as telas dele em abas
  (plano, futuro, sonhos, pagamentos, cartões, transações, importação...).

## Segurança (resumo)

- Toda rota exige `Authorization: Bearer <token>`; o `userId` vem do token,
  nunca do corpo. Staff só acessa clientes do seu escopo (`utils/acesso.js`).
- RLS ativo em todas as tabelas; escrita só pelo backend (service_role).
- Validação zod em toda entrada; IDs de rota validados; mensagens de erro
  sem detalhes internos (com `requestId` para rastrear no log).
- Extratos lidos em memória e descartados; comprovantes só para o dono e a
  equipe responsável; comparativos entre pessoas só para grupos ≥ 5.
- Helmet com CSP restritiva, CORS por lista branca, rate limit, desligamento
  limpo no deploy, servidor sobe mesmo sem Pluggy/Gemini configurados.

## Migrando o Open Finance do sandbox para produção

1. Na Pluggy, gere credenciais de produção (`PLUGGY_CLIENT_ID/SECRET`).
2. Use `NODE_ENV=production` no servidor (desliga o sandbox e liga HSTS).
3. Rode `npm run setup:webhook` com a URL de produção.
4. Teste primeiro com uma conta secundária.
