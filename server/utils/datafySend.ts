import sharp from 'sharp'

interface SendResponse {
  messages?: { id: string }[]
  contacts?: { wa_id: string }[]
}

interface MediaUploadResponse {
  id?: string
}

const WHATSAPP_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/jpg'])

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
  const { base, token } = getDatafyConfig()

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
 * Envia mensagem de imagem via Datafy.
 *
 * WhatsApp só aceita JPEG/PNG em mensagens de imagem. Produtos da loja
 * costumam vir em .webp — baixamos, convertemos para JPEG, fazemos upload
 * da mídia e enviamos pelo media id (mais confiável que link).
 */
export async function sendImageMessage(
  phoneNumberId: string,
  to: string,
  imageUrl: string,
  caption?: string
): Promise<string | null> {
  const { base, token } = getDatafyConfig()

  if (!imageUrl?.trim()) {
    throw new Error('URL da imagem vazia')
  }

  const prepared = await prepareImageForWhatsApp(imageUrl)
  const mediaId = await uploadMedia(phoneNumberId, prepared.buffer, prepared.mimeType, prepared.filename)

  const res = await $fetch<SendResponse>(`${base}/v1/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: {
        id: mediaId,
        ...(caption ? { caption } : {})
      },
    },
  })

  return res?.messages?.[0]?.id ?? null
}

/** Tipos de mídia que o encaminhamento sabe reenviar (imagem tem caminho próprio). */
export type MediaKind = 'audio' | 'video' | 'document' | 'sticker'

/**
 * Reenvia uma mídia a partir da URL já resolvida (media_url da mensagem
 * original). Baixa, sobe de novo como mídia nova e envia pelo media id —
 * o id da mídia recebida não é reutilizável para envio.
 */
export async function sendMediaMessage(
  phoneNumberId: string,
  to: string,
  kind: MediaKind,
  mediaUrl: string,
  caption?: string,
  filename?: string,
): Promise<string | null> {
  const { base, token } = getDatafyConfig()

  if (!mediaUrl?.trim()) {
    throw new Error('URL da mídia vazia')
  }

  const response = await fetch(mediaUrl)
  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia (${response.status}): ${mediaUrl}`)
  }
  const mimeType =
    (response.headers.get('content-type') || '').split(';')[0]!.trim() || 'application/octet-stream'
  const buffer = Buffer.from(await response.arrayBuffer())

  const mediaId = await uploadMedia(phoneNumberId, buffer, mimeType, filename || 'arquivo')

  // sticker e audio não aceitam caption na Cloud API
  const aceitaCaption = kind === 'video' || kind === 'document'
  const payload: Record<string, unknown> = { id: mediaId }
  if (aceitaCaption && caption) payload.caption = caption
  if (kind === 'document' && filename) payload.filename = filename

  const res = await $fetch<SendResponse>(`${base}/v1/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: kind,
      [kind]: payload,
    },
  })

  return res?.messages?.[0]?.id ?? null
}

/**
 * Envia um arquivo que o usuário anexou no chat (buffer em memória): faz o
 * upload da mídia e dispara a mensagem pelo media id. Retorna o wamid e o
 * media id (usado depois para resolver a URL pública e exibir o balão).
 *
 * kind: 'image' só para JPEG/PNG (exigência do WhatsApp); qualquer outro
 * arquivo vai como 'document', preservando o nome original.
 */
export async function sendFileMessage(
  phoneNumberId: string,
  to: string,
  kind: 'image' | 'document',
  buffer: Buffer,
  mimeType: string,
  filename: string,
  caption?: string,
): Promise<{ waMessageId: string | null; mediaId: string }> {
  const { base, token } = getDatafyConfig()

  const mediaId = await uploadMedia(phoneNumberId, buffer, mimeType, filename)

  const payload: Record<string, unknown> = { id: mediaId }
  if (caption) payload.caption = caption
  if (kind === 'document') payload.filename = filename

  const res = await $fetch<SendResponse>(`${base}/v1/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: kind,
      [kind]: payload,
    },
  })

  return { waMessageId: res?.messages?.[0]?.id ?? null, mediaId }
}

function getDatafyConfig(): { base: string; token: string } {
  const config = useRuntimeConfig()
  const base = config.datafyApiUrl as string
  const token = config.datafyNumberToken as string

  if (!base || !token) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Datafy não configurado (DATAFY_API_URL / DATAFY_NUMBER_TOKEN).',
    })
  }

  return { base, token }
}

/**
 * Baixa a imagem e garante JPEG/PNG compatível com WhatsApp.
 */
async function prepareImageForWhatsApp(imageUrl: string): Promise<{
  buffer: Buffer
  mimeType: 'image/jpeg' | 'image/png'
  filename: string
}> {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem (${response.status}): ${imageUrl}`)
  }

  const sourceType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  const arrayBuffer = await response.arrayBuffer()
  const sourceBuffer = Buffer.from(arrayBuffer)

  const looksWebp =
    sourceType === 'image/webp' ||
    imageUrl.toLowerCase().includes('.webp')

  if (!looksWebp && WHATSAPP_IMAGE_TYPES.has(sourceType)) {
    const mimeType = sourceType === 'image/png' ? 'image/png' : 'image/jpeg'
    return {
      buffer: sourceBuffer,
      mimeType,
      filename: mimeType === 'image/png' ? 'product.png' : 'product.jpg',
    }
  }

  // Converte webp (e qualquer outro formato) para JPEG
  const jpegBuffer = await sharp(sourceBuffer)
    .rotate()
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()

  console.log(`[datafySend] imagem convertida para JPEG (${sourceType || 'desconhecido'} → image/jpeg), ${jpegBuffer.length} bytes`)

  return {
    buffer: jpegBuffer,
    mimeType: 'image/jpeg',
    filename: 'product.jpg',
  }
}

/**
 * Faz upload da mídia no endpoint Cloud API da Datafy e retorna o media id.
 */
async function uploadMedia(
  phoneNumberId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const { base, token } = getDatafyConfig()

  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', mimeType)
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename)

  // fetch nativo: $fetch/ofetch às vezes quebra o boundary do multipart
  const uploadRes = await fetch(`${base}/v1/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })

  const raw = await uploadRes.text()
  if (!uploadRes.ok) {
    throw new Error(`Upload de mídia falhou (${uploadRes.status}): ${raw}`)
  }

  let res: MediaUploadResponse
  try {
    res = JSON.parse(raw)
  } catch {
    throw new Error(`Upload de mídia retornou JSON inválido: ${raw}`)
  }

  if (!res?.id) {
    throw new Error(`Upload de mídia sem id na resposta: ${raw}`)
  }

  return res.id
}
