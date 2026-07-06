-- ============================================================
-- Schema completo (cole no SQL Editor do Supabase).
-- Cria as 2 tabelas (conversations + messages), índices, a função/trigger
-- de updated_at e habilita RLS. Ordem importa por causa da FK.
-- ============================================================

-- função usada pelo trigger de updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- conversations (criar ANTES de messages: FK) ----------
create table if not exists public.conversations (
  id                   uuid not null default gen_random_uuid(),
  phone_number_id      text not null,
  display_phone_number text null,
  waba_id              text null,
  wa_id                text not null,
  contact_name         text null,
  contact_user_id      text null,
  last_message_preview text null,
  last_message_at      timestamp with time zone null,
  unread_count         integer not null default 0,
  created_at           timestamp with time zone not null default now(),
  updated_at           timestamp with time zone not null default now(),
  constraint conversations_pkey primary key (id),
  constraint conversations_phone_number_id_wa_id_key unique (phone_number_id, wa_id)
);

create index if not exists idx_conversations_inbox_recent
  on public.conversations using btree (phone_number_id, last_message_at desc);

create trigger trg_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ---------- messages ----------
create table if not exists public.messages (
  id              uuid not null default gen_random_uuid(),
  conversation_id uuid not null,
  wa_message_id   text null,
  direction       text not null,
  kind            text not null,
  from_wa_id      text null,
  to_wa_id        text null,
  body            text null,
  caption         text null,
  media_id        text null,
  media_url       text null,
  status          text null,
  wa_timestamp    timestamp with time zone null,
  created_at      timestamp with time zone not null default now(),
  constraint messages_pkey primary key (id),
  constraint messages_wa_message_id_key unique (wa_message_id),
  constraint messages_conversation_id_fkey
    foreign key (conversation_id) references public.conversations (id) on delete cascade,
  constraint messages_direction_check check (direction = any (array['in'::text, 'out'::text])),
  constraint messages_kind_check check (
    kind = any (array['text'::text,'image'::text,'audio'::text,'video'::text,'document'::text,'sticker'::text])
  ),
  constraint messages_status_check check (
    status = any (array['sent'::text,'delivered'::text,'read'::text,'failed'::text])
  )
);

create index if not exists idx_messages_conversation
  on public.messages using btree (conversation_id, wa_timestamp);

-- ---------- RLS ----------
-- O front NUNCA acessa o banco direto (só o servidor, com a service role que
-- bypassa a RLS). Habilitamos RLS SEM policies => a chave anon não lê/escreve.
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
