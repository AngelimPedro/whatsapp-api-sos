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
  subGroupName?: string
}

export interface UseProdutosResult {
  data: Produto[]
}

/**
 * Busca produtos na API da SOS Cordas.
 */
export async function useProdutos(query: string = ''): Promise<UseProdutosResult> {
  const token = process.env.SOS_CORDAS_TOKEN || '618d11b0-bdc7-41b7-bf35-3c39af19376e'

  try {
    const response = await $fetch<any>('https://api.soscordas.com.br/soscordas/v2/product', {
      method: 'GET',
      headers: {
        'Token': token
      },
      query: {
        active: '',
        q: query,
        page: '',
        limit: '15'
      }
    })

    const items = response?.data || []
    const mapped: Produto[] = items.map((item: any) => ({
      id: item.id,
      nome: item.name,
      codigo: item.reference || '',
      preco: item.promotionValue > 0 ? item.promotionValue : item.saleValue,
      precoCusto: 0,
      estoque: {
        saldoVirtualTotal: 5 // Valor padrão
      },
      tipo: 'F',
      situacao: 'A',
      formato: 'S',
      descricaoCurta: item.subGroupName || '',
      imagemURL: item.image?.image || '',
      subGroupName: item.subGroupName || ''
    }))

    console.log(`[useProdutos] ✅ Busca "${query}" na SOS Cordas concluída: ${mapped.length} produto(s) encontrado(s).`)
    return { data: mapped }
  } catch (error: any) {
    console.error(`[useProdutos] ❌ Erro ao buscar produtos para "${query}":`, error.message || error)
    return { data: [] }
  }
}
