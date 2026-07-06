/**
 * Tipos do schema do Supabase.
 * Escritos à mão por ora — depois podem ser gerados com:
 *   supabase gen types typescript --linked > app/types/database.ts
 */
import type { Direcao, Kind, Status } from '~/types/chat'

// NOTA: usar `type` (não `interface`) — o supabase-js exige que cada tabela
// satisfaça Record<string, unknown> (GenericSchema). Interfaces não têm index
// signature implícita e fariam o schema degradar para `never`.
export type ConversationRow = {
  id: string
  phone_number_id: string
  display_phone_number: string | null
  waba_id: string | null
  wa_id: string
  contact_name: string | null
  contact_user_id: string | null
  last_message_preview: string | null
  last_message_at: string | null
  unread_count: number
  created_at: string
  updated_at: string
  status: 'bot' | 'atendimento_humano' | 'qualificado' | 'desqualificado'
  reminder_sent: boolean
}

export type MessageRow = {
  id: string
  conversation_id: string
  wa_message_id: string | null
  direction: Direcao
  kind: Kind
  from_wa_id: string | null
  to_wa_id: string | null
  body: string | null
  caption: string | null
  media_id: string | null
  media_url: string | null
  status: Status | 'failed' | null
  wa_timestamp: string | null
  created_at: string
}

export type BlingTokenRow = {
  id: number
  access_token: string
  refresh_token: string
  updated_at: string
}

type InsertOf<T> = Partial<T>
type UpdateOf<T> = Partial<T>

export interface Database {
  public: {
    Tables: {
      conversations: {
        Row: ConversationRow
        Insert: InsertOf<ConversationRow>
        Update: UpdateOf<ConversationRow>
        Relationships: []
      }
      messages: {
        Row: MessageRow
        Insert: InsertOf<MessageRow>
        Update: UpdateOf<MessageRow>
        Relationships: []
      }
      bling_tokens: {
        Row: BlingTokenRow
        Insert: InsertOf<BlingTokenRow>
        Update: UpdateOf<BlingTokenRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
