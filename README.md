# Gestão Financeira Pessoal — Backend + Frontend (versão segura)

> 📱 Quer gerar o app Android (Capacitor) via VSCode/PowerShell/Android
> Studio? Veja **[README-ANDROID.md](./README-ANDROID.md)** — lá está o
> passo a passo e a lista do que foi corrigido no projeto Android.

Estrutura reorganizada a partir do App.jsx/server.js originais, com foco em
segurança para um sistema que movimenta dados bancários reais via Open
Finance (Pluggy) e comprovantes via WhatsApp (Baileys + Gemini).

## Antes de rodar

### 1. Backend
```
cd backend
cp .env.example .env   # preencha com suas chaves reais
npm install
```

Rode o `backend/sql/schema.sql` no SQL Editor do seu projeto Supabase —
isso ativa o Row Level Security e cria as tabelas `open_finance_items`
e `webhook_events`, essenciais para a integração real com o banco.

Suba o backend (em dev, atrás de um túnel HTTPS como o ngrok):
```
npm run dev
```

Registre o webhook na Pluggy (uma vez, e sempre que a URL pública mudar):
```
npm run setup:webhook
```

### 2. Frontend
```
cd frontend
cp .env.example .env   # aponte VITE_API_URL para a mesma URL do backend
npm install
npm run dev
```

## Painel de administrador

Existe um segundo tipo de acesso, só para uso interno: ao logar com um
e-mail configurado como admin, a pessoa cai numa interface totalmente
diferente da dos usuários comuns — visão consolidada de todos os
usuários (métricas gerais, despesas por categoria somadas, evolução
mensal e um ranking) e uma tela de "Usuários" com a visão individual
completa de cada um (perfil, métricas e extrato).

**Como criar a conta admin** (uma vez só, depois de configurar o `.env`
do backend):
```
cd backend
node scripts/create-admin-user.js
```
Por padrão isso cria `admin@gmail.com` / `12345678` (valores lidos de
`ADMIN_EMAIL` / `ADMIN_PASSWORD` no `.env`, com esses como fallback).
Depois é só logar normalmente pela tela de login do app com esse e-mail
e senha.

**Como funciona a autorização:** o front nunca decide sozinho quem é
admin — ele pergunta pro backend (`GET /api/admin/status`), que compara
`req.userEmail` (extraído do token JWT já validado pelo Supabase) com
`ADMIN_EMAIL` do `.env`. Isso é o que protege de verdade os dados de
todo mundo: mesmo que alguém adultere o app no celular, as rotas
`/api/admin/*` continuam recusando qualquer usuário cujo e-mail não seja
o configurado.

⚠️ **Antes de usar em produção com dados reais**, troque a senha padrão
`12345678` — ela é fraca de propósito só para o primeiro acesso, e essa
conta enxerga o extrato financeiro de todos os usuários cadastrados.
Troque pelo Supabase Studio (Authentication → Users → Reset password)
ou rodando o script de novo com `ADMIN_PASSWORD` diferente no `.env`.

## Migrando do sandbox para o Nubank real

1. No painel da Pluggy, mude do ambiente Sandbox para Produção e gere
   novas credenciais (`PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET`) de
   produção.
2. Em `backend/routes/openFinance.routes.js`, `includeSandbox` já está
   condicionado a `NODE_ENV`; garanta que `NODE_ENV=production` no
   ambiente de produção.
3. Rode `npm run setup:webhook` novamente apontando para a URL de
   produção do backend.
4. Solicite à Pluggy a habilitação do conector do Nubank no seu plano,
   caso ainda não esteja disponível.
5. Teste peorimeiro com um valor pequeno / conta secundária antes de
   confiar 100% no fluxo com sua conta principal.

## O que mudou em relação à versão anterior (resumo)

- Toda rota sensível exige `Authorization: Bearer <token>` e usa
  `req.userId` do token — nunca um `userId` vindo do corpo da requisição.
- Row Level Security ativado nas tabelas do Supabase.
- `/uploads` deixou de ser público; comprovantes só são servidos para o
  dono da transação.
- CORS restrito a uma lista de origens conhecidas.
- Webhook da Pluggy autenticado por segredo compartilhado + idempotência
  por `eventId` + sempre revalida o dado direto na API da Pluggy.
- Código de vinculação do WhatsApp expira em 10 min e tem rate limit.
- CPF removido do fluxo de cadastro (dado sensível não essencial ao MVP).
- Saída de erros da API não vaza mais detalhes internos.
