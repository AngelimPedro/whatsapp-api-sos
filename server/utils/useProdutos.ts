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
 * Busca produtos na API da SOS Cordas Belém.
 */
export async function useProdutos(query: string = ''): Promise<UseProdutosResult> {
  try {
    const response = await $fetch<any>('https://hub.soscordasbelem.com.br/api/produtos', {
      method: 'GET',
      query: {
        search: query
      }
    })

    const items = response?.results || []
    const mapped: Produto[] = items.map((item: any, idx: number) => ({
      id: idx + 1,
      nome: item.titulo || '',
      codigo: '',
      preco: item.valor || 0,
      precoCusto: 0,
      estoque: {
        saldoVirtualTotal: 5
      },
      tipo: 'F',
      situacao: 'A',
      formato: 'S',
      descricaoCurta: item.nome_categoria || '',
      imagemURL: item.imagem_url || '',
      subGroupName: item.nome_categoria || ''
    }))

    console.log(`[useProdutos] ✅ Busca "${query}" na SOS Cordas Belém concluída: ${mapped.length} produto(s) encontrado(s).`)
    return { data: mapped }
  } catch (error: any) {
    console.error(`[useProdutos] ❌ Erro ao buscar produtos para "${query}":`, error.message || error)
    return { data: [] }
  }
}
