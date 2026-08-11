/**
 * Lista de conversas paginada (20/página por padrão), filtrada por aba.
 *
 * Regras de filtro:
 * - entrada     → TODAS as conversas (independente do status)
 * - pedidos     → status = 'pedidos' E last_message_at no dia de hoje (UTC-3 / Brasília)
 * - demais abas → filtro exato por status
 *
 * Dessa forma, no dia seguinte as conversas de pedidos somem da aba Pedidos
 * automaticamente e ficam apenas na Entrada.
 */

/** aba -> status correspondente na tabela (não usado por 'entrada'). */
const STATUS_POR_ABA: Record<string, string> = {
  qualificado: 'qualificado',
  pedidos: 'pedidos',
  atendimento_humano: 'atendimento_humano',
  desqualificado: 'desqualificado',
}

/** Retorna o início do dia corrente no fuso de Brasília (UTC-3) como ISO UTC. */
function inicioDoDiaBrasilia(): string {
  const OFFSET_MS = -3 * 60 * 60 * 1000 // UTC-3
  const agora = new Date()
  const localMs = agora.getTime() + OFFSET_MS
  const localDate = new Date(localMs)
  // Zera hora/minuto/segundo no horário local → converte de volta p/ UTC
  const inicioLocalMs =
    Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate()) - OFFSET_MS
  return new Date(inicioLocalMs).toISOString()
}

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 50)
  const offset = Math.max(Number(q.offset) || 0, 0)
  const aba = typeof q.aba === 'string' && q.aba ? q.aba : null

  const abasValidas = ['entrada', ...Object.keys(STATUS_POR_ABA)]
  if (aba && !abasValidas.includes(aba)) {
    throw createError({ statusCode: 400, statusMessage: `aba desconhecida: ${aba}` })
  }

  const supabase = useSupabaseServer()

  // count exato p/ o contador da aba ativa no header
  let query = supabase.from('conversations').select('*', { count: 'exact' })

  if (aba === 'entrada') {
    // Entrada = todas as conversas, sem filtro de status
    // (nenhum .eq/.or adicional)
  } else if (aba === 'pedidos') {
    // Pedidos = status 'pedidos' cujo gatilho "resumo do pedido" foi disparado HOJE
    query = query
      .eq('status', 'pedidos')
      .gte('pedido_confirmado_at', inicioDoDiaBrasilia())
  } else if (aba) {
    query = query.eq('status', STATUS_POR_ABA[aba]!)
  }

  const { data, error, count } = await query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  return { items: data ?? [], total: count ?? 0 }
})
