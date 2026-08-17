import sharp from "sharp";
import { extractFetchError, recordAudit, type SendAuditMeta } from "./audit";

interface SendResponse {
  messages?: { id: string }[];
  contacts?: { wa_id: string }[];
}

interface MediaUploadResponse {
  id?: string;
}

export type MediaKind = "audio" | "video" | "document" | "sticker";

const MEDIA_DEFAULTS: Record<
  MediaKind,
  { mimeType: string; filename: string }
> = {
  audio: { mimeType: "audio/ogg", filename: "audio.ogg" },
  video: { mimeType: "video/mp4", filename: "video.mp4" },
  document: { mimeType: "application/octet-stream", filename: "arquivo" },
  sticker: { mimeType: "image/webp", filename: "sticker.webp" },
};

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
  meta?: SendAuditMeta,
): Promise<string | null> {
  const { base, token } = getDatafyConfig();
  const url = `${base}/v1/${phoneNumberId}/messages`;
  const started = Date.now();
  const request = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text },
  };

  try {
    const res = await $fetch<SendResponse>(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: request,
    });

    const waMessageId = res?.messages?.[0]?.id ?? null;
    recordAudit({
      success: Boolean(waMessageId),
      provider: "datafy",
      action: "send_text",
      source: meta?.source,
      method: "POST",
      url,
      http_status: 200,
      error_message: waMessageId ? null : "Resposta sem wamid",
      conversation_id: meta?.conversationId,
      phone_number_id: phoneNumberId,
      wa_id: to,
      wa_message_id: waMessageId,
      duration_ms: Date.now() - started,
      request: { to, type: "text", text },
      response: res,
    });

    return waMessageId;
  } catch (err: any) {
    const parsed = extractFetchError(err);
    recordAudit({
      success: false,
      provider: "datafy",
      action: "send_text",
      source: meta?.source,
      method: "POST",
      url,
      http_status: parsed.http_status,
      error_code: parsed.error_code,
      error_message: parsed.error_message,
      conversation_id: meta?.conversationId,
      phone_number_id: phoneNumberId,
      wa_id: to,
      duration_ms: Date.now() - started,
      request: { to, type: "text", text },
      response: parsed.response,
    });
    throw err;
  }
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
  caption?: string,
  meta?: SendAuditMeta,
): Promise<string | null> {
  const { base, token } = getDatafyConfig();
  const url = `${base}/v1/${phoneNumberId}/messages`;
  const started = Date.now();
  const captionText =
    typeof caption === "string" && caption.trim()
      ? caption.trim().slice(0, 1024)
      : undefined;

  if (!imageUrl?.trim()) {
    throw new Error("URL da imagem vazia");
  }

  const prepared = await prepareImageForWhatsApp(imageUrl);
  const mediaId = await uploadMedia(
    phoneNumberId,
    prepared.buffer,
    prepared.mimeType,
    prepared.filename,
    meta,
  );

  try {
    const res = await $fetch<SendResponse>(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "image",
        image: {
          id: mediaId,
          ...(captionText ? { caption: captionText } : {}),
        },
      },
    });

    const waMessageId = res?.messages?.[0]?.id ?? null;
    recordAudit({
      success: Boolean(waMessageId),
      provider: "datafy",
      action: "send_image",
      source: meta?.source,
      method: "POST",
      url,
      http_status: 200,
      error_message: waMessageId ? null : "Resposta sem wamid",
      conversation_id: meta?.conversationId,
      phone_number_id: phoneNumberId,
      wa_id: to,
      wa_message_id: waMessageId,
      duration_ms: Date.now() - started,
      request: { to, type: "image", imageUrl, caption: captionText, mediaId },
      response: res,
    });

    return waMessageId;
  } catch (err: any) {
    const parsed = extractFetchError(err);
    recordAudit({
      success: false,
      provider: "datafy",
      action: "send_image",
      source: meta?.source,
      method: "POST",
      url,
      http_status: parsed.http_status,
      error_code: parsed.error_code,
      error_message: parsed.error_message,
      conversation_id: meta?.conversationId,
      phone_number_id: phoneNumberId,
      wa_id: to,
      duration_ms: Date.now() - started,
      request: { to, type: "image", imageUrl, caption: captionText, mediaId },
      response: parsed.response,
    });
    console.error("[datafySend] falha ao enviar imagem:", parsed);
    throw err;
  }
}

/**
 * Envia um arquivo já em memória (anexo do painel).
 * JPEG/PNG vão como imagem; qualquer outro tipo como documento.
 * Retorna wamid + mediaId para o hub persistir e resolver a URL pública.
 */
export async function sendFileMessage(
  phoneNumberId: string,
  to: string,
  kind: 'image' | 'document',
  buffer: Buffer,
  mimeType: string,
  filename: string,
  caption?: string,
  meta?: SendAuditMeta,
): Promise<{ waMessageId: string | null; mediaId: string }> {
  const { base, token } = getDatafyConfig()
  const url = `${base}/v1/${phoneNumberId}/messages`
  const started = Date.now()
  const captionText =
    typeof caption === 'string' && caption.trim() ? caption.trim().slice(0, 1024) : undefined

  let uploadBuffer = buffer
  let uploadMime = mimeType || 'application/octet-stream'
  let uploadName = filename || 'arquivo'

  if (kind === 'image') {
    const jpegBuffer = await sharp(buffer)
      .rotate()
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()
    uploadBuffer = jpegBuffer
    uploadMime = 'image/jpeg'
    uploadName = uploadName.replace(/\.[^.]+$/, '') + '.jpg'
  }

  const mediaId = await uploadMedia(phoneNumberId, uploadBuffer, uploadMime, uploadName, meta)

  const payload: Record<string, unknown> = { id: mediaId }
  if (captionText) payload.caption = captionText
  if (kind === 'document') payload.filename = uploadName

  try {
    const res = await $fetch<SendResponse>(url, {
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

    const waMessageId = res?.messages?.[0]?.id ?? null
    recordAudit({
      success: Boolean(waMessageId),
      provider: 'datafy',
      action: `send_file_${kind}`,
      source: meta?.source ?? 'painel',
      method: 'POST',
      url,
      http_status: 200,
      error_message: waMessageId ? null : 'Resposta sem wamid',
      conversation_id: meta?.conversationId,
      phone_number_id: phoneNumberId,
      wa_id: to,
      wa_message_id: waMessageId,
      duration_ms: Date.now() - started,
      request: { to, type: kind, filename: uploadName, mimeType: uploadMime, caption: captionText },
      response: res,
    })

    return { waMessageId, mediaId }
  } catch (err: any) {
    const parsed = extractFetchError(err)
    recordAudit({
      success: false,
      provider: 'datafy',
      action: `send_file_${kind}`,
      source: meta?.source ?? 'painel',
      method: 'POST',
      url,
      http_status: parsed.http_status,
      error_code: parsed.error_code,
      error_message: parsed.error_message,
      conversation_id: meta?.conversationId,
      phone_number_id: phoneNumberId,
      wa_id: to,
      duration_ms: Date.now() - started,
      request: { to, type: kind, filename: uploadName, mimeType: uploadMime, caption: captionText },
      response: parsed.response,
    })
    console.error('[datafySend] falha ao enviar arquivo:', parsed)
    throw err
  }
}

/**
 * Reenvia áudio, vídeo, documento ou sticker a partir de uma URL pública.
 * Usado no encaminhamento: baixa o arquivo, faz upload na Datafy e envia
 * pelo media id (o id original da mensagem recebida não serve para envio).
 */
export async function sendMediaMessage(
  phoneNumberId: string,
  to: string,
  kind: MediaKind,
  mediaUrl: string,
  caption?: string,
  filename?: string,
  meta?: SendAuditMeta,
): Promise<string | null> {
  const { base, token } = getDatafyConfig();
  const url = `${base}/v1/${phoneNumberId}/messages`;
  const started = Date.now();
  const captionText =
    typeof caption === "string" && caption.trim()
      ? caption.trim().slice(0, 1024)
      : undefined;

  if (!mediaUrl?.trim()) {
    throw new Error("URL da mídia vazia");
  }

  const downloaded = await downloadMedia(mediaUrl, kind, filename);
  const mediaId = await uploadMedia(
    phoneNumberId,
    downloaded.buffer,
    downloaded.mimeType,
    downloaded.filename,
    meta,
  );

  const payload = buildMediaPayload(
    kind,
    mediaId,
    captionText,
    downloaded.filename,
  );

  try {
    const res = await $fetch<SendResponse>(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: kind,
        ...payload,
      },
    });

    const waMessageId = res?.messages?.[0]?.id ?? null;
    recordAudit({
      success: Boolean(waMessageId),
      provider: "datafy",
      action: `send_${kind}`,
      source: meta?.source,
      method: "POST",
      url,
      http_status: 200,
      error_message: waMessageId ? null : "Resposta sem wamid",
      conversation_id: meta?.conversationId,
      phone_number_id: phoneNumberId,
      wa_id: to,
      wa_message_id: waMessageId,
      duration_ms: Date.now() - started,
      request: {
        to,
        type: kind,
        mediaUrl,
        caption: captionText,
        filename: downloaded.filename,
      },
      response: res,
    });

    return waMessageId;
  } catch (err: any) {
    const parsed = extractFetchError(err);
    recordAudit({
      success: false,
      provider: "datafy",
      action: `send_${kind}`,
      source: meta?.source,
      method: "POST",
      url,
      http_status: parsed.http_status,
      error_code: parsed.error_code,
      error_message: parsed.error_message,
      conversation_id: meta?.conversationId,
      phone_number_id: phoneNumberId,
      wa_id: to,
      duration_ms: Date.now() - started,
      request: {
        to,
        type: kind,
        mediaUrl,
        caption: captionText,
        filename: downloaded.filename,
      },
      response: parsed.response,
    });
    console.error(`[datafySend] falha ao enviar ${kind}:`, parsed);
    throw err;
  }
}

function buildMediaPayload(
  kind: MediaKind,
  mediaId: string,
  caption?: string,
  filename?: string,
): Record<string, unknown> {
  if (kind === "audio") {
    return { audio: { id: mediaId } };
  }
  if (kind === "sticker") {
    return { sticker: { id: mediaId } };
  }
  if (kind === "video") {
    return { video: { id: mediaId, ...(caption ? { caption } : {}) } };
  }
  return {
    document: {
      id: mediaId,
      ...(caption ? { caption } : {}),
      ...(filename ? { filename } : {}),
    },
  };
}

async function downloadMedia(
  mediaUrl: string,
  kind: MediaKind,
  filenameHint?: string,
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia (${response.status}): ${mediaUrl}`);
  }

  const fallback = MEDIA_DEFAULTS[kind];
  const sourceType = (response.headers.get("content-type") || "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  const mimeType = sourceType || fallback.mimeType;
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const fromUrl = mediaUrl.split("/").pop()?.split("?")[0];
  const filename = filenameHint?.trim() || fromUrl || fallback.filename;

  return { buffer, mimeType, filename };
}

function getDatafyConfig(): { base: string; token: string } {
  const config = useRuntimeConfig();
  const base = config.datafyApiUrl as string;
  const token = config.datafyNumberToken as string;

  if (!base || !token) {
    throw createError({
      statusCode: 500,
      statusMessage:
        "Datafy não configurado (DATAFY_API_URL / DATAFY_NUMBER_TOKEN).",
    });
  }

  return { base, token };
}

/**
 * Baixa a imagem e garante JPEG/PNG compatível com WhatsApp.
 */
async function prepareImageForWhatsApp(imageUrl: string): Promise<{
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  filename: string;
}> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem (${response.status}): ${imageUrl}`);
  }

  const sourceType = (response.headers.get("content-type") || "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  const arrayBuffer = await response.arrayBuffer();
  const sourceBuffer = Buffer.from(arrayBuffer);

  // WhatsApp só aceita JPEG/PNG 8-bit. Convertimos tudo para JPEG
  // (webp, png com perfil estranho, etc.) para evitar erro 131053.
  const jpegBuffer = await sharp(sourceBuffer)
    .rotate()
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  console.log(
    `[datafySend] imagem convertida para JPEG (${sourceType || "desconhecido"} → image/jpeg), ${jpegBuffer.length} bytes`,
  );

  return {
    buffer: jpegBuffer,
    mimeType: "image/jpeg",
    filename: "product.jpg",
  };
}

/**
 * Faz upload da mídia no endpoint Cloud API da Datafy e retorna o media id.
 */
async function uploadMedia(
  phoneNumberId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string,
  meta?: SendAuditMeta,
): Promise<string> {
  const { base, token } = getDatafyConfig();
  const url = `${base}/v1/${phoneNumberId}/media`;
  const started = Date.now();

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    filename,
  );

  // fetch nativo: $fetch/ofetch às vezes quebra o boundary do multipart
  const uploadRes = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const raw = await uploadRes.text();
  if (!uploadRes.ok) {
    recordAudit({
      success: false,
      provider: "datafy",
      action: "upload_media",
      source: meta?.source,
      method: "POST",
      url,
      http_status: uploadRes.status,
      error_message: raw.slice(0, 2000),
      conversation_id: meta?.conversationId,
      phone_number_id: phoneNumberId,
      duration_ms: Date.now() - started,
      request: { mimeType, filename, bytes: buffer.length },
      response: raw,
    });
    throw new Error(`Upload de mídia falhou (${uploadRes.status}): ${raw}`);
  }

  let res: MediaUploadResponse;
  try {
    res = JSON.parse(raw);
  } catch {
    recordAudit({
      success: false,
      provider: "datafy",
      action: "upload_media",
      source: meta?.source,
      method: "POST",
      url,
      http_status: uploadRes.status,
      error_message: "JSON inválido no upload de mídia",
      conversation_id: meta?.conversationId,
      phone_number_id: phoneNumberId,
      duration_ms: Date.now() - started,
      request: { mimeType, filename, bytes: buffer.length },
      response: raw,
    });
    throw new Error(`Upload de mídia retornou JSON inválido: ${raw}`);
  }

  const mediaId = res?.id || (res as any)?.media_id || (res as any)?.data?.id;
  if (!mediaId) {
    recordAudit({
      success: false,
      provider: "datafy",
      action: "upload_media",
      source: meta?.source,
      method: "POST",
      url,
      http_status: uploadRes.status,
      error_message: "Upload de mídia sem id na resposta",
      conversation_id: meta?.conversationId,
      phone_number_id: phoneNumberId,
      duration_ms: Date.now() - started,
      request: { mimeType, filename, bytes: buffer.length },
      response: res,
    });
    throw new Error(`Upload de mídia sem id na resposta: ${raw}`);
  }

  recordAudit({
    success: true,
    provider: "datafy",
    action: "upload_media",
    source: meta?.source,
    method: "POST",
    url,
    http_status: uploadRes.status,
    conversation_id: meta?.conversationId,
    phone_number_id: phoneNumberId,
    duration_ms: Date.now() - started,
    request: { mimeType, filename, bytes: buffer.length },
    response: { id: mediaId },
  });

  return String(mediaId);
}
