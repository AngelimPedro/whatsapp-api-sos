-- ============================================================
-- Remove as políticas permissivas de DEV.
-- Acesso ao banco passa a ser 100% server-side (service role, que
-- bypassa RLS). RLS continua HABILITADA e sem policies => a chave
-- anon não lê/escreve nada (o front nunca fala com o Supabase direto).
-- Idempotente.
-- ============================================================

drop policy if exists dev_all_conversations on public.conversations;
drop policy if exists dev_all_messages      on public.messages;

-- garante RLS ligada (sem policies = bloqueado para anon)
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
