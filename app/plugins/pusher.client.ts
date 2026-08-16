import Pusher from 'pusher-js'

/**
 * Assina o canal do Pusher (client-only) e repassa os eventos pro store:
 *  - message:new    -> nova mensagem (recebida ou echo)
 *  - message:status -> atualização de status (sent/delivered/read)
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const key = config.public.pusherKey as string
  const cluster = config.public.pusherCluster as string

  if (!key || !cluster) {
    console.warn('[pusher] client não configurado (PUSHER_KEY / PUSHER_CLUSTER)')
    return
  }

  const chat = useChatStore()
  const pusher = new Pusher(key, { cluster })
  const channel = pusher.subscribe('chat')

  channel.bind('message:new', (data: any) => {
    if (data?.conversation && data?.message) {
      chat.onRealtimeMessage(data.conversation, data.message)
    }
  })

  channel.bind('message:status', (data: any) => {
    if (data?.waMessageId && data?.status) {
      chat.onRealtimeStatus(data.waMessageId, data.status)
    }
  })

  /**
   * Recuperação de mensagens perdidas quando o websocket cai — o cenário clássico
   * da PWA: ao voltar do background o socket foi derrubado e os eventos que
   * chegaram nesse intervalo nunca foram entregues. Ressincronizamos ao:
   *  - reconectar o Pusher (state connected)
   *  - a aba voltar a ficar visível / receber foco
   *  - a rede voltar (online)
   * Um pequeno debounce evita rajadas (visibilitychange + focus disparam juntos).
   */
  let t: ReturnType<typeof setTimeout> | null = null
  const resync = () => {
    if (t) clearTimeout(t)
    t = setTimeout(() => chat.resync(), 150)
  }

  // só ressincroniza em RECONEXÕES — a 1ª conexão é coberta pelo load inicial
  let jaConectou = false
  pusher.connection.bind('state_change', ({ current }: { current: string }) => {
    if (current !== 'connected') return
    if (jaConectou) resync()
    jaConectou = true
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resync()
  })
  window.addEventListener('focus', resync)
  window.addEventListener('online', resync)
})
