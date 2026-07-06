import type { Conversa, Mensagem } from '~/types/chat'
import type { ConversationRow, MessageRow } from '~/types/database'

/* ---------- helpers de formatação ---------- */
export function fmtHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function fmtListaHora(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR')
}

export function iniciais(nome: string | null): string {
  if (!nome) return ''
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function basename(url: string | null): string {
  if (!url) return 'arquivo'
  return url.split('/').pop()?.split('?')[0] || 'arquivo'
}

/* ---------- mapeamento DB -> view ---------- */
export function mapConversa(row: ConversationRow): Conversa {
  return {
    id: row.id,
    name: row.contact_name ?? row.wa_id,
    time: fmtListaHora(row.last_message_at),
    preview: row.last_message_preview ?? '',
    initials: iniciais(row.contact_name),
    status: row.status,
    reminder_sent: row.reminder_sent,
  }
}

export function mapMensagem(row: MessageRow): Mensagem {
  const base = {
    type: 'msg' as const,
    id: row.id,
    waMessageId: row.wa_message_id ?? undefined,
    from: row.direction,
    time: fmtHora(row.wa_timestamp),
    status: row.status === 'failed' ? undefined : row.status ?? undefined,
  }
  const url = row.media_url ?? ''
  const caption = row.caption ?? undefined

  switch (row.kind) {
    case 'image':
      return { ...base, kind: 'image', url, caption }
    case 'audio':
      return { ...base, kind: 'audio', url }
    case 'video':
      return { ...base, kind: 'video', url, caption }
    case 'document': {
      // documento guarda o nome no body (sem coluna dedicada); fallback p/ URL
      const filename = row.body || basename(url)
      const ext = filename.includes('.') ? filename.split('.').pop()!.toUpperCase() : undefined
      return { ...base, kind: 'document', url, filename, ext, caption }
    }
    case 'sticker':
      return { ...base, kind: 'sticker', url }
    case 'text':
    default:
      return { ...base, kind: 'text', text: row.body ?? '' }
  }
}
