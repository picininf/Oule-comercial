# Gerando o app Android (Capacitor) — VSCode + PowerShell + Android Studio

Este projeto já vem com o Capacitor configurado (`frontend/capacitor.config.json`
e a pasta `frontend/android`). O que estava impedindo o app de funcionar
corretamente foi corrigido nesta versão:

## O que estava quebrado (e o que foi corrigido)

1. **Identidade do app trocada.** O projeto Android tinha sido gerado com o
   `appId` e o nome de um outro projeto (`com.oulecomercial.app` /
   "oule-comercial"), deixado por engano. Agora tudo está consistente:
   - `appId`: `com.gestaofinanceira.app`
   - Nome do app: `Gestão Financeira`
   - Isso foi corrigido em: `capacitor.config.json`, `android/app/build.gradle`,
     `strings.xml`, `AndroidManifest.xml` (via namespace) e o pacote Java
     do `MainActivity.java` foi movido para `com/gestaofinanceira/app/`.

2. **CORS bloqueando o app no celular.** O backend só aceita chamadas de
   origens explicitamente liberadas em `ALLOWED_ORIGINS` (isso é proposital,
   por segurança — não mexa nisso). Mas faltava a origem que o **Android**
   usa por padrão no Capacitor: `https://localhost` (o app Android carrega
   os arquivos locais como se fossem servidos desse domínio; no iOS o
   padrão é `capacitor://localhost`, que já estava lá). Isso já foi
   adicionado ao `backend/.env`. Se você recriar o `.env` do zero, veja o
   comentário em `backend/.env.example`.

3. **URL do backend presa no APK.** A variável `VITE_API_URL` é embutida no
   app **no momento da compilação** (o Vite não lê `.env` em tempo de
   execução). Como em desenvolvimento o backend normalmente roda atrás de
   um túnel ngrok — e a URL do ngrok muda toda vez que você reinicia o
   túnel — isso quebrava o app a cada novo `npm run dev` do backend.
   Agora a tela **Configurações** do app tem um campo "URL da API" com
   botões "Salvar", "Testar conexão" e "Restaurar padrão": você troca a
   URL ali, sem precisar gerar um novo APK. O valor do `.env` continua
   servindo como padrão inicial.

4. **Cleartext HTTP.** Se um dia você quiser testar o app apontando direto
   para `http://SEU_IP_LOCAL:3000/api` (sem ngrok/HTTPS), o Android bloqueia
   isso por padrão. Foi adicionado
   `android/app/src/main/res/xml/network_security_config.xml` com um
   exemplo comentado de como liberar isso só para o seu IP local.

5. **Projeto limpo.** `node_modules`, as pastas geradas pelo Gradle
   (`android/.gradle`, `android/app/build`, `android/build`), o cache do
   Android Studio (`android/.idea`) e a sessão do WhatsApp
   (`backend/auth_info_baileys`) foram removidos do pacote — são todos
   recriados automaticamente pelos comandos abaixo. Isso também evita
   subir credenciais de sessão do WhatsApp sem querer.

---

## Pré-requisitos

- **Node.js** (18+) instalado.
- **Android Studio** instalado, com o **Android SDK** configurado (o
  próprio Android Studio te guia nisso na primeira abertura).
- **Java 21** (o Android Studio já vem com um JDK embutido compatível;
  normalmente não precisa instalar nada à parte).

Abra a pasta `gestao-financeira` no VSCode e use o terminal integrado
(PowerShell) para todos os comandos abaixo.

---

## Passo 1 — Configurar e subir o backend

```powershell
cd backend
copy .env.example .env
notepad .env   # preencha com suas chaves reais (Supabase, Pluggy, Gemini)
npm install
```

Rode o `backend/sql/schema.sql` no SQL Editor do seu projeto Supabase (uma
vez só).

Suba o backend com um túnel HTTPS público (necessário para o celular
conseguir acessar; em produção, troque isso por um domínio fixo — veja a
seção "Indo para produção" abaixo):

```powershell
npm run dev
```

Em outro terminal PowerShell, exponha a porta com ngrok (ou similar):

```powershell
ngrok http 3000
```

Copie a URL HTTPS gerada pelo ngrok (algo como
`https://xxxx.ngrok-free.app`). Você vai usá-la em dois lugares:

1. Em `backend/.env`, na variável `ALLOWED_ORIGINS` — **adicione** essa
   URL do ngrok se for servir o frontend web pela mesma URL, ou deixe como
   está se só o app Android vai chamar a API (nesse caso o que importa é a
   origem `https://localhost`, que já está liberada).
2. Em `frontend/.env`, na variável `VITE_API_URL`, como
   `https://xxxx.ngrok-free.app/api`.

Reinicie o backend (`npm run dev`) depois de editar o `.env`.

---

## Passo 2 — Configurar o frontend

```powershell
cd ..\frontend
copy .env.example .env
notepad .env   # preencha VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e VITE_API_URL
npm install
```

---

## Passo 3 — Gerar o app e abrir no Android Studio

Com o `frontend/.env` já apontando para a URL certa do backend:

```powershell
npm run android:sync
```

Isso builda o site (`vite build`) e sincroniza o resultado com o projeto
Android (`npx cap sync android`). Rode este comando **sempre que mudar
código do frontend** e quiser refletir isso no app.

Para abrir o projeto no Android Studio:

```powershell
npm run android:open
```

(equivalente a `npx cap open android` — o Android Studio abre já na pasta
`frontend/android`.)

Ou, para fazer os dois de uma vez:

```powershell
npm run android:build
```

Dentro do Android Studio:

1. Espere o Gradle sincronizar (barra de progresso embaixo).
2. Conecte um celular Android via USB com **depuração USB** ativada, ou
   crie um emulador (Device Manager).
3. Clique em **Run ▶** para instalar e abrir o app.

Para gerar um **APK instalável** sem precisar do Android Studio aberto,
pelo próprio PowerShell:

```powershell
cd android
.\gradlew.bat assembleDebug
```

O APK sai em
`frontend\android\app\build\outputs\apk\debug\app-debug.apk` — copie esse
arquivo para o celular e instale (pode precisar permitir "instalar de
fontes desconhecidas").

---

## Se a URL do ngrok mudar

Você **não** precisa recompilar o app. Abra o app no celular → **Configurações**
→ campo "URL da API" → cole a nova URL do ngrok terminando em `/api` →
"Testar conexão" → "Salvar URL". Lembre também de manter o `ALLOWED_ORIGINS`
do backend coerente com o que o frontend web (se usar) está chamando.

---

## Indo para produção (parar de depender do ngrok)

O ngrok é ótimo para desenvolvimento, mas a URL muda e o serviço pode ficar
fora do ar. Para uma versão "de verdade" do app, hospede o backend em um
serviço com domínio fixo (Render, Railway, Fly.io, um VPS, etc.), aponte
`VITE_API_URL` (no `frontend/.env`) e `BACKEND_PUBLIC_URL` (no
`backend/.env`) para esse domínio fixo, ajuste `ALLOWED_ORIGINS` de acordo,
rode `npm run android:sync` de novo e gere um APK/AAB assinado (no Android
Studio: **Build → Generate Signed App Bundle / APK**) para publicar na
Play Store ou distribuir diretamente.
