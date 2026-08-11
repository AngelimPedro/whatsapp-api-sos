-- =========================================================================
-- MIGRATION: Adiciona o status 'pedidos' à tabela de conversas.
--
-- Quando o lead envia uma mensagem contendo "resumo do pedido", o bot
-- responde uma única vez com o texto fixo de coleta de endereço e a
-- conversa passa para 'pedidos'. A partir daí o atendimento é 100%
-- humano: a IA (webhook) e o agendador de inatividade só atuam sobre
-- conversas em 'bot', então nenhum dos dois volta a enviar mensagem.
--
-- Rode este script no SQL Editor do Supabase.
-- =========================================================================

ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE public.conversations
ADD CONSTRAINT conversations_status_check
CHECK (status IN ('bot', 'atendimento_humano', 'qualificado', 'desqualificado', 'pedidos'));
