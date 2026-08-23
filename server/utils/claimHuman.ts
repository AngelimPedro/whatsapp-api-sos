import type { ConversationRow } from '../../app/types/database'

type Supabase = ReturnType<typeof useSupabaseServer>

/**
 * Quando um atendente envia pelo painel e a conversa ainda está em "bot",
 * assume o atendimento: status -> atendimento_humano.
 * A IA só responde com status === "bot", então fica silenciosa.
 */
export async function claimHumanIfBot(
  supabase: Supabase,
  conversationId: string,
  currentStatus: string | null | undefined,
  extraUpdate: Record<string, unknown> = {},
): Promise<ConversationRow | null> {
  const update: Record<string, unknown> = { ...extraUpdate }

  if (currentStatus === 'bot') {
    update.status = 'atendimento_humano'
    console.log(`[claimHuman] conversa ${conversationId}: bot -> atendimento_humano`)
  }

  if (Object.keys(update).length === 0) return null

  const { data, error } = await supabase
    .from('conversations')
    .update(update)
    .eq('id', conversationId)
    .select('*')
    .single()

  if (error) {
    console.error('[claimHuman] falha ao atualizar conversa:', error.message)
    return null
  }

  return data
}
