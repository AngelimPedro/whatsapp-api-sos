import { sendFileMessage } from '../../utils/datafySend'
import { resolveMediaUrl } from '../../utils/datafyMedia'

/**
 * Envia um arquivo anexado no chat (multipart/form-data).
 * campos: conversationId (texto) + file (binário)
 *
 * JPEG/PNG são enviados como imagem; qualquer outro tipo vai como documento
 * (preservando o nome do arquivo). Após enviar pela Datafy, resolve a URL
 * pública da mídia para o balão exibir o conteúdo e persiste a mensagem.
 */
export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  if (!parts) {
    throw createError({ statusCode: 400, statusMessage: 'multipart/form-data esperado' })
  }

  let conversationId = ''
  let filePart: { data: Buffer; filename?: string; type?: string } | null = null
  for (const p of parts) {
    if (p.name === 'conversationId') conversationId = p.data.toString('utf-8').trim()
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
    .select('id, wa_id, phone_number_id, display_phone_number')
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
  )

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

  const { data: inserted, error: insErr } = await supabase
    .from('messages')
    .upsert(row, { onConflict: 'wa_message_id', ignoreDuplicates: true })
    .select('*')
    .maybeSingle()

  if (insErr) {
    console.error('[send-media] insert message:', insErr.message)
  }

  // 5) atualiza prévia/posição da conversa
  const preview = kind === 'image' ? '[Imagem]' : `[Arquivo] ${filename}`
  await supabase
    .from('conversations')
    .update({ last_message_preview: preview, last_message_at: nowIso })
    .eq('id', conv.id)

  return { ok: true, waMessageId, mediaId, mediaUrl, kind, message: inserted ?? null }
})
