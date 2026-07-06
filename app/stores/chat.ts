import { defineStore } from 'pinia'
import type { Conversa, Mensagem, MensagemBalao } from '~/types/chat'
import type { ConversationRow, MessageRow } from '~/types/database'

const CONV_PAGE = 20
const MSG_PAGE = 50

interface MsgCache {
  items: Mensagem[]
  hasMore: boolean
}

export const useChatStore = defineStore('chat', () => {
  /* ---------- conversas ---------- */
  const conversas = ref<Conversa[]>([])
  const conversasLoaded = ref(false)
  const hasMoreConversas = ref(true)
  const loadingConversas = ref(false)

  /* ---------- mensagens (cache por conversa) ---------- */
  const msgCache = reactive<Record<string, MsgCache>>({})
  const loadingMensagens = ref(false)
  const loadingOlder = ref(false)

  const activeId = ref('')
  let tmpSeq = 0 // sequência p/ ids temporários do envio otimista

  // view da conversa ativa (lê do cache)
  const mensagens = computed<Mensagem[]>(() => msgCache[activeId.value]?.items ?? [])
  const hasMoreMensagens = computed(() => msgCache[activeId.value]?.hasMore ?? false)

  /* ---------- conversas: carga + paginação ---------- */
  async function loadConversas() {
    // já cacheado: não refaz, só garante uma conversa ativa
    if (conversasLoaded.value) {
      if (!activeId.value && conversas.value.length) selectConversa(conversas.value[0]!.id)
      return
    }
    conversas.value = []
    hasMoreConversas.value = true
    await loadMoreConversas(true)
    conversasLoaded.value = true
    if (!activeId.value && conversas.value.length) selectConversa(conversas.value[0]!.id)
  }

  async function loadMoreConversas(reset = false) {
    if (loadingConversas.value) return
    if (!reset && !hasMoreConversas.value) return
    loadingConversas.value = true
    try {
      const offset = reset ? 0 : conversas.value.length
      const rows = await $fetch<ConversationRow[]>('/api/conversations', {
        query: { limit: CONV_PAGE, offset },
      })
      const mapped = rows.map(mapConversa)
      conversas.value = reset ? mapped : [...conversas.value, ...mapped]
      hasMoreConversas.value = rows.length === CONV_PAGE
    } catch (e) {
      console.error('[chat] conversas:', e)
    } finally {
      loadingConversas.value = false
    }
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
  function pushMensagem(conversationId: string, msg: MensagemBalao, preview?: string) {
    const cache = msgCache[conversationId]
    if (cache) {
      // dedup por wamid (evita duplicar echo/reentrega do webhook)
      if (msg.waMessageId && cache.items.some((m) => m.type === 'msg' && m.waMessageId === msg.waMessageId)) {
        return
      }
      cache.items = [...cache.items, msg]
    }

    const idx = conversas.value.findIndex((c) => c.id === conversationId)
    if (idx >= 0) {
      const conv = { ...conversas.value[idx]!, time: msg.time ?? '', preview: preview ?? '' }
      // move pro topo
      conversas.value = [conv, ...conversas.value.filter((_, i) => i !== idx)]
    }
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
    const conversationId = convRow.id
    const mappedConv = mapConversa(convRow)
    
    const idx = conversas.value.findIndex((c) => c.id === conversationId)
    if (idx >= 0) {
      // Atualiza propriedades em tempo real (como status e reminder_sent)
      conversas.value[idx] = {
        ...conversas.value[idx]!,
        ...mappedConv
      }
    } else {
      // conversa nova que ainda não está na lista -> insere no topo
      conversas.value = [mappedConv, ...conversas.value]
    }
    pushMensagem(conversationId, msg, convRow.last_message_preview ?? undefined)
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
    activeId,
    mensagens,
    hasMoreConversas,
    hasMoreMensagens,
    loadingMensagens,
    loadingOlder,
    loadConversas,
    loadMoreConversas,
    selectConversa,
    loadOlderMensagens,
    pushMensagem,
    sendMensagem,
    onRealtimeMessage,
    onRealtimeStatus,
  }
})
