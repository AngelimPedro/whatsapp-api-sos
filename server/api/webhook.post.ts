import type { ParsedMessage } from '../utils/webhookParser'
import { sendTextMessage, sendImageMessage } from '../utils/datafySend'
import { getAIResponse } from '../utils/aiService'

/**
 * Webhook da Datafy (formato Meta). Recebe mensagens/echoes/status,
 * faz upsert da conversa e grava as mensagens no Supabase (idempotente).
 *
 * Datafy não envia header de assinatura por ora (endpoint aberto).
 * TODO: publicar no Pusher após gravar (camada de realtime).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // log do que chega (debug — remover/condicionar depois)
  console.log('[webhook] <<< payload recebido:\n' + JSON.stringify(body, null, 2))

  const supabase = useSupabaseServer()
  const events = parseWebhook(body)

  for (const ev of events) {
    try {
      if (ev.type === 'status') {
        await supabase
          .from('messages')
          .update({ status: ev.status })
          .eq('wa_message_id', ev.waMessageId)
        await publishStatus(ev.waMessageId, ev.status)
        continue
      }

      await persistMessage(supabase, ev)
    } catch (e) {
      console.error('[webhook] erro ao processar evento:', e)
    }
  }

  console.log(`[webhook] processados ${events.length} eventos`)
  return { ok: true, processed: events.length }
})

async function persistMessage(supabase: ReturnType<typeof useSupabaseServer>, ev: ParsedMessage) {
  if (!ev.phoneNumberId || !ev.contactWaId) return

  // 1) upsert da conversa (por número + contato)
  const convInfo = await upsertConversation(supabase, ev)
  if (!convInfo) return
  const { id: conversationId, status: currentStatus } = convInfo

  // 2) resolve mídia (stub por ora -> media_url nulo)
  const mediaUrl = ev.mediaId ? await resolveMediaUrl(ev.mediaId) : null

  // 3) grava a mensagem (idempotente por wa_message_id)
  const { data: inserted, error } = await supabase
    .from('messages')
    .upsert(
      {
        conversation_id: conversationId,
        wa_message_id: ev.waMessageId,
        direction: ev.direction,
        kind: ev.kind,
        from_wa_id: ev.fromWaId,
        to_wa_id: ev.toWaId ?? null,
        body: ev.body ?? null,
        caption: ev.caption ?? null,
        media_id: ev.mediaId ?? null,
        media_url: mediaUrl,
        status: ev.direction === 'out' ? 'sent' : null,
        wa_timestamp: ev.waTimestamp,
      },
      { onConflict: 'wa_message_id', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[webhook] insert message:', error.message)
    return
  }
  // duplicado (já processado) -> não republica
  if (!inserted) return

  // 4) atualiza a prévia/posição da conversa
  const isIncoming = ev.direction === 'in'
  const updateData: Record<string, any> = {
    last_message_preview: previewFor(ev.kind, ev.body, ev.caption),
    last_message_at: ev.waTimestamp,
  }
  if (isIncoming) {
    updateData.reminder_sent = false
  }

  const { data: convRow } = await supabase
    .from('conversations')
    .update(updateData)
    .eq('id', conversationId)
    .select('*')
    .single()

  // 5) publica no Pusher pro front atualizar ao vivo
  if (convRow) await publishNewMessage(convRow, inserted)

  // 6) Se for mensagem recebida de cliente e o status for 'bot', responde via IA
  if (isIncoming && currentStatus === 'bot') {
    try {
      // Busca as últimas 7 mensagens da conversa (para pegar o histórico e o input atual)
      const { data: messagesRow, error: fetchErr } = await supabase
        .from('messages')
        .select('direction, body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(7)

      if (fetchErr) {
        console.error('[webhook] erro ao buscar histórico para a IA:', fetchErr.message)
        return
      }

      // O messagesRow[0] é a mensagem que acabamos de receber (User Input)
      // O restante é o histórico anterior
      const latestMsgText = ev.body || ev.caption || ''
      const historyRows = messagesRow ? messagesRow.slice(1) : []
      
      const history = historyRows
        .reverse()
        .map(m => ({
          role: m.direction === 'in' ? 'user' as const : 'assistant' as const,
          content: m.body || ''
        }))

      // Chama a IA para gerar a resposta e classificar o status
      const aiResult = await getAIResponse(history, latestMsgText, ev.contactName || undefined)

      console.log(`[webhook] resposta da IA processada, novo status: "${aiResult.status}"`)

      // Define a lista de mensagens a enviar
      const messagesToSend = aiResult.messagesToSend && aiResult.messagesToSend.length > 0
        ? aiResult.messagesToSend
        : [
            aiResult.imageUrl
              ? { type: 'image' as const, imageUrl: aiResult.imageUrl, text: aiResult.reply }
              : { type: 'text' as const, text: aiResult.reply }
          ]

      let lastInsertedAI: any = null

      for (const [index, msg] of messagesToSend.entries()) {
        let sentWamid: string | null = null
        try {
          if (msg.type === 'image' && msg.imageUrl) {
            sentWamid = await sendImageMessage(ev.phoneNumberId, ev.contactWaId, msg.imageUrl, msg.text)
          } else if (msg.type === 'text' && msg.text) {
            sentWamid = await sendTextMessage(ev.phoneNumberId, ev.contactWaId, msg.text)
          }
        } catch (sendErr) {
          console.error(`[webhook] erro ao enviar mensagem index ${index}:`, sendErr)
        }

        // Salva a mensagem no banco
        const messagePayload: Record<string, any> = {
          conversation_id: conversationId,
          wa_message_id: sentWamid || `bot-ai-${Date.now()}-${index}`,
          direction: 'out',
          status: sentWamid ? 'sent' : null,
          wa_timestamp: new Date().toISOString()
        }

        if (msg.type === 'image') {
          messagePayload.kind = 'image'
          messagePayload.media_url = msg.imageUrl
          messagePayload.caption = msg.text || ''
        } else {
          messagePayload.kind = 'text'
          messagePayload.body = msg.text || ''
        }

        const { data: insertedAI, error: insertAIErr } = await supabase
          .from('messages')
          .insert(messagePayload)
          .select('*')
          .single()

        if (insertAIErr) {
          console.error('[webhook] erro ao persistir mensagem da IA:', insertAIErr.message)
        } else {
          lastInsertedAI = insertedAI
        }

        // Pequeno delay entre envios para manter ordem no WhatsApp
        if (index < messagesToSend.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 800))
        }
      }

      // Atualiza a conversa com o novo status da IA e o preview da última mensagem
      const lastMsg = messagesToSend[messagesToSend.length - 1]
      const previewText = lastMsg.type === 'image' ? `[Imagem] ${lastMsg.text || ''}` : (lastMsg.text || '')

      const { data: finalConvRow } = await supabase
        .from('conversations')
        .update({
          status: aiResult.status,
          last_message_preview: previewText.substring(0, 200),
          last_message_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .select('*')
        .single()

      // Publica no Pusher para o front atualizar (usamos a última mensagem inserida como referência)
      if (finalConvRow && lastInsertedAI) {
        await publishNewMessage(finalConvRow, lastInsertedAI)
      }
    } catch (aiErr) {
      console.error('[webhook] erro no processamento da IA:', aiErr)
    }
  }
}

/** Garante a conversa (insert/update) e retorna o id e status. */
async function upsertConversation(
  supabase: ReturnType<typeof useSupabaseServer>,
  ev: ParsedMessage,
): Promise<{ id: string; status: 'bot' | 'atendimento_humano' | 'qualificado' | 'desqualificado' } | null> {
  const row: Record<string, unknown> = {
    phone_number_id: ev.phoneNumberId,
    wa_id: ev.contactWaId,
    display_phone_number: ev.displayPhoneNumber ?? null,
    waba_id: ev.wabaId ?? null,
  }
  // só sobrescreve nome/userId quando vierem no payload (echo não traz nome)
  if (ev.contactName) row.contact_name = ev.contactName
  if (ev.contactUserId) row.contact_user_id = ev.contactUserId

  const { data, error } = await supabase
    .from('conversations')
    .upsert(row, { onConflict: 'phone_number_id,wa_id' })
    .select('id, status')
    .single()

  if (error) {
    console.error('[webhook] upsert conversation:', error.message)
    return null
  }
  return { id: data.id, status: data.status as any }
}
