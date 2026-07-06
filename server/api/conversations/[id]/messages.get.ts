/**
 * Mensagens de uma conversa, paginadas (50/página por padrão).
 * Retorna em ordem DESC (mais recentes primeiro): offset 0 = página mais nova.
 * O front reverte para exibir em ordem cronológica e prepende ao subir.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id da conversa é obrigatório' })
  }

  const q = getQuery(event)
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 100)
  const offset = Math.max(Number(q.offset) || 0, 0)

  const supabase = useSupabaseServer()

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('wa_timestamp', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  return data ?? []
})
