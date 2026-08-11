-- Adiciona kind 'location' (localização fixa / pin do WhatsApp).
-- Rode no SQL Editor do Supabase deste projeto.

alter table public.messages
  drop constraint if exists messages_kind_check;

alter table public.messages
  add constraint messages_kind_check check (
    kind = any (
      array[
        'text'::text,
        'image'::text,
        'audio'::text,
        'video'::text,
        'document'::text,
        'sticker'::text,
        'location'::text
      ]
    )
  );
