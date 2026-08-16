interface DatafyMediaResponse {
  url: string
  mime_type?: string
  size?: number
}

/**
 * Resolve a URL pública de uma mídia a partir do media_id, via Datafy.
 *
 *   GET {DATAFY_API_URL}/media/{id}
 *   Authorization: Bearer {DATAFY_NUMBER_TOKEN}
 *   -> { url, mime_type, size }   (a url já é pública e estável)
 *
 * Retorna a `url` (ou null em falta de config / erro — a mensagem fica com
 * media_id preenchido e media_url nulo, dá pra reprocessar depois).
 */
export async function resolveMediaUrl(mediaId: string): Promise<string | null> {
  const config = useRuntimeConfig()
  const base = config.datafyApiUrl as string
  const token = config.datafyNumberToken as string

  if (!base || !token) {
    console.warn('[media] Datafy não configurado (DATAFY_API_URL / DATAFY_NUMBER_TOKEN)')
    return null
  }

  try {
    const res = await $fetch<DatafyMediaResponse>(`${base}/media/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res?.url ?? null
  } catch (e) {
    console.error('[media] falha ao resolver mídia', mediaId, e)
    return null
  }
}
