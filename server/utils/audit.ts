export type AuditInput = {
  success: boolean
  provider: 'datafy' | 'openai' | 'hub' | string
  action: string
  source?: string
  method?: string
  url?: string
  http_status?: number | null
  error_code?: string | null
  error_message?: string | null
  conversation_id?: string | null
  phone_number_id?: string | null
  wa_id?: string | null
  wa_message_id?: string | null
  duration_ms?: number | null
  request?: Record<string, unknown> | null
  response?: unknown
}

export type SendAuditMeta = {
  conversationId?: string
  source?: string
}

/**
 * Persiste uma linha em `audits`. Nunca lança e não bloqueia o envio.
 */
export function recordAudit(input: AuditInput): void {
  void persistAudit(input)
}

async function persistAudit(input: AuditInput): Promise<void> {
  try {
    const supabase = useSupabaseServer()
    const { error } = await supabase.from('audits').insert({
      success: input.success,
      provider: input.provider,
      action: input.action,
      source: input.source ?? null,
      method: input.method ?? 'POST',
      url: input.url ?? null,
      http_status: input.http_status ?? null,
      error_code: input.error_code ?? null,
      error_message: truncate(input.error_message, 2000),
      conversation_id: input.conversation_id ?? null,
      phone_number_id: input.phone_number_id ?? null,
      wa_id: input.wa_id ?? null,
      wa_message_id: input.wa_message_id ?? null,
      duration_ms: input.duration_ms ?? null,
      request: input.request ?? null,
      response: sanitizeJson(input.response),
    })
    if (error) {
      console.error('[audit] falha ao gravar:', error.message)
    }
  } catch (err) {
    console.error('[audit] falha inesperada ao gravar:', err)
  }
}

export function extractFetchError(err: any): {
  http_status: number | null
  error_code: string | null
  error_message: string
  response: unknown
} {
  const data = err?.data ?? err?.response?._data ?? err?.response?.data
  const graph = data?.error ?? data
  const code = graph?.code ?? graph?.error_code
  const message = String(
    graph?.error_data?.details || graph?.message || err?.message || 'Erro desconhecido',
  )
  const httpStatus = Number(err?.statusCode || err?.status || graph?.http_status) || null

  return {
    http_status: httpStatus,
    error_code: code != null ? String(code) : null,
    error_message: message,
    response: data ?? { message },
  }
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null
  return value.length > max ? value.slice(0, max) : value
}

function sanitizeJson(value: unknown): Record<string, unknown> | null {
  if (value == null) return null
  try {
    const raw = typeof value === 'string' ? value : JSON.stringify(value)
    const parsed = typeof value === 'string' ? safeParse(value) : JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>
    }
    return { value: parsed }
  } catch {
    return { raw: String(value).slice(0, 2000) }
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
