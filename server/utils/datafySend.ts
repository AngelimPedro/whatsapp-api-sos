interface SendResponse {
  messages?: { id: string }[]
  contacts?: { wa_id: string }[]
}

/**
 * Envia mensagem de texto via Datafy (padrão Cloud API):
 *   POST {DATAFY_API_URL}/v1/{phoneNumberId}/messages
 *   Authorization: Bearer {DATAFY_NUMBER_TOKEN}
 * Retorna o wamid da mensagem criada (ou null).
 */
export async function sendTextMessage(
  phoneNumberId: string,
  to: string,
  text: string,
): Promise<string | null> {
  const config = useRuntimeConfig()
  const base = config.datafyApiUrl as string
  const token = config.datafyNumberToken as string

  if (!base || !token) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Datafy não configurado (DATAFY_API_URL / DATAFY_NUMBER_TOKEN).',
    })
  }

  const res = await $fetch<SendResponse>(`${base}/v1/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    },
  })

  return res?.messages?.[0]?.id ?? null
}

/**
 * Envia mensagem de imagem via Datafy (padrão Cloud API):
 *   POST {DATAFY_API_URL}/v1/{phoneNumberId}/messages
 *   Authorization: Bearer {DATAFY_NUMBER_TOKEN}
 * Retorna o wamid da mensagem criada (ou null).
 */
export async function sendImageMessage(
  phoneNumberId: string,
  to: string,
  imageUrl: string,
  caption?: string
): Promise<string | null> {
  const config = useRuntimeConfig()
  const base = config.datafyApiUrl as string
  const token = config.datafyNumberToken as string

  if (!base || !token) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Datafy não configurado (DATAFY_API_URL / DATAFY_NUMBER_TOKEN).',
    })
  }

  const res = await $fetch<SendResponse>(`${base}/v1/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: {
        link: imageUrl,
        ...(caption ? { caption } : {})
      },
    },
  })

  return res?.messages?.[0]?.id ?? null
}

