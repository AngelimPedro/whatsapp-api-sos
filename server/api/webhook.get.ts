/** Sanity check do webhook (útil pra testar o túnel ngrok no navegador). */
export default defineEventHandler(() => {
  return { ok: true, service: 'webhook', method: 'GET' }
})
