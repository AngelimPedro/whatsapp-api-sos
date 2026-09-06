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
  /** maior wa_timestamp (ISO) já visto — base do sync incremental (?since=) */
  lastTs?: string
}

/** Maior wa_timestamp (ISO) de um lote de mensagens. */
function maxWaTs(rows: MessageRow[]): string | null {
  let max: string | null = null
  for (const r of rows) {
    if (r.wa_timestamp && (!max || r.wa_timestamp > max)) max = r.wa_timestamp
  }
  return max
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

  /** Última falha de envio, para a UI mostrar em vez de sumir em silêncio. */
  const erroEnvio = ref('')

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
    if (!msgCache[id]) {
      loadFirstMensagens(id)
      return
    }
    // Cache quente aparece na hora, mas pode estar velho: se um evento do
    // Pusher se perdeu (aba em background, rede oscilando, encaminhamento
    // vindo de outra tela), o que falta só apareceria recarregando a página.
    // O sync incremental (?since=) cobre isso sem piscar a lista.
    syncActive()
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
        lastTs: maxWaTs(rows) ?? undefined,
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
  function pushNoCache(conversationId: string, msg: MensagemBalao, waTimestamp?: string | null) {
    const cache = msgCache[conversationId]
    if (!cache) return
    // dedup por wamid E por id da linha — mensagens sem wamid (agendador,
    // localização) escapavam da checagem antiga e entravam duplicadas
    const jaExiste = cache.items.some(
      (m) =>
        m.type === 'msg' &&
        ((!!msg.waMessageId && m.waMessageId === msg.waMessageId) || (!!msg.id && m.id === msg.id)),
    )
    if (jaExiste) return
    cache.items = [...cache.items, msg]
    // avança o marcador do sync incremental (base do ?since=)
    if (waTimestamp && (!cache.lastTs || waTimestamp > cache.lastTs)) cache.lastTs = waTimestamp
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
    } catch (e: any) {
      console.error('[chat] envio falhou:', e)
      const cache = msgCache[id]
      if (cache) {
        cache.items = cache.items.filter(
          (m) => !(m.type === 'msg' && m.clientId === clientId),
        )
      }
      const msg =
        e?.statusMessage ||
        e?.data?.statusMessage ||
        e?.message ||
        'Falha ao enviar a mensagem pelo WhatsApp.'
      if (import.meta.client) {
        window.alert(msg)
      }
    }
  }

  /** Texto legível de um erro de $fetch (statusMessage do servidor quando houver). */
  function textoDoErro(e: unknown): string {
    const err = e as { statusMessage?: string; statusCode?: number; message?: string }
    if (err?.statusMessage) return err.statusMessage
    if (err?.statusCode) return `Falha no envio (HTTP ${err.statusCode})`
    return err?.message || 'Falha no envio do arquivo.'
  }

  /** Envia um arquivo anexado pela conversa ativa: balão otimista + upload. */
  async function sendArquivo(file: File, legenda?: string) {
    const id = activeId.value
    if (!id || !file) return
    erroEnvio.value = ''

    const ehImagem = file.type === 'image/jpeg' || file.type === 'image/png'
    const kind: 'image' | 'document' = ehImagem ? 'image' : 'document'
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const clientId = `tmp-${++tmpSeq}`
    // preview local instantâneo p/ imagem (revogado após o envio)
    const localUrl = ehImagem ? URL.createObjectURL(file) : ''

    const otimista: MensagemBalao = ehImagem
      ? { type: 'msg', kind: 'image', from: 'out', time: hora, status: 'sent', clientId, url: localUrl, caption: legenda }
      : { type: 'msg', kind: 'document', from: 'out', time: hora, status: 'sent', clientId, url: '', filename: file.name, caption: legenda }

    pushMensagem(id, otimista, ehImagem ? legenda || '[Imagem]' : `[Arquivo] ${file.name}`)

    try {
      const form = new FormData()
      form.append('conversationId', id)
      if (legenda) form.append('caption', legenda)
      form.append('file', file)

      const res = await $fetch<{ waMessageId?: string | null; mediaUrl?: string | null }>(
        '/api/messages/send-media',
        { method: 'POST', body: form },
      )

      // casa o wamid + URL pública no balão otimista
      const cache = msgCache[id]
      if (cache) {
        cache.items = cache.items.map((m) => {
          if (m.type !== 'msg' || m.clientId !== clientId) return m
          const patched: MensagemBalao = { ...m, waMessageId: res?.waMessageId ?? undefined }
          if (res?.mediaUrl && (patched.kind === 'image' || patched.kind === 'document')) {
            patched.url = res.mediaUrl
            // agora que o balão aponta p/ a URL pública, libera o blob local
            if (localUrl) URL.revokeObjectURL(localUrl)
          }
          return patched
        })
      }

    } catch (e) {
      console.error('[chat] envio de arquivo falhou:', e)
      erroEnvio.value = textoDoErro(e)
      // envio rejeitado: remove o balão otimista p/ não mentir "enviado"
      const cache = msgCache[id]
      if (cache) {
        cache.items = cache.items.filter((m) => !(m.type === 'msg' && m.clientId === clientId))
      }
      if (localUrl) URL.revokeObjectURL(localUrl)
      return
    }

    // Fora do try acima de propósito: uma falha aqui é de sincronização, não
    // de envio. Dentro dele, qualquer erro cairia no catch e apagaria o balão
    // de uma mensagem que o cliente já recebeu.
    await syncActive()
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

    pushNoCache(conv.id, msg, msgRow.wa_timestamp)
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

  /**
   * Chamado após encaminhar: as cópias nasceram no servidor, então o cache
   * local dos destinos está desatualizado. A conversa aberta ressincroniza na
   * hora; as demais têm o cache descartado para recarregarem ao abrir.
   */
  async function aposEncaminhar(conversationIds: string[]) {
    for (const id of conversationIds) {
      if (id === activeId.value) continue
      delete msgCache[id]
    }
    await Promise.all([syncActive(), carregarFila(abaAtiva.value, true)])
  }

  /* ---------- sync incremental (reconexão / retorno de foco) ---------- */
  let sincronizando = false

  /**
   * Puxa as mensagens que chegaram na conversa aberta enquanto o websocket
   * esteve fora (PWA em background). Usa ?since=<lastTs> quando possível.
   */
  async function syncActive() {
    const id = activeId.value
    if (!id) return
    const cache = msgCache[id]
    // conversa aberta mas ainda sem cache -> carrega do zero
    if (!cache) {
      await loadFirstMensagens(id)
      return
    }
    if (sincronizando) return
    sincronizando = true
    try {
      const since = cache.lastTs
      // Sem marcador não dá para pedir "só o que é novo": buscar a primeira
      // página e ANEXAR duplicaria a conversa inteira. Recarrega substituindo.
      if (!since) {
        sincronizando = false
        await loadFirstMensagens(id)
        return
      }

      const rows = await $fetch<MessageRow[]>(`/api/conversations/${id}/messages`, {
        query: { since },
      })
      if (!rows.length) return

      // Dedup por id da linha E por wamid. Só wamid não bastava: mensagens do
      // agendador e de localização entram sem wamid, então voltavam a ser
      // anexadas a cada sync — era o que embaralhava a ordem da conversa.
      const idsExistentes = new Set(
        cache.items.filter((m): m is MensagemBalao => m.type === 'msg' && !!m.id).map((m) => m.id!),
      )
      const wamidsExistentes = new Set(
        cache.items
          .filter((m): m is MensagemBalao => m.type === 'msg' && !!m.waMessageId)
          .map((m) => m.waMessageId as string),
      )
      const novos = rows
        .slice()
        .reverse() // DESC -> ordem cronológica
        .map(mapMensagem)
        .filter((m) => {
          if (m.type !== 'msg') return true
          if (m.id && idsExistentes.has(m.id)) return false
          if (m.waMessageId && wamidsExistentes.has(m.waMessageId)) return false
          return true
        })
      if (novos.length) cache.items = [...cache.items, ...novos]
      const maxTs = maxWaTs(rows)
      if (maxTs && (!cache.lastTs || maxTs > cache.lastTs)) cache.lastTs = maxTs
    } catch (e) {
      console.error('[chat] sync ativo:', e)
    } finally {
      sincronizando = false
    }
  }

  /**
   * Ressincroniza tudo após reconexão/retorno de foco: mensagens perdidas da
   * conversa aberta + recarrega a fila da aba atual (novas conversas, prévias,
   * status atualizados).
   */
  async function resync() {
    await Promise.all([syncActive(), carregarFila(abaAtiva.value, true)])
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
    sendArquivo,
    onRealtimeMessage,
    onRealtimeStatus,
    erroEnvio,
    syncActive,
    resync,
    aposEncaminhar,
  }
})
