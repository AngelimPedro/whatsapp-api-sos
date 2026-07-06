import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database'

/**
 * Client Supabase de SERVIDOR, com a service role key.
 * ⚠️ Nunca importar isto em código que roda no browser — a service role
 * bypassa a RLS. Só usar dentro de handlers de `server/api`.
 */
let client: SupabaseClient<Database> | null = null

export function useSupabaseServer(): SupabaseClient<Database> {
  if (client) return client

  const config = useRuntimeConfig()
  const url = config.supabaseUrl as string
  const key = config.supabaseServiceKey as string

  if (!url || !key) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).',
    })
  }

  client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}
