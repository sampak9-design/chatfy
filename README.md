# Chatfy

Plataforma para gerenciar bots do Telegram — captura de leads, construtor de fluxos drag-and-drop estilo ManyChat, disparos em massa.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind 4 · Prisma · PostgreSQL · Redis · BullMQ · React Flow

## Funcionalidades

- ✅ Cadastro de bot com webhook automático no Telegram
- ✅ Captura automática de leads no `/start` (telegram_id, nome, username, idioma, origem)
- ✅ Detecção automática de bloqueio (status `blocked`)
- ✅ Construtor visual de fluxos com React Flow (drag-and-drop)
- ✅ Etapas: texto, imagem, vídeo, áudio, documento, delay, botões
- ✅ Botões: link externo, callback (continua o fluxo), suporte
- ✅ Disparos em massa com fila Redis (BullMQ) — respeita limite de 25 msg/s do Telegram
- ✅ Dashboard com KPIs, últimos leads, últimos disparos
- ✅ Login admin com JWT em cookie HttpOnly
- ✅ Tema dark UTMfy

---

## Deploy no Railway

### 1. Criar o projeto

1. Crie um projeto novo no [Railway](https://railway.app)
2. Adicione **PostgreSQL** (botão "+ New" → Database → PostgreSQL)
3. Adicione **Redis** (botão "+ New" → Database → Redis)
4. Adicione o **app** (botão "+ New" → GitHub Repo → este repo)

### 2. Variáveis de ambiente do app

No serviço do app, adicione:

```
DATABASE_URL    = ${{ Postgres.DATABASE_URL }}
REDIS_URL       = ${{ Redis.REDIS_URL }}
APP_URL         = https://<sua-url>.up.railway.app
AUTH_SECRET     = (gere com: openssl rand -base64 32)
ADMIN_EMAIL     = admin@chatfy.local
ADMIN_PASSWORD  = (uma senha forte)
```

> O Railway gera o domínio público em **Settings → Networking → Generate Domain**. Use ele como `APP_URL`.

### 3. Adicionar o worker (segundo serviço)

O worker que processa a fila de disparos roda como **processo separado**, no mesmo repo:

1. No mesmo projeto Railway, clique em **+ New → GitHub Repo** (mesmo repo)
2. Em **Settings → Deploy**, mude o **Start Command** para:
   ```
   npm run worker
   ```
3. Adicione as **mesmas variáveis** `DATABASE_URL` e `REDIS_URL` (não precisa de `APP_URL` nem `AUTH_SECRET` no worker)

### 4. Primeiro acesso

- Acesse `https://<sua-url>.up.railway.app/login`
- Use `ADMIN_EMAIL` / `ADMIN_PASSWORD` definidos no passo 2
- Vá em **Bot** → cole o token do BotFather → o webhook é registrado automaticamente
- Crie um fluxo em **Fluxos** → defina-o como "boas-vindas"
- Pronto: ao dar `/start` no bot, o lead é capturado e o fluxo dispara

---

## Desenvolvimento local

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL e REDIS_URL
npx prisma migrate dev
npm run seed           # cria o admin a partir das envs
npm run dev            # web em http://localhost:3000
npm run worker         # em outro terminal
```

Para o webhook funcionar localmente, exponha a porta 3000 com [ngrok](https://ngrok.com) ou [cloudflared](https://github.com/cloudflare/cloudflared) e use a URL https no `APP_URL`.

---

## Estrutura

```
app/
  (panel)/          # rotas autenticadas (sidebar)
    page.tsx        # Dashboard
    bot/            # cadastro do bot, webhook
    leads/          # tabela de leads + filtros
    flows/          # lista + editor drag-and-drop
    broadcasts/     # lista + editor + envio
  api/
    telegram/[botId]/  # webhook recebe updates do Telegram
    auth/logout/       # logout
    health/            # healthcheck do Railway
  login/            # tela de login
components/
  Sidebar.tsx
  flow-editor/      # React Flow + StepNode + properties panel
lib/
  db.ts             # Prisma client
  auth.ts           # JWT + cookie session
  telegram.ts       # cliente da Bot API (sem SDK)
  flow-engine.ts    # executor de fluxos (texto, mídia, botões, delay)
  queue/
    redis.ts
    broadcast-queue.ts
    worker.ts       # consumidor BullMQ
prisma/
  schema.prisma
  seed.ts           # cria admin inicial
```

---

## Tabelas

| Tabela           | Para quê |
|------------------|----------|
| `admin_users`    | Login do painel |
| `bots`           | Tokens, username, fluxo de boas-vindas, webhook secret |
| `leads`          | Pessoas que deram /start (status, origin, currentStep) |
| `flows`          | Fluxo (graph JSON do React Flow é a fonte da verdade) |
| `flow_steps`     | Representação plana — usada pelo runtime engine |
| `broadcasts`     | Disparos (rascunho, enviando, concluído) |
| `broadcast_logs` | 1 linha por (disparo, lead) — sent/failed/blocked |

---

## Notas

- **Token nunca vai para o frontend.** É lido apenas no servidor (server actions / route handlers).
- **Webhook secret:** cada bot tem um `webhookSecret` único validado no header `X-Telegram-Bot-Api-Secret-Token`.
- **Bloqueios:** se o Telegram retorna 403 ou descrição com "blocked"/"deactivated"/"kicked", o lead vira `blocked` automaticamente em fluxos e disparos.
- **Limite Telegram:** o worker respeita ~25 msg/s (limite real é 30/s globais por bot).
