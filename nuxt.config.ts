// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/whatsapp.css'],
  vite: {
    plugins: [tailwindcss()],
    server: {
      // libera o host do túnel (ngrok) no dev server do Vite, senão dá 403
      allowedHosts: ['.ngrok-free.dev', '.ngrok.io', '.ngrok.app'],
    },
  },
  modules: ['@pinia/nuxt'],
  components: [
    // Usa o nome do arquivo direto, sem prefixo de pasta
    // (ex: components/conversas/AreaConversas.vue -> <AreaConversas />)
    { path: '~/components', pathPrefix: false },
  ],
  runtimeConfig: {
    // privados (só no servidor) — todo acesso ao Supabase é server-side
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    // Datafy API (BSP) — só o token do número; sem verify token
    datafyApiUrl: process.env.DATAFY_API_URL,
    datafyNumberToken: process.env.DATAFY_NUMBER_TOKEN,
    datafyPhoneNumberId: process.env.DATAFY_PHONE_NUMBER_ID,
    // Pusher (server publica eventos)
    pusherAppId: process.env.PUSHER_APP_ID,
    pusherSecret: process.env.PUSHER_SECRET,
    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY,
    // Bling
    blingClientId: process.env.BLING_CLIENT_ID,
    blingClientSecret: process.env.BLING_CLIENT_SECRET,
    public: {
      // Pusher (client assina) — key/cluster são públicos por natureza
      pusherKey: process.env.PUSHER_KEY,
      pusherCluster: process.env.PUSHER_CLUSTER,
    },
  },
})
