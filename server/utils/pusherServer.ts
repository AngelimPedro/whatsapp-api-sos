import Pusher from 'pusher'
import type { ConversationRow, MessageRow } from '../../app/types/database'

/** Canal único por ora (single inbox). TODO: por número -> `inbox-${phoneNumberId}`. */
const CHANNEL = 'chat'

let client: Pusher | null = null

function getPusher(): Pusher | null {
  const c = useRuntimeConfig()
  const appId = c.pusherAppId as string
  const key = c.public.pusherKey as string
  const secret = c.pusherSecret as string
  const cluster = c.public.pusherCluster as string

  if (!appId || !key || !secret || !cluster) {
    console.warn('[pusher] não configurado (PUSHER_APP_ID/KEY/SECRET/CLUSTER)')
    return null
  }
  if (!client) client = new Pusher({ appId, key, secret, cluster, useTLS: true })
  return client
}

/** Nova mensagem (recebida ou echo) -> front. */
export async function publishNewMessage(conversation: ConversationRow, message: MessageRow) {
  try {
    await getPusher()?.trigger(CHANNEL, 'message:new', { conversation, message })
  } catch (e) {
    console.error('[pusher] publishNewMessage:', e)
  }
}

/** Atualização de status (sent/delivered/read) -> front. */
export async function publishStatus(waMessageId: string, status: string) {
  try {
    await getPusher()?.trigger(CHANNEL, 'message:status', { waMessageId, status })
  } catch (e) {
    console.error('[pusher] publishStatus:', e)
  }
}
