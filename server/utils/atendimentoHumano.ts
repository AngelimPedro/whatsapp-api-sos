/**
 * Regra "Atendimento humano iniciado".
 *
 * Toda mensagem enviada por um atendente pelo hub tira a conversa do bot.
 * Não dá para expressar isso no prompt da IA: ela só é chamada em mensagens
 * RECEBIDAS (webhook), e o envio do atendente nunca passa por lá.
 *
 * O UPDATE é condicional (`.eq('status', 'bot')`), o que resolve duas coisas
 * de uma vez: não sobrescreve status já avançados ('pedidos', 'qualificado',
 * 'desqualificado') e não corre risco de corrida com o webhook, que processa
 * mensagens do cliente em paralelo — quem chegar primeiro vence, no banco.
 *
 * Depois disso a IA fica em silêncio, porque tanto o webhook quanto o
 * agendador de inatividade só atuam sobre conversas em 'bot'.
 */
export async function assumirAtendimentoHumano(
  supabase: ReturnType<typeof useSupabaseServer>,
  conversationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('conversations')
    .update({ status: 'atendimento_humano' })
    .eq('id', conversationId)
    .eq('status', 'bot')
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[atendimento] falha ao assumir a conversa:', error.message)
    return false
  }
  if (data) {
    console.log(`[atendimento] conversa ${conversationId}: bot -> atendimento_humano`)
  }
  return !!data
}
