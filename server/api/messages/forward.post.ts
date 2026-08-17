import { sendTextMessage, sendImageMessage, sendMediaMessage, type MediaKind } from '../../utils/datafySend'

/**
 * Encaminha uma mensagem existente para uma ou mais conversas.
 * body: { messageId: string, conversationIds: string[] }
 *
 * O conteúdo é COPIADO, não referenciado: cada destino recebe uma mensagem
 * nova, marcada com `forwarded` para exibir o selo "Encaminhada". Mídia é
 * rebaixada e reenviada (o media id recebido não serve para envio).
 *
 * Cada destino é independente — se um falhar, os outros seguem. A resposta
 * traz o resultado por conversa para a UI avisar o que não foi.
 */
/**
 * A cópia encaminhada precisa da coluna `messages.forwarded`. Sem ela o envio
 * ao WhatsApp acontece e só o registro falha — o cliente recebe e o hub não
 * mostra. Checar antes evita esse estado.
 *
 * Só o resultado positivo fica em cache: enquanto faltar, cada tentativa
 * refaz a checagem, então rodar a migration passa a valer sem reiniciar.
 */
let colunaForwardedOk = false

async function podeRegistrarEncaminhamento(
  supabase: ReturnType<typeof useSupabaseServer>,
): Promise<string | null> {
  if (colunaForwardedOk) return null
  const { error } = await supabase.from('messages').select('forwarded').limit(1)
  if (!error) {
    colunaForwardedOk = true
    return null
  }
  return error.message
}

export default defineEventHandler(async (event) => {
  const { messageId, conversationIds } = await readBody<{
    messageId?: string
    conversationIds?: string[]
  }>(event)

  const destinos = (conversationIds ?? []).filter(Boolean)
  if (!messageId || destinos.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'messageId e conversationIds são obrigatórios',
    })
  }

  const supabase = useSupabaseServer()

  // 0) o hub consegue registrar a cópia? se não, nada é enviado
  const faltaColuna = await podeRegistrarEncaminhamento(supabase)
  if (faltaColuna) {
    console.error('[forward] schema incompleto:', faltaColuna)
    throw createError({
      statusCode: 503,
      statusMessage:
        'Encaminhamento indisponível: falta rodar a migration que adiciona a coluna messages.forwarded.',
    })
  }

  // 1) mensagem de origem
  const { data: origem, error: origemErr } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .single()

  if (origemErr || !origem) {
    throw createError({ statusCode: 404, statusMessage: 'mensagem não encontrada' })
  }

  // texto de mídia fica na caption; documento guarda o nome no body
  const legenda = origem.caption ?? undefined
  const temMidia = origem.kind !== 'text'

  if (temMidia && !origem.media_url) {
    throw createError({
      statusCode: 422,
      statusMessage: 'a mídia desta mensagem não está disponível para reenvio',
    })
  }
  if (!temMidia && !origem.body?.trim()) {
    throw createError({ statusCode: 422, statusMessage: 'mensagem de origem vazia' })
  }

  // 2) conversas de destino
  const { data: conversas, error: convErr } = await supabase
    .from('conversations')
    .select('id, wa_id, phone_number_id, display_phone_number')
    .in('id', destinos)

  if (convErr) {
    throw createError({ statusCode: 500, statusMessage: convErr.message })
  }
  if (!conversas?.length) {
    throw createError({ statusCode: 404, statusMessage: 'nenhuma conversa de destino encontrada' })
  }

  const resultados: {
    conversationId: string
    ok: boolean
    waMessageId?: string | null
    erro?: string
  }[] = []

  for (const conv of conversas) {
    try {
      // 3) envia conforme o tipo
      let waMessageId: string | null = null

      if (origem.kind === 'text') {
        waMessageId = await sendTextMessage(conv.phone_number_id, conv.wa_id, origem.body!.trim())
      } else if (origem.kind === 'image') {
        waMessageId = await sendImageMessage(
          conv.phone_number_id,
          conv.wa_id,
          origem.media_url!,
          legenda,
        )
      } else {
        waMessageId = await sendMediaMessage(
          conv.phone_number_id,
          conv.wa_id,
          origem.kind as MediaKind,
          origem.media_url!,
          legenda,
          origem.kind === 'document' ? origem.body ?? undefined : undefined,
        )
      }

      // WhatsApp não confirmou o envio (HTTP 200 sem wamid) = rejeitado, o caso
      // clássico de encaminhar para fora da janela de 24h. NÃO persiste nem
      // mostra no hub como enviado — antes fingia sucesso com um id 'fwd-...'.
      if (!waMessageId) {
        resultados.push({
          conversationId: conv.id,
          ok: false,
          erro:
            'O WhatsApp não confirmou a entrega (provável rejeição: fora da janela de 24h ou número inválido).',
        })
        continue
      }

      // 4) persiste a cópia no destino (só quando realmente enviou)
      const agora = new Date().toISOString()
      const { data: inserida, error: insErr } = await supabase
        .from('messages')
        .insert({
          conversation_id: conv.id,
          wa_message_id: waMessageId,
          direction: 'out',
          kind: origem.kind,
          from_wa_id: conv.display_phone_number,
          to_wa_id: conv.wa_id,
          body: origem.body,
          caption: origem.caption,
          media_url: origem.media_url,
          status: 'sent',
          forwarded: true,
          wa_timestamp: agora,
        })
        .select('*')
        .single()

      // A mensagem já saiu no WhatsApp, mas se não conseguimos registrar a
      // cópia o hub não tem o que mostrar. Reportar sucesso aqui fazia a
      // prévia da conversa atualizar sem a mensagem existir de fato.
      if (insErr || !inserida) {
        console.error('[forward] persistir cópia:', insErr?.message)
        resultados.push({
          conversationId: conv.id,
          ok: false,
          waMessageId,
          erro: `Enviada no WhatsApp, mas não foi possível registrar no hub: ${insErr?.message ?? 'insert vazio'}`,
        })
        continue
      }

      // 5) prévia/posição da conversa de destino
      const previa = previewFor(origem.kind, origem.body ?? undefined, origem.caption ?? undefined)
      const { data: convAtualizada } = await supabase
        .from('conversations')
        .update({ last_message_preview: previa, last_message_at: agora })
        .eq('id', conv.id)
        .select('*')
        .single()

      // 6) realtime p/ quem estiver com a conversa de destino aberta
      if (convAtualizada) {
        await publishNewMessage(convAtualizada, inserida)
      }

      resultados.push({ conversationId: conv.id, ok: true, waMessageId })
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e)
      console.error(`[forward] falha ao encaminhar para ${conv.id}:`, erro)
      resultados.push({ conversationId: conv.id, ok: false, erro })
    }
  }

  return { resultados }
})
