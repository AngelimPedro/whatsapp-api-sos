-- =========================================================================
-- MIGRATION: Coluna que marca QUANDO o gatilho "resumo do pedido" disparou.
--
-- A aba Pedidos mostra só os pedidos do dia corrente (fuso de Brasília) e
-- filtra por esta coluna; o webhook a preenche junto com o status 'pedidos'.
-- O código já usa a coluna, mas ela não tinha migration — sem rodar isto,
-- o gatilho falha ao gravar e a aba Pedidos devolve erro.
--
-- Rode este script no SQL Editor do Supabase.
-- =========================================================================

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS pedido_confirmado_at timestamp with time zone NULL;

-- índice p/ o filtro "pedidos de hoje" da aba
CREATE INDEX IF NOT EXISTS idx_conversations_pedido_confirmado_at
ON public.conversations (status, pedido_confirmado_at DESC);
