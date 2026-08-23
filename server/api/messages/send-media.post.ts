import { sendFileMessage } from '../../utils/datafySend'
import { resolveMediaUrl } from '../../utils/datafyMedia'
import { claimHumanIfBot } from '../../utils/claimHuman'
import { publishNewMessage } from '../../utils/pusherServer'

/**
 * Envia um arquivo anexado no chat (multipart/form-data).
 * campos: conversationId (texto) + file (binário)
 *
 * JPEG/PNG são enviados como imagem; qualquer outro tipo vai como documento
 * (preservando o nome do arquivo). Após enviar pela Datafy, resolve a URL
 * pública da mídia para o balão exibir o conteúdo e persiste a mensagem.
 *
 * Se a conversa estiver em "bot", o envio humano a move para
 * "atendimento_humano" e a IA para de responder.
 */
export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  if (!parts) {
    throw createError({ statusCode: 400, statusMessage: 'multipart/form-data esperado' })
  }

  let conversationId = ''
  let caption = ''
  let filePart: { data: Buffer; filename?: string; type?: string } | null = null
  for (const p of parts) {
    if (p.name === 'conversationId') conversationId = p.data.toString('utf-8').trim()
    else if (p.name === 'caption') caption = p.data.toString('utf-8').trim()
    else if (p.name === 'file') filePart = p as { data: Buffer; filename?: string; type?: string }
  }

  if (!conversationId || !filePart?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'conversationId e file são obrigatórios' })
  }

  const filename = filePart.filename || 'arquivo'
  const mimeType = (filePart.type || 'application/octet-stream').split(';')[0]!.trim()
  const kind: 'image' | 'document' =
    mimeType === 'image/jpeg' || mimeType === 'image/png' ? 'image' : 'document'

  const supabase = useSupabaseServer()

  // 1) dados da conversa (destinatário + inbox)
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, wa_id, phone_number_id, display_phone_number, status')
    .eq('id', conversationId)
    .single()

  if (convErr || !conv) {
    throw createError({ statusCode: 404, statusMessage: 'conversa não encontrada' })
  }

  // 2) upload + envio via Datafy
  const { waMessageId, mediaId } = await sendFileMessage(
    conv.phone_number_id,
    conv.wa_id,
    kind,
    filePart.data,
    mimeType,
    filename,
    caption || undefined,
    { conversationId: conv.id, source: 'painel' },
  )

  // WhatsApp não confirmou a entrega (200 sem wamid) = rejeitado (ex.: fora da
  // janela de 24h). Não persiste como enviado — devolve erro pro cliente.
  if (!waMessageId) {
    throw createError({
      statusCode: 502,
      statusMessage:
        'O WhatsApp não confirmou a entrega do arquivo (provável rejeição: fora da janela de 24h ou número inválido).',
    })
  }

  // 3) resolve a URL pública da mídia (p/ exibir o balão enviado)
  const mediaUrl = mediaId ? await resolveMediaUrl(mediaId) : null

  // 4) persiste a mensagem enviada
  const nowIso = new Date().toISOString()
  const row: Record<string, unknown> = {
    conversation_id: conv.id,
    wa_message_id: waMessageId,
    direction: 'out',
    kind,
    from_wa_id: conv.display_phone_number,
    to_wa_id: conv.wa_id,
    media_id: mediaId,
    media_url: mediaUrl,
    status: 'sent',
    wa_timestamp: nowIso,
  }
  // documento guarda o nome no body (mapMensagem lê o filename de lá)
  if (kind === 'document') row.body = filename
  if (caption) row.caption = caption

  const { data: inserted, error: insErr } = await supabase
    .from('messages')
    .upsert(row, { onConflict: 'wa_message_id', ignoreDuplicates: true })
    .select('*')
    .maybeSingle()

  if (insErr) {
    console.error('[send-media] insert message:', insErr.message)
  }

  // 5) prévia + se estava em bot, assume atendimento humano
  const preview = kind === 'image' ? caption || '[Imagem]' : `[Arquivo] ${filename}`
  const convAtualizada = await claimHumanIfBot(supabase, conv.id, conv.status, {
    last_message_preview: preview,
    last_message_at: nowIso,
  })

  // 6) realtime: o echo do webhook não é garantido para mídia de saída, então
  // sem publicar aqui as outras abas/atendentes só veriam o arquivo ao recarregar
  if (convAtualizada && inserted) {
    await publishNewMessage(convAtualizada, inserted)
  }

  return {
    ok: true,
    waMessageId,
    mediaId,
    mediaUrl,
    kind,
    message: inserted ?? null,
    status: convAtualizada?.status ?? conv.status,
  }
})
