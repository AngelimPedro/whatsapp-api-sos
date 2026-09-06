/**
 * Envia uma mensagem de texto pela conversa informada.
 * body: { conversationId: string, text: string }
 *
 * Resolve o número/contato pela conversa, envia via Datafy, persiste a
 * mensagem (out, status 'sent') e atualiza a prévia da conversa.
 * O echo/status que voltarem pelo webhook são idempotentes (wa_message_id).
 */
export default defineEventHandler(async (event) => {
  const { conversationId, text } = await readBody<{ conversationId?: string; text?: string }>(event)

  if (!conversationId || !text?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'conversationId e text são obrigatórios' })
  }

  const supabase = useSupabaseServer()

  // 1) dados da conversa (destinatário + inbox)
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, wa_id, phone_number_id, display_phone_number')
    .eq('id', conversationId)
    .single()

  if (convErr || !conv) {
    throw createError({ statusCode: 404, statusMessage: 'conversa não encontrada' })
  }

  // 2) envia via Datafy
  const waMessageId = await sendTextMessage(conv.phone_number_id, conv.wa_id, text.trim())

  // 3) persiste a mensagem enviada
  const nowIso = new Date().toISOString()
  const { data: inserted, error: insErr } = await supabase
    .from('messages')
    .upsert(
      {
        conversation_id: conv.id,
        wa_message_id: waMessageId,
        direction: 'out',
        kind: 'text',
        from_wa_id: conv.display_phone_number,
        to_wa_id: conv.wa_id,
        body: text.trim(),
        status: 'sent',
        wa_timestamp: nowIso,
      },
      { onConflict: 'wa_message_id', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle()

  if (insErr) {
    console.error('[send] insert message:', insErr.message)
  }

  // 4) regra "Atendimento humano iniciado": o atendente respondeu, a IA sai de
  //    cena. Também é o que impede o agendador de mandar "ainda está por aí?",
  //    porque ele só olha conversas em 'bot'.
  await assumirAtendimentoHumano(supabase, conv.id)

  // 5) atualiza a prévia/posição da conversa (já reflete o status novo)
  const { data: convAtualizada } = await supabase
    .from('conversations')
    .update({ last_message_preview: text.trim(), last_message_at: nowIso })
    .eq('id', conv.id)
    .select('*')
    .single()

  // 6) realtime: sem isto o selo de status e a aba só mudariam ao recarregar
  if (convAtualizada && inserted) {
    await publishNewMessage(convAtualizada, inserted)
  }

  return { ok: true, waMessageId, message: inserted ?? null, conversation: convAtualizada ?? null }
})
