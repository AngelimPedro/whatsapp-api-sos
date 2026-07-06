import type { Kind } from '../../app/types/chat'

/**
 * Normaliza o payload do webhook (formato Meta, repassado pela Datafy) em
 * uma lista plana de eventos: mensagens (recebidas/enviadas) e status.
 */

export interface ParsedMessage {
  type: 'message'
  direction: 'in' | 'out'
  phoneNumberId?: string
  displayPhoneNumber?: string
  wabaId?: string
  contactWaId: string // chave da conversa (o contato)
  contactName?: string
  contactUserId?: string
  waMessageId: string
  fromWaId: string
  toWaId?: string
  kind: Kind
  body?: string
  caption?: string
  mediaId?: string
  waTimestamp: string // ISO
}

export interface ParsedStatus {
  type: 'status'
  waMessageId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  waTimestamp: string
}

export type ParsedEvent = ParsedMessage | ParsedStatus

function toIso(ts: unknown): string {
  const n = Number(ts)
  return Number.isFinite(n) ? new Date(n * 1000).toISOString() : new Date().toISOString()
}

/** Extrai tipo + conteúdo de um objeto de mensagem (recebida ou echo). */
function extractContent(
  m: any,
): { kind: Kind; body?: string; caption?: string; mediaId?: string } {
  switch (m?.type) {
    case 'text':
      return { kind: 'text', body: m.text?.body }
    case 'image':
      return { kind: 'image', caption: m.image?.caption, mediaId: m.image?.id }
    case 'audio':
      return { kind: 'audio', mediaId: m.audio?.id }
    case 'video':
      return { kind: 'video', caption: m.video?.caption, mediaId: m.video?.id }
    case 'document':
      // filename vai no body (sem coluna dedicada), legenda no caption
      return { kind: 'document', body: m.document?.filename, caption: m.document?.caption, mediaId: m.document?.id }
    case 'sticker':
      return { kind: 'sticker', mediaId: m.sticker?.id }
    default:
      return { kind: 'text', body: `[tipo não suportado: ${m?.type}]` }
  }
}

export function parseWebhook(body: any): ParsedEvent[] {
  const events: ParsedEvent[] = []

  for (const entry of body?.entry ?? []) {
    const wabaId: string | undefined = entry?.id

    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {}
      const meta = value.metadata ?? {}
      const phoneNumberId: string | undefined = meta.phone_number_id
      const displayPhoneNumber: string | undefined = meta.display_phone_number

      // mapa de contatos (wa_id -> nome/userId)
      const contactMap: Record<string, { name?: string; userId?: string }> = {}
      for (const c of value.contacts ?? []) {
        if (c?.wa_id) contactMap[c.wa_id] = { name: c.profile?.name, userId: c.user_id }
      }

      // mensagens recebidas (direction = in)
      for (const m of value.messages ?? []) {
        const contact = contactMap[m.from] ?? {}
        events.push({
          type: 'message',
          direction: 'in',
          phoneNumberId,
          displayPhoneNumber,
          wabaId,
          contactWaId: m.from,
          contactName: contact.name,
          contactUserId: contact.userId,
          waMessageId: m.id,
          fromWaId: m.from,
          toWaId: displayPhoneNumber,
          ...extractContent(m),
          waTimestamp: toIso(m.timestamp),
        })
      }

      // echoes — enviadas pelo app Business (direction = out)
      for (const m of value.message_echoes ?? []) {
        const contact = contactMap[m.to] ?? {}
        events.push({
          type: 'message',
          direction: 'out',
          phoneNumberId,
          displayPhoneNumber,
          wabaId,
          contactWaId: m.to,
          contactName: contact.name,
          contactUserId: contact.userId,
          waMessageId: m.id,
          fromWaId: m.from,
          toWaId: m.to,
          ...extractContent(m),
          waTimestamp: toIso(m.timestamp),
        })
      }

      // status de entrega
      for (const s of value.statuses ?? []) {
        events.push({
          type: 'status',
          waMessageId: s.id,
          status: s.status,
          waTimestamp: toIso(s.timestamp),
        })
      }
    }
  }

  return events
}

/** Prévia textual da conversa, por tipo de mensagem. */
export function previewFor(kind: Kind, body?: string, caption?: string): string {
  switch (kind) {
    case 'text':
      return body ?? ''
    case 'image':
      return caption || '📷 Foto'
    case 'audio':
      return '🎤 Áudio'
    case 'video':
      return caption || '🎥 Vídeo'
    case 'document':
      return '📄 ' + (body || 'Documento')
    case 'sticker':
      return 'Figurinha'
    default:
      return body ?? ''
  }
}
