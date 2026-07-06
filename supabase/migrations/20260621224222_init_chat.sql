-- ============================================================
-- Migration: estrutura inicial do chat (conversas + mensagens)
-- Mapeada a partir dos webhooks da Meta Cloud API (WhatsApp).
-- ============================================================

-- Tipos (usar text + CHECK facilita evoluir; enums seriam mais rígidos)
-- direction : 'in'  = recebida do contato | 'out' = enviada (echo/api)
-- kind      : tipo do conteúdo
-- status    : ciclo de entrega das mensagens enviadas

-- ------------------------------------------------------------
-- conversations: 1 por contato POR número (inbox)
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id                    uuid primary key default gen_random_uuid(),

  -- inbox (nosso número) — metadata.phone_number_id / display_phone_number
  phone_number_id       text not null,
  display_phone_number  text,
  waba_id               text,                         -- entry.id (business account)

  -- contato — contacts[].wa_id / profile.name / user_id
  wa_id                 text not null,                -- telefone do contato (ex.: 554191480924)
  contact_name          text,
  contact_user_id       text,                         -- BR.890138094098261
  avatar_url            text,

  -- resumo p/ a lista
  last_message_preview  text,
  last_message_at       timestamptz,
  unread_count          integer not null default 0,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- uma conversa por contato em cada número
  unique (phone_number_id, wa_id)
);

-- ------------------------------------------------------------
-- messages
-- ------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,

  -- id da mensagem na Meta (wamid). Único p/ idempotência do webhook.
  wa_message_id   text unique,

  direction       text not null check (direction in ('in','out')),
  kind            text not null check (kind in ('text','image','audio','video','document','sticker')),

  from_wa_id      text,                               -- messages[].from / echoes[].from
  to_wa_id        text,                               -- echoes[].to

  body            text,                               -- text.body ou caption de mídia

  -- mídia (image/audio/video/document/sticker)
  media_id        text,                               -- id da mídia na Meta (p/ resolver URL pública)
  media_url       text,                               -- URL pública já re-hospedada (após resolver)
  media_mime      text,                               -- mime_type
  media_sha256    text,
  is_voice        boolean,                            -- audio.voice (PTT)
  media_meta      jsonb,                              -- filename, size, duração, etc.

  -- status de entrega (statuses[]) — só relevante p/ direction = 'out'
  status          text check (status in ('sent','delivered','read','failed')),

  wa_timestamp    timestamptz,                        -- timestamp (unix) do webhook
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
create index if not exists idx_messages_conversation
  on public.messages (conversation_id, wa_timestamp);

create index if not exists idx_conversations_inbox_recent
  on public.conversations (phone_number_id, last_message_at desc);

-- ------------------------------------------------------------
-- updated_at automático em conversations
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ⚠️ DEV: políticas permissivas para a chave anon funcionar no front
--    enquanto não há auth de atendentes. APERTAR antes de produção.
-- ------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

drop policy if exists dev_all_conversations on public.conversations;
create policy dev_all_conversations on public.conversations
  for all using (true) with check (true);

drop policy if exists dev_all_messages on public.messages;
create policy dev_all_messages on public.messages
  for all using (true) with check (true);
