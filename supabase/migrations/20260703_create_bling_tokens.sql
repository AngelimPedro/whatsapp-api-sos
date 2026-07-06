-- =========================================================================
-- MIGRATION: Cria a tabela bling_tokens para gerenciar tokens OAuth2 do Bling.
-- Rode este script no SQL Editor do Supabase.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.bling_tokens (
  id integer PRIMARY KEY DEFAULT 1,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  constraint bling_tokens_id_check check (id = 1) -- garante registro único
);

-- Habilitar RLS sem policies (somente acessível via service role no servidor)
ALTER TABLE public.bling_tokens ENABLE ROW LEVEL SECURITY;

-- Insere os primeiros tokens que você informou
INSERT INTO public.bling_tokens (id, access_token, refresh_token)
VALUES (1, 'c2ad4f47c474487d5eadc78fa00b416bc7548e62', 'c60bdb6336006c8ef5c39fe692c978767ea064fc')
ON CONFLICT (id) DO UPDATE 
SET access_token = EXCLUDED.access_token,
    refresh_token = EXCLUDED.refresh_token,
    updated_at = now();
