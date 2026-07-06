# API Oficial Atendimento — WhatsApp Web

Painel de atendimento estilo **WhatsApp Web**, integrado à **API Oficial do WhatsApp** através da **[Datafy API](https://app.datafyapi.com.br)** (camada/BSP homologada pela Meta — você só conecta o número e usa um token, sem burocracia nos painéis da Meta).

- 💬 Conversas e mensagens em tempo real (texto, imagem, áudio, vídeo, documento, sticker)
- 📥 Recebe mensagens via **webhook** e atualiza a tela ao vivo com **Pusher**
- 📤 Envia mensagens pela API
- 🗂️ Cache local com **Pinia** + paginação (conversas e mensagens)
- 🌗 Tema claro/escuro

**Stack:** Nuxt 4 · Vue 3 (`<script setup>`) · Tailwind v4 · Supabase (Postgres) · Pusher Channels · Datafy API

> 🔒 **Arquitetura:** o front **nunca** fala com o Supabase direto. Todo acesso ao banco é feito em **server routes** (Nitro) com a **service role key**. A RLS fica habilitada sem policies.

---

## Pré-requisitos

| | Para quê |
|---|---|
| Node 18+ | rodar o Nuxt |
| Conta **Supabase** | banco de dados |
| Conta **Datafy** ([app.datafyapi.com.br](https://app.datafyapi.com.br)) | número + token da API oficial |
| Conta **Pusher Channels** ([pusher.com](https://pusher.com)) | realtime |
| **ngrok** (dev) | expor o webhook localmente |

---

## Setup

### 1. Instalar

```bash
git clone <seu-repo>
cd api-oficial-atendimento
npm install
```

### 2. Criar as tabelas no Supabase

No painel do Supabase → **SQL Editor**, cole e rode o conteúdo de
[`supabase/schema.sql`](supabase/schema.sql). Ele cria as tabelas
**`conversations`** e **`messages`** (com índices, trigger de `updated_at` e RLS).

> Opcional: rode [`supabase/seed.sql`](supabase/seed.sql) para popular com dados de
> exemplo (15 conversas + mensagens dos 6 tipos) e ver a UI funcionando.

### 3. Variáveis de ambiente

Copie o exemplo e preencha:

```bash
cp .env.example .env
```

| Variável | Onde achar |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API (só a base, ex.: `https://xxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → **service_role** (⚠️ secreta, só no servidor) |
| `DATAFY_API_URL` | `https://cloud.datafyapi.com.br` (base, sem `/v1` nem `/media`) |
| `DATAFY_NUMBER_TOKEN` | Datafy → token da instância (`sk_live_...`) |
| `DATAFY_PHONE_NUMBER_ID` | id do número (vem no `metadata.phone_number_id` do webhook) |
| `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER` | Pusher → App Keys |

> ⚠️ Nunca commite o `.env`. O `.env.example` deve ter só placeholders.

### 4. Rodar

```bash
npm run dev   # http://localhost:3000
```

### 5. Conectar o webhook (receber mensagens)

Em desenvolvimento, exponha a porta 3000 com ngrok e aponte o webhook da Datafy:

```bash
ngrok http 3000
# cole {URL}/api/webhook no painel da Datafy
```

A Datafy não envia verify token — o endpoint só recebe `POST`.

---

## Como funciona (fluxo)

```
Receber:  Datafy → POST /api/webhook → Supabase → Pusher (message:new)   → front (ao vivo)
Status:   Datafy → POST /api/webhook → update    → Pusher (message:status) → tick atualiza
Mídia:    webhook → resolve media_id em {DATAFY_API_URL}/media/{id} → grava media_url público
Enviar:   input → POST /api/messages/send → Datafy /v1/{phone_number_id}/messages → grava + otimista
```

Mais detalhes em [`docs/ROADMAP.md`](docs/ROADMAP.md) e [`docs/WEBHOOKS.md`](docs/WEBHOOKS.md)
(mapeamento dos payloads da Meta → tabelas).

---

## Estrutura

```
app/
├── pages/index.vue              # monta as 2 áreas + tema
├── components/
│   ├── conversas/               # AreaConversas, HeaderConversa, ListaConversa, ConversaItem
│   └── mensagens/               # AreaMensagens, HeaderMensagens, ListaMensagens, ItemMensagem, ChatInput
│       └── balloons/            # Text/Image/Audio/Video/Document/StickerMessage + MessageMeta
├── stores/chat.ts               # Pinia: cache + paginação + realtime + envio
├── composables/                 # useIcons
├── utils/chatMappers.ts         # DB row -> view
└── types/                       # chat.ts, database.ts
server/
├── api/
│   ├── webhook.post.ts          # recebe da Datafy
│   ├── conversations/           # listagem + mensagens (paginado)
│   └── messages/send.post.ts    # envio
└── utils/                       # supabaseServer, datafyMedia, datafySend, pusherServer, webhookParser
supabase/
├── schema.sql                   # 👈 rode isso no SQL Editor
├── seed.sql                     # dados de exemplo (opcional)
└── migrations/                  # histórico
docs/
├── ROADMAP.md
├── WEBHOOKS.md
└── design-reference.html        # protótipo visual inicial (single-file Vue)
```

O design partiu de um protótipo em arquivo único:
[`docs/design-reference.html`](docs/design-reference.html) (abra no navegador para ver a referência).

---

## Produção

```bash
npm run build
npm run preview
```

Veja a [documentação de deploy do Nuxt](https://nuxt.com/docs/getting-started/deployment).
Em produção, configure o webhook da Datafy para a URL pública do deploy
(`https://seu-dominio/api/webhook`).
