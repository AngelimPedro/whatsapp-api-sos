-- ============================================================
-- Enxuga o schema do chat conforme uso real da API Oficial:
--   - remove avatar_url (a API não envia foto do contato)
--   - remove media_mime / media_sha256 / is_voice / media_meta
--   - adiciona caption (legenda de mídia: image/video/document .caption)
-- Idempotente (if exists / if not exists) p/ rodar com segurança.
-- ============================================================

-- conversations
alter table public.conversations drop column if exists avatar_url;

-- messages
alter table public.messages add  column if not exists caption text;
alter table public.messages drop column if exists media_mime;
alter table public.messages drop column if exists media_sha256;
alter table public.messages drop column if exists is_voice;
alter table public.messages drop column if exists media_meta;
