import { defineStore } from 'pinia'
import type { AbaKey, Conversa, Mensagem, MensagemBalao } from '~/types/chat'
import type { ConversationRow, ConversationsPage, MessageRow } from '~/types/database'

const CONV_PAGE = 20
const MSG_PAGE = 50

/** Todas as abas, na ordem em que existem no header. */
const ABAS: AbaKey[] = ['entrada', 'qualificado', 'pedidos', 'atendimento_humano', 'desqualificado']

interface MsgCache {
  items: Mensagem[]
  hasMore: boolean
}

/** Uma fila de conversas por aba, paginada de forma independente no servidor. */
interface FilaConversas {
  items: Conversa[]
  hasMore: boolean
  /** total no banco (não só o que já foi carregado) — alimenta o contador da aba */
  total: number
  loaded: boolean
  loading: boolean
}

const novaFila = (): FilaConversas => ({
  items: [],
  hasMore: true,
  total: 0,
  loaded: false,
  loading: false,
})

/**
 * Retorna true se o timestamp ISO estiver dentro do dia corrente no fuso de Brasília (UTC-3).
 * Espelha a lógica de `inicioDoDiaBrasilia()` do servidor.
 */
function isHojeBrasilia(isoTimestamp: string | null | undefined): boolean {
  if (!isoTimestamp) return false
  const OFFSET_MS = -3 * 60 * 60 * 1000 // UTC-3
  const agora = new Date()
  const localMs = agora.getTime() + OFFSET_MS
  const localDate = new Date(localMs)
  const inicioDoDia = new Date(
    Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate()) - OFFSET_MS,
  )
  return new Date(isoTimestamp) >= inicioDoDia
}

/**
 * Retorna as abas em que uma conversa deve aparecer de acordo com o status e a data.
 * - Entrada: SEMPRE (todas as conversas)
 * - Pedidos: somente se status === 'pedidos' e a última mensagem for de hoje
 * - Demais abas: pelo status exato
 */
function abasDe(conv: ConversationRow): AbaKey[] {
  const { status, pedido_confirmado_at } = conv
  const abas: AbaKey[] = ['entrada'] // entrada sempre recebe tudo

  if (status === 'pedidos') {
    // Só entra na fila de Pedidos se o gatilho "resumo do pedido" foi de hoje
    if (isHojeBrasilia(pedido_confirmado_at)) abas.push('pedidos')
  } else if (status && status !== 'bot') {
    abas.push(status as AbaKey)
  }

  return abas
}

export const useChatStore = defineStore('chat', () => {
  /* ---------- conversas (uma fila por aba) ---------- */
  const abaAtiva = ref<AbaKey>('entrada')
  const filas = reactive({
    entrada: novaFila(),
    qualificado: novaFila(),
    pedidos: novaFila(),
    atendimento_humano: novaFila(),
    desqualificado: novaFila(),
  }) as Record<AbaKey, FilaConversas>

  const conversas = computed(() => filas[abaAtiva.value].items)
  const hasMoreConversas = computed(() => filas[abaAtiva.value].hasMore)
  const totalConversas = computed(() => filas[abaAtiva.value].total)

  /* ---------- mensagens (cache por conversa) ---------- */
  const msgCache = reactive<Record<string, MsgCache>>({})
  const loadingMensagens = ref(false)
  const loadingOlder = ref(false)

  const activeId = ref('')
  let tmpSeq = 0 // sequência p/ ids temporários do envio otimista

  // view da conversa ativa (lê do cache)
  const mensagens = computed<Mensagem[]>(() => msgCache[activeId.value]?.items ?? [])
  const hasMoreMensagens = computed(() => msgCache[activeId.value]?.hasMore ?? false)

  // a conversa ativa pode estar numa aba que não é a que está na tela
  // (abriu a conversa e depois trocou de aba) -> procura em todas as filas
  const conversaAtiva = computed<Conversa | undefined>(() => {
    if (!activeId.value) return undefined
    for (const key of ABAS) {
      const c = filas[key].items.find((x) => x.id === activeId.value)
      if (c) return c
    }
    return undefined
  })

  /* ---------- conversas: carga + paginação (por aba) ---------- */
  async function carregarFila(aba: AbaKey, reset = false) {
    const fila = filas[aba]
    if (fila.loading) return
    if (!reset && !fila.hasMore) return
    fila.loading = true
    try {
      const offset = reset ? 0 : fila.items.length
      const res = await $fetch<ConversationsPage>('/api/conversations', {
        query: { limit: CONV_PAGE, offset, aba },
      })
      const mapped = res.items.map(mapConversa)
      fila.items = reset ? mapped : [...fila.items, ...mapped]
      fila.hasMore = res.items.length === CONV_PAGE
      fila.total = res.total
      fila.loaded = true
    } catch (e) {
      console.error('[chat] conversas:', e)
    } finally {
      fila.loading = false
    }
  }

  function garanteConversaAtiva() {
    if (!activeId.value && conversas.value.length) selectConversa(conversas.value[0]!.id)
  }

  /** Carrega a fila da aba atual (no-op se já estiver em cache). */
  async function loadConversas() {
    if (!filas[abaAtiva.value].loaded) await carregarFila(abaAtiva.value, true)
    garanteConversaAtiva()
  }

  /** Troca de aba: cada fila é buscada uma vez e fica em cache. */
  async function setAba(aba: AbaKey) {
    if (abaAtiva.value === aba) return
    abaAtiva.value = aba
    if (!filas[aba].loaded) await carregarFila(aba, true)
    garanteConversaAtiva()
  }

  async function loadMoreConversas() {
    await carregarFila(abaAtiva.value)
  }

  /* ---------- mensagens: seleção usa cache ---------- */
  function selectConversa(id: string) {
    activeId.value = id
    // cache hit -> instantâneo, sem refetch
    if (!msgCache[id]) loadFirstMensagens(id)
  }

  async function loadFirstMensagens(id: string) {
    loadingMensagens.value = true
    try {
      const rows = await $fetch<MessageRow[]>(`/api/conversations/${id}/messages`, {
        query: { limit: MSG_PAGE, offset: 0 },
      })
      // vem DESC -> reverte p/ ordem cronológica
      msgCache[id] = {
        items: rows.map(mapMensagem).reverse(),
        hasMore: rows.length === MSG_PAGE,
      }
    } catch (e) {
      console.error('[chat] mensagens:', e)
    } finally {
      loadingMensagens.value = false
    }
  }

  async function loadOlderMensagens() {
    const id = activeId.value
    const cache = msgCache[id]
    if (loadingOlder.value || !cache?.hasMore || !id) return
    loadingOlder.value = true
    try {
      const rows = await $fetch<MessageRow[]>(`/api/conversations/${id}/messages`, {
        query: { limit: MSG_PAGE, offset: cache.items.length },
      })
      const older = rows.map(mapMensagem).reverse()
      cache.items = [...older, ...cache.items]
      cache.hasMore = rows.length === MSG_PAGE
    } catch (e) {
      console.error('[chat] mensagens (older):', e)
    } finally {
      loadingOlder.value = false
    }
  }

  /* ---------- mutação local (Pusher/envio entram por aqui) ---------- */
  /**
   * Insere uma mensagem no cache da conversa e atualiza a prévia/posição na lista.
   * Usado tanto pelo envio otimista quanto pelo recebimento via Pusher.
   */
  function pushNoCache(conversationId: string, msg: MensagemBalao) {
    const cache = msgCache[conversationId]
    if (!cache) return
    // dedup por wamid (evita duplicar echo/reentrega do webhook)
    if (msg.waMessageId && cache.items.some((m) => m.type === 'msg' && m.waMessageId === msg.waMessageId)) {
      return
    }
    cache.items = [...cache.items, msg]
  }

  /** Atualiza prévia/horário e move pro topo, na fila em que a conversa estiver. */
  function tocaConversa(conversationId: string, time: string, preview?: string) {
    for (const key of ABAS) {
      const fila = filas[key]
      const idx = fila.items.findIndex((c) => c.id === conversationId)
      if (idx < 0) continue
      const conv = { ...fila.items[idx]!, time, preview: preview ?? '' }
      fila.items = [conv, ...fila.items.filter((_, i) => i !== idx)]
    }
  }

  function pushMensagem(conversationId: string, msg: MensagemBalao, preview?: string) {
    pushNoCache(conversationId, msg)
    tocaConversa(conversationId, msg.time ?? '', preview)
  }

  /** Envia texto pela conversa ativa: update otimista + POST no endpoint. */
  async function sendMensagem(text: string) {
    const id = activeId.value
    const corpo = text.trim()
    if (!id || !corpo) return

    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const clientId = `tmp-${++tmpSeq}`
    // otimista
    pushMensagem(id, { type: 'msg', kind: 'text', from: 'out', text: corpo, time: hora, status: 'sent', clientId }, corpo)

    try {
      const res = await $fetch<{ waMessageId?: string | null }>('/api/messages/send', {
        method: 'POST',
        body: { conversationId: id, text: corpo },
      })
      // casa o wamid no balão otimista (p/ status realtime e dedup)
      const wamid = res?.waMessageId
      const cache = msgCache[id]
      if (wamid && cache) {
        cache.items = cache.items.map((m) =>
          m.type === 'msg' && m.clientId === clientId ? { ...m, waMessageId: wamid } : m,
        )
      }
    } catch (e) {
      console.error('[chat] envio falhou:', e)
      // TODO: marcar a mensagem otimista como 'failed'
    }
  }

  /* ---------- realtime (Pusher) ---------- */
  function onRealtimeMessage(convRow: ConversationRow, msgRow: MessageRow) {
    const msg = mapMensagem(msgRow) as MensagemBalao
    const conv = mapConversa(convRow)
    // Conjunto de abas em que esta conversa deve aparecer (pode ser múltiplas)
    const destinos = new Set(abasDe(convRow))

    for (const key of ABAS) {
      const fila = filas[key]
      const idx = fila.items.findIndex((c) => c.id === conv.id)

      if (destinos.has(key)) {
        // conversa deve estar nesta fila: atualiza ou insere no topo
        if (idx >= 0) {
          fila.items = [conv, ...fila.items.filter((_, i) => i !== idx)]
        } else if (fila.loaded) {
          // só insere em filas já carregadas (evitar furos na paginação)
          fila.items = [conv, ...fila.items]
          fila.total++
        }
      } else if (idx >= 0) {
        // conversa saiu desta fila (ex: pedido de ontem não vai p/ Pedidos)
        fila.items = fila.items.filter((_, i) => i !== idx)
        fila.total = Math.max(0, fila.total - 1)
      }
    }

    pushNoCache(conv.id, msg)
  }

  function onRealtimeStatus(waMessageId: string, status: string) {
    const st = (status === 'failed' ? undefined : status) as MensagemBalao['status']
    for (const cid in msgCache) {
      const items = msgCache[cid]!.items
      const i = items.findIndex((m) => m.type === 'msg' && m.waMessageId === waMessageId)
      if (i >= 0) {
        const next = items.slice()
        next[i] = { ...(items[i] as MensagemBalao), status: st }
        msgCache[cid]!.items = next
        break
      }
    }
  }

  return {
    conversas,
    conversaAtiva,
    abaAtiva,
    totalConversas,
    activeId,
    mensagens,
    hasMoreConversas,
    hasMoreMensagens,
    loadingMensagens,
    loadingOlder,
    loadConversas,
    loadMoreConversas,
    setAba,
    selectConversa,
    loadOlderMensagens,
    pushMensagem,
    sendMensagem,
    onRealtimeMessage,
    onRealtimeStatus,
  }
})
