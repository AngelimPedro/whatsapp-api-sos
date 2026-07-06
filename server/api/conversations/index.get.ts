/** Lista de conversas paginada (20/página por padrão). */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 50)
  const offset = Math.max(Number(q.offset) || 0, 0)

  const supabase = useSupabaseServer()

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  return data ?? []
})
