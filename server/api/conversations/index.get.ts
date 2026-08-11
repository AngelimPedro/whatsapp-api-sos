/**
 * Lista de conversas paginada (20/página por padrão), filtrada por aba.
 *
 * O filtro é feito aqui e não no cliente: as abas são filas independentes e
 * uma fila movimentada (Entrada) não pode empurrar as outras para fora da
 * página. Sem isso, a aba Pedidos pode vir vazia só porque as 20 conversas
 * mais recentes eram todas de outro status.
 */

/** aba -> status correspondente na tabela. */
const STATUS_POR_ABA: Record<string, string> = {
  entrada: 'bot',
  qualificado: 'qualificado',
  pedidos: 'pedidos',
  atendimento_humano: 'atendimento_humano',
  desqualificado: 'desqualificado',
}

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 50)
  const offset = Math.max(Number(q.offset) || 0, 0)
  const aba = typeof q.aba === 'string' && q.aba ? q.aba : null

  if (aba && !STATUS_POR_ABA[aba]) {
    throw createError({ statusCode: 400, statusMessage: `aba desconhecida: ${aba}` })
  }

  const supabase = useSupabaseServer()

  // count exato p/ o contador da aba ativa no header
  let query = supabase.from('conversations').select('*', { count: 'exact' })

  if (aba) {
    query =
      aba === 'entrada'
        ? // linhas antigas podem não ter status; contam como Entrada
          query.or(`status.eq.${STATUS_POR_ABA[aba]},status.is.null`)
        : query.eq('status', STATUS_POR_ABA[aba]!)
  }

  const { data, error, count } = await query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  return { items: data ?? [], total: count ?? 0 }
})
