-- Auditoria de requisições externas (Datafy/WhatsApp e afins).
-- Grava sucesso e falha. Rode no SQL Editor do Supabase deste projeto.

create table if not exists public.audits (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  success           boolean not null,
  provider          text not null,                    -- datafy | openai | hub
  action            text not null,                    -- send_text | send_image | upload_media
  source            text,                             -- painel | bot | scheduler | webhook
  method            text not null default 'POST',
  url               text,

  http_status       integer,
  error_code        text,
  error_message     text,

  conversation_id   uuid references public.conversations (id) on delete set null,
  phone_number_id   text,
  wa_id             text,
  wa_message_id     text,

  duration_ms       integer,
  request           jsonb,
  response          jsonb
);

create index if not exists idx_audits_created_at
  on public.audits (created_at desc);

create index if not exists idx_audits_success
  on public.audits (success, created_at desc);

create index if not exists idx_audits_conversation
  on public.audits (conversation_id, created_at desc);

create index if not exists idx_audits_action
  on public.audits (provider, action, created_at desc);

alter table public.audits enable row level security;
