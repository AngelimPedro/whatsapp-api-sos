-- =========================================================================
-- MIGRATION: Adiciona suporte a status de qualificação e lembrete
-- de inatividade à tabela de conversas.
-- Rode este script no SQL Editor do Supabase.
-- =========================================================================

-- 1. Adiciona coluna 'status' com valor padrão 'bot'
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'bot';

-- 2. Garante que o status só aceite os valores mapeados
ALTER TABLE public.conversations 
DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE public.conversations 
ADD CONSTRAINT conversations_status_check 
CHECK (status IN ('bot', 'atendimento_humano', 'qualificado', 'desqualificado'));

-- 3. Adiciona coluna 'reminder_sent' com valor padrão falso
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;

-- 4. Cria índice para busca rápida de conversas por status (agendador)
CREATE INDEX IF NOT EXISTS idx_conversations_status_last_msg
ON public.conversations (status, last_message_at, reminder_sent);
