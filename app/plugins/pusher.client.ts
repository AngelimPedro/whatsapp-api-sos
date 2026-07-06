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
})
