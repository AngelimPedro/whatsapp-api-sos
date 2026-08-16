export default defineEventHandler(async (event) => {
  try {
    const data = await $fetch<any>('https://hub.soscordasbelem.com.br/api/categorias', {
      method: 'GET'
    })

    if (!data || !data.results) {
      throw new Error('Resposta da API externa inválida ou incompleta.')
    }

    const categorias = data.results.map((c: any) => ({
      id: c.id,
      titulo: c.nome_categoria.trim(),
      subcategorias: [] // A nova API não possui subcategorias aninhadas
    }))

    return {
      error: false,
      message: 'Sucesso ao buscar categorias',
      results: {
        categorias
      }
    }
  } catch (error: any) {
    console.error('[informacoes] Erro ao buscar categorias:', error.message || error)
    return {
      error: true,
      message: `Erro ao buscar categorias: ${error.message || 'Erro desconhecido'}`,
      results: null
    }
  }
})
