-- =========================================================================
-- MIGRATION: Marca mensagens encaminhadas.
--
-- Usada só para exibir o selo "Encaminhada" no balão, como no WhatsApp.
-- O conteúdo da mensagem encaminhada é copiado (não referenciado), então
-- apagar a original não afeta a cópia.
--
-- Rode este script no SQL Editor do Supabase.
-- =========================================================================

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS forwarded boolean NOT NULL DEFAULT false;
