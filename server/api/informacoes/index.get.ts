interface Group {
  id: number
  name: string
}

interface Subgroup {
  id: number
  name: string
  groupId: number
}

interface SosCordasHomeResponse {
  groups: Group[]
  subgroups: Subgroup[]
  sales?: any[]
  highlights?: any[]
  bestSelling?: any[]
}

export default defineEventHandler(async (event) => {
  try {
    const token = process.env.SOS_CORDAS_TOKEN || '618d11b0-bdc7-41b7-bf35-3c39af19376e'

    const data = await $fetch<SosCordasHomeResponse>('https://api.soscordas.com.br/soscordas/v2/home', {
      method: 'GET',
      headers: {
        'Token': token
      }
    })

    if (!data || !data.groups || !data.subgroups) {
      throw new Error('Resposta da API externa inválida ou incompleta.')
    }

    // Mapeia os grupos em categorias com suas respectivas subcategorias
    const categorias = data.groups.map((group) => {
      const subcategorias = data.subgroups
        .filter((sub) => sub.groupId === group.id)
        .map((sub) => sub.name.trim())

      return {
        id: group.id,
        titulo: group.name.trim(),
        subcategorias
      }
    })

    return {
      error: false,
      message: 'Sucesso ao buscar informações',
      results: {
        categorias
      }
    }
  } catch (error: any) {
    console.error('[informacoes] Erro ao buscar dados da SOS Cordas:', error.message || error)
    return {
      error: true,
      message: `Erro ao buscar informações: ${error.message || 'Erro desconhecido'}`,
      results: null
    }
  }
})
