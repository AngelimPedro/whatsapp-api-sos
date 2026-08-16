/**
 * Mensagens de uma conversa, paginadas (50/página por padrão).
 * Retorna em ordem DESC (mais recentes primeiro): offset 0 = página mais nova.
 * O front reverte para exibir em ordem cronológica e prepende ao subir.
 *
 * Param adicional:
 *   ?since=<ISO> → retorna apenas mensagens com wa_timestamp > since (sem paginação por offset).
 *   Usado pelo sync-on-focus do cliente para recuperar mensagens perdidas quando
 *   o Pusher estava desconectado (app em background).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id da conversa é obrigatório' })
  }

  const q = getQuery(event)
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 100)
  const offset = Math.max(Number(q.offset) || 0, 0)
  const since = typeof q.since === 'string' && q.since ? q.since : null

  const supabase = useSupabaseServer()

  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('wa_timestamp', { ascending: false })

  if (since) {
    // Modo incremental: só as mensagens mais novas que o timestamp dado
    query = query.gt('wa_timestamp', since).limit(limit)
  } else {
    // Modo paginado normal
    query = query.range(offset, offset + limit - 1)
  }

  const { data, error } = await query

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  return data ?? []
})

