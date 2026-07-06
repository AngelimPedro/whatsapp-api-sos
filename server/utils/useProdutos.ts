import { useSupabaseServer } from './supabaseServer'

export interface Produto {
  id: number
  nome: string
  codigo: string
  preco: number
  precoCusto: number
  estoque: {
    saldoVirtualTotal: number
  }
  tipo: string
  situacao: string
  formato: string
  descricaoCurta: string
  imagemURL: string
}

export interface UseProdutosResult {
  data: Produto[]
}

/**
 * Busca produtos na API do Bling com renovação automática de token OAuth2 em caso de erro 401 (não autorizado).
 */
export async function useProdutos(query: string = 'VIOLAO'): Promise<UseProdutosResult> {
  const config = useRuntimeConfig()
  const clientId = config.blingClientId as string
  const clientSecret = config.blingClientSecret as string

  if (!clientId || !clientSecret) {
    console.error('[useProdutos] Credenciais do Bling não configuradas no runtimeConfig (BLING_CLIENT_ID / BLING_CLIENT_SECRET).')
    return { data: [] }
  }

  const supabase = useSupabaseServer()

  // 1) Busca os tokens atuais salvos no banco de dados (ID único 1)
  const { data: tokenRow, error: tokenError } = await supabase
    .from('bling_tokens')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (tokenError || !tokenRow) {
    console.error('[useProdutos] Erro ao buscar tokens do Bling no banco de dados:', tokenError?.message)
    return { data: [] }
  }

  const doApiCall = async (accessToken: string): Promise<any> => {
    return await $fetch<any>(`https://api.bling.com.br/Api/v3/produtos`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      query: { nome: query }
    })
  }

  try {
    // 2) Tenta realizar a chamada na API de produtos com o token de acesso atual
    const response = await doApiCall(tokenRow.access_token)
    return { data: response?.data || [] }
  } catch (err: any) {
    // 3) Se receber erro 401 (token expirado), inicia o fluxo de renovação automática
    if (err.statusCode === 401 || err.status === 401) {
      console.log('[useProdutos] ⚠️ Token expirado (401). Iniciando renovação automática do token...')
      try {
        const credenciaisBase64 = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

        const payload = new URLSearchParams()
        payload.append('grant_type', 'refresh_token')
        payload.append('refresh_token', tokenRow.refresh_token)

        const refreshResponse = await $fetch<any>('https://www.bling.com.br/Api/v3/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credenciaisBase64}`,
            'Accept': '1.0'
          },
          body: payload
        })

        if (!refreshResponse?.access_token || !refreshResponse?.refresh_token) {
          throw new Error('A resposta de renovação da API do Bling não retornou access_token ou refresh_token.')
        }

        console.log('✅ Token do Bling renovado com sucesso! Salvando novos valores no Supabase...')

        // Salva os novos tokens atualizados no banco de dados
        const { error: updateError } = await supabase
          .from('bling_tokens')
          .update({
            access_token: refreshResponse.access_token,
            refresh_token: refreshResponse.refresh_token,
            updated_at: new Date().toISOString()
          })
          .eq('id', 1)

        if (updateError) {
          console.error('[useProdutos] Erro ao persistir os novos tokens no banco:', updateError.message)
        }

        // 4) Refaz a requisição original de produtos usando o novo token recém-gerado
        console.log('[useProdutos] Refazendo busca de produtos com o novo token de acesso...')
        const retryResponse = await doApiCall(refreshResponse.access_token)
        return { data: retryResponse?.data || [] }

      } catch (refreshErr: any) {
        console.error('❌ Erro crítico ao tentar renovar o token do Bling:', refreshErr.message || refreshErr)
        return { data: [] }
      }
    } else {
      console.error('[useProdutos] Erro ao buscar produtos no Bling (não-401):', err.message || err)
      return { data: [] }
    }
  }
}
