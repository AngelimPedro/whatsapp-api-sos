import { sendTextMessage } from '../../utils/datafySend'

/**
 * Envia uma mensagem de texto pela conversa informada.
 * body: { conversationId: string, text: string }
 *
 * O status da conversa (bot / desqualificado / etc.) NÃO bloqueia o envio
 * humano. O que a Meta/Datafy bloqueia é a janela de 24h: se o cliente não
 * mandou nada nesse período, texto livre falha (erro 131047).
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
  let waMessageId: string | null = null
  try {
    waMessageId = await sendTextMessage(conv.phone_number_id, conv.wa_id, text.trim(), {
      conversationId: conv.id,
      source: 'painel',
    })
  } catch (err: any) {
    const parsed = parseDatafySendError(err)
    console.error('[send] Datafy recusou o envio:', parsed)
    throw createError({
      statusCode: parsed.httpStatus,
      statusMessage: parsed.message,
    })
  }

  if (!waMessageId) {
    throw createError({
      statusCode: 502,
      statusMessage: 'A Datafy não devolveu o id da mensagem. O WhatsApp provavelmente não recebeu.',
    })
  }

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

  // 4) atualiza a prévia/posição da conversa
  await supabase
    .from('conversations')
    .update({ last_message_preview: text.trim(), last_message_at: nowIso })
    .eq('id', conv.id)

  return { ok: true, waMessageId, message: inserted ?? null }
})

function parseDatafySendError(err: any): { httpStatus: number; message: string } {
  const data = err?.data ?? err?.response?._data ?? err?.response?.data
  const graph = data?.error ?? data
  const code = Number(graph?.code ?? graph?.error_code)
  const details = String(graph?.error_data?.details || graph?.message || err?.message || '')

  if (code === 131047) {
    return {
      httpStatus: 403,
      message:
        'Janela de 24h fechada: o WhatsApp só aceita texto livre se o cliente tiver mandado mensagem nas últimas 24 horas. Fora disso é preciso template (HSM).',
    }
  }

  if (code === 131026) {
    return {
      httpStatus: 400,
      message: 'Número inválido ou sem WhatsApp. A mensagem não foi entregue.',
    }
  }

  if (code === 131056) {
    return {
      httpStatus: 429,
      message: 'Limite de envio para este contato. Aguarde um pouco e tente de novo.',
    }
  }

  return {
    httpStatus: Number(err?.statusCode || err?.status || 502) || 502,
    message: details || 'Falha ao enviar pela Datafy/WhatsApp.',
  }
}
