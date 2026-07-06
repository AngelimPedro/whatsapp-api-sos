# Roadmap — API Oficial Atendimento (WhatsApp Web)

Painel de atendimento estilo WhatsApp Web, integrado à **API Oficial do WhatsApp (Meta Cloud API)**.

**Stack:** Nuxt 4 · Vue 3 (`<script setup>`) · Tailwind v4 · Supabase (Postgres) · Pusher (realtime) · Pinia (cache local)

---

## Visão geral das fases

| Fase | Tema | Status |
|------|------|--------|
| 1 | UI em componentes (mock) | ✅ Concluída |
| 2 | Modelagem no Supabase (conversas + mensagens) | 🔜 Próxima |
| 3 | Seed de dados aleatórios | ⬜ Pendente |
| 4 | Realtime com Pusher | ⬜ Pendente |
| 5 | Cache local com Pinia | ⬜ Pendente |
| 6 | Integração com a Meta Cloud API (webhook + envio) | ⬜ Futuro |

---

## Fase 1 — UI em componentes ✅

Layout em duas áreas, com dados mocados.

```
AreaConversas (esquerda)        AreaMensagens (direita)
 ├─ HeaderConversa               ├─ HeaderMensagens
 └─ ListaConversa                ├─ ListaMensagens
     └─ ConversaItem             │   └─ ItemMensagem (dispatcher)
                                 │       ├─ TextMessage
                                 │       ├─ ImageMessage
                                 │       ├─ AudioMessage
                                 │       ├─ VideoMessage
                                 │       ├─ DocumentMessage
                                 │       ├─ StickerMessage
                                 │       └─ MessageMeta (horário + status)
                                 └─ ChatInput (flutuante)
```

- Tema claro/escuro via tokens CSS + `[data-theme]`.
- Mock em `app/composables/useChatMock.ts`, ícones em `useIcons.ts`, tipos em `app/types/chat.ts`.

---

## Fase 2 — Modelagem no Supabase 🔜 (em andamento)

Mapeamento dos webhooks → [WEBHOOKS.md](./WEBHOOKS.md).

- [x] SDK `@supabase/supabase-js` instalado
- [x] `supabase init` (pasta `supabase/`)
- [x] Migration criada: `supabase/migrations/20260621224222_init_chat.sql`
- [x] Client Nuxt: `app/plugins/supabase.ts` + `useSupabase()` + `runtimeConfig`
- [x] Tipos do banco: `app/types/database.ts`
- [ ] **Aplicar a migration no projeto** (CLI `db push` ou SQL Editor)
- [ ] Gerar tipos do schema: `supabase gen types typescript --linked`

### Tabelas (resumo — SQL completo na migration)

**`conversations`** — 1 por contato **por número (inbox)**
`phone_number_id` · `display_phone_number` · `waba_id` · `wa_id` · `contact_name` ·
`contact_user_id` · `avatar_url` · `last_message_preview` · `last_message_at` ·
`unread_count` · `created_at`/`updated_at` · _unique(phone_number_id, wa_id)_

**`messages`**
`conversation_id` (fk) · `wa_message_id` (unique, idempotência) · `direction` (in/out) ·
`kind` · `from_wa_id`/`to_wa_id` · `body` · `media_id` · `media_url` · `media_mime` ·
`media_sha256` · `is_voice` · `media_meta` (jsonb) · `status` · `wa_timestamp` · `created_at`

> Índices em `(conversation_id, wa_timestamp)` e `(phone_number_id, last_message_at)`,
> trigger de `updated_at`, e RLS com política **permissiva de DEV** (apertar antes de prod).

### Como aplicar a migration

```bash
# opção A — via CLI (precisa logar/linkar o projeto)
supabase login
supabase link --project-ref SEU_REF
supabase db push

# opção B — copiar o conteúdo da migration e rodar no SQL Editor do painel
```

> Variáveis de ambiente: copiar `.env.example` para `.env` e preencher
> `SUPABASE_URL` / `SUPABASE_ANON_KEY`.

---

## Fase 3 — Seed de dados aleatórios 🔜 (em andamento)

Popular as tabelas com conversas e mensagens fake (todos os 6 tipos de balão) para validar a UI lendo do banco em vez do mock.

- [x] Seed SQL: `supabase/seed.sql` (4 conversas; thread completa dos 6 tipos)
- [x] Acesso **100% server-side** (service role): `server/utils/supabaseServer.ts` + rotas `server/api/conversations`
- [x] `app/composables/useChat.ts` consome as rotas via `$fetch` e mapeia pras views
- [x] `app/pages/index.vue` lendo do banco (não mais do mock)
- [ ] **Rodar o seed** no SQL Editor + preencher `.env` (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`)

> **Arquitetura:** o front nunca fala com o Supabase. RLS habilitada sem policies;
> só o servidor acessa (service role bypassa RLS). Ver migration
> `..._drop_dev_rls_policies.sql`.
>
> Obs.: documento guarda o nome do arquivo em `body` (não há coluna dedicada).

---

## Fase 4 — Webhook + Realtime com Pusher 🔜 (em andamento)

Pipeline: `Datafy → POST /api/webhook → Supabase → Pusher → front (pushMensagem)`.

- [x] **[1] Webhook** `server/api/webhook.post.ts` + parser `server/utils/webhookParser.ts`
  - parse de mensagens recebidas, echoes (out) e status
  - upsert da conversa + insert idempotente (`wa_message_id`) + update da prévia
  - mídia: grava `media_id`, `media_url` resolvido por `resolveMediaUrl()` (stub Datafy)
  - sem header de assinatura por ora (endpoint aberto); GET de sanity check
- [x] **[2] Publish no Pusher** no webhook: `message:new` (só quando insere) + `message:status`
  - `server/utils/pusherServer.ts` (Pusher server), canal `chat`
- [x] **[3] Subscribe no Pusher** no front: `app/plugins/pusher.client.ts` → `onRealtimeMessage` / `onRealtimeStatus`
- [x] Envio de texto: `POST /api/messages/send` + `sendMensagem` (otimista, dedup por wamid)

> Teste local via **ngrok** apontando para `/api/webhook`.
> Dedup: balão otimista recebe o `wamid` no retorno do POST; echo/reentrega não duplica.

---

## Fase 5 — Cache local com Pinia ✅

Store `app/stores/chat.ts` (`useChatStore`) cacheia conversas e mensagens.

- [x] `@pinia/nuxt` instalado
- [x] Conversas carregadas 1x (`conversasLoaded`) + paginação
- [x] **Mensagens cacheadas por conversa** (`msgCache[conversationId]`) → voltar a uma
      conversa já aberta é **instantâneo**, sem refetch
- [x] `pushMensagem()` — ponto único de inserção (envio otimista **e** Pusher),
      atualiza cache + prévia + ordem da lista
- [x] Mapeadores movidos p/ `app/utils/chatMappers.ts` (reuso no Pusher)

> Próximo: o Pusher chama `pushMensagem()` ao receber, e em paralelo persiste no banco
> (via server route). Invalidação fina fica para depois (TTL/refresh sob demanda).

---

## Fase 6 — Integração via Datafy API ⬜ (futuro)

> **Provedor: Datafy API** (camada/BSP que expõe a API Oficial, tipo Twilio).
> Auth usa só o **token do número** (`DATAFY_NUMBER_TOKEN`); **sem verify token**
> (handshake fica por conta da Datafy). Payloads = formato Meta Cloud API.
> Detalhes em [WEBHOOKS.md](./WEBHOOKS.md).

- Endpoint de **webhook** (só recebimento — verificação é da Datafy).
- **Envio** de mensagens (texto e mídia) via Datafy.
- Atualização de **status** (sent/delivered/read) vindo dos webhooks.

---

## Decisões em aberto

- Suporte a multi-número / multi-inbox?
- Onde processar o webhook da Meta (server route do Nuxt/Nitro vs. serviço à parte)?
- Política de RLS no Supabase (auth dos atendentes).

---

_Última atualização: 2026-06-21_
