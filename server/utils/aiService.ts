import { AGENCY_INFO } from './agencyConfig'
import { useProdutos, type Produto } from './useProdutos'

interface AIResponse {
  reply: string
  status: 'bot' | 'atendimento_humano' | 'qualificado'
  imageUrl?: string
}

/**
 * Busca produtos na API do Bling com base em termos contidos na mensagem do cliente.
 * Por conta da limitação do Bling em realizar busca de nome apenas por prefixo exato,
 * buscamos por termos gerais de categoria (como ENCORDOAMENTO) e filtramos os resultados no JS.
 */
async function resolveBlingProducts(messageText: string): Promise<Produto[]> {
  const text = messageText.toLowerCase()
  const blingQueries: string[] = []

  // Se o texto mencionar algum instrumento ou cordas, buscamos por "ENCORDOAMENTO"
  const instrumentKeywords = [
    'baixo', 'guitarra', 'ukulele', 'violino', 'viola', 'cavaquinho', 
    'bandolim', 'corda', 'encordoamento'
  ]
  const hasInstrumentKeyword = instrumentKeywords.some(kw => text.includes(kw))

  if (hasInstrumentKeyword) {
    blingQueries.push('ENCORDOAMENTO')
  }

  // Violão é um caso especial: temos violões físicos e encordoamentos
  if (text.includes('violao') || text.includes('violão')) {
    blingQueries.push('VIOLAO')
    if (!blingQueries.includes('ENCORDOAMENTO')) {
      blingQueries.push('ENCORDOAMENTO')
    }
  }

  // Outros acessórios/categorias que podem ter produtos com nome iniciando pela palavra
  if (text.includes('afinador')) blingQueries.push('AFINADOR')
  if (text.includes('cabo')) blingQueries.push('CABO')
  if (text.includes('capa') || text.includes('bag')) blingQueries.push('CAPA')
  if (text.includes('palheta')) blingQueries.push('PALHETA')
  if (text.includes('suporte')) blingQueries.push('SUPORTE')
  if (text.includes('tarraxa')) blingQueries.push('TARRAXA')

  // Se nenhuma busca específica foi identificada, faz uma busca padrão
  if (blingQueries.length === 0) {
    blingQueries.push('VIOLAO')
  }

  // Executa as buscas necessárias em paralelo
  const results = await Promise.all(
    blingQueries.map(q => useProdutos(q))
  )

  // Consolida todos os produtos
  let allProdutos: Produto[] = []
  for (const res of results) {
    if (res?.data) {
      allProdutos.push(...res.data)
    }
  }

  // Remove duplicatas de ID (caso o mesmo produto venha de buscas diferentes)
  const uniqueMap = new Map<number, Produto>()
  for (const p of allProdutos) {
    uniqueMap.set(p.id, p)
  }
  allProdutos = Array.from(uniqueMap.values())

  // Refina e filtra no Javascript de acordo com os termos que o cliente buscou
  if (text.includes('baixo')) {
    allProdutos = allProdutos.filter(p => p.nome.toLowerCase().includes('baixo'))
  } else if (text.includes('guitarra')) {
    allProdutos = allProdutos.filter(p => p.nome.toLowerCase().includes('guitarra'))
  } else if (text.includes('ukulele')) {
    allProdutos = allProdutos.filter(p => p.nome.toLowerCase().includes('ukulele'))
  } else if (text.includes('violino')) {
    allProdutos = allProdutos.filter(p => p.nome.toLowerCase().includes('violino'))
  } else if (text.includes('viola')) {
    // Garante que "viola" não filtre também "violão"/"violao" acidentalmente
    allProdutos = allProdutos.filter(p => 
      p.nome.toLowerCase().includes('viola') && 
      !p.nome.toLowerCase().includes('violao') && 
      !p.nome.toLowerCase().includes('violão')
    )
  } else if (text.includes('cavaquinho')) {
    allProdutos = allProdutos.filter(p => p.nome.toLowerCase().includes('cavaquinho'))
  } else if (text.includes('bandolim')) {
    allProdutos = allProdutos.filter(p => p.nome.toLowerCase().includes('bandolim'))
  } else if (text.includes('violao') || text.includes('violão')) {
    allProdutos = allProdutos.filter(p => p.nome.toLowerCase().includes('violao') || p.nome.toLowerCase().includes('violão'))
  }

  return allProdutos
}

/**
 * Envia as mensagens e o contexto da agência para a OpenAI (GPT-4o-Mini)
 * e retorna a resposta formatada como JSON contendo o texto a enviar e o novo status.
 */
export async function getAIResponse(
  history: { role: 'user' | 'assistant'; content: string }[],
  latestMessage: string,
  contactName?: string
): Promise<AIResponse> {
  const config = useRuntimeConfig()
  const apiKey = config.openaiApiKey as string

  if (!apiKey) {
    console.warn('[aiService] OPENAI_API_KEY não configurada. Usando resposta de fallback.')
    return {
      reply: "Olá! No momento nosso sistema de inteligência artificial está em manutenção. Por favor, aguarde que um atendente humano irá falar com você em instantes! 👍",
      status: 'atendimento_humano'
    }
  }

  const produtos = await resolveBlingProducts(latestMessage)

  // Constrói a descrição detalhada dos produtos em destaque para injetar no prompt
  const produtosTxt = produtos.map(p => 
    `- ID: ${p.id}\n  Nome: ${p.nome}\n  Código: ${p.codigo || 'N/A'}\n  Preço: R$ ${p.preco}\n  Estoque disponível: ${p.estoque?.saldoVirtualTotal ?? 0} unidades\n  Descrição: ${p.descricaoCurta || 'Sem descrição cadastrada'}\n  Imagem: ${p.imagemURL || ''}`
  ).join('\n\n')

  // Constrói a lista geral de todas as categorias disponíveis (apenas nomes, sem itens específicos para evitar alucinações e forçar uso da API do Bling)
  const categoriasTxt = AGENCY_INFO.categorias.map(c => 
    `- ${c.nome}`
  ).join('\n')

  const systemPrompt = `Você é a inteligência artificial de atendimento da loja online "${AGENCY_INFO.nome}".
Sobre a loja:
- Descrição: ${AGENCY_INFO.descricao}
- Horário de Atendimento: ${AGENCY_INFO.horarioAtendimento}
- Contato: ${AGENCY_INFO.contato}
- Políticas e Envios: ${AGENCY_INFO.valoresSobre}

O nome do cliente é: ${contactName || 'Cliente'}. Use o primeiro nome dele de forma natural nas respostas se achar adequado (ex: "Pedro, qual é o teu endereço?").

PRODUTOS ENCONTRADOS NO ESTOQUE (PRODUTOS REAIS CADASTRADOS E INTEGRADOS VIA API DO BLING):
${produtosTxt || 'Nenhum produto correspondente retornado da API do Bling no momento.'}

CATEGORIAS DE PRODUTOS DISPONÍVEIS:
${categoriasTxt}

REGRAS DE CONVERSAÇÃO E FLUXO:
1. O status atual da conversa é "bot".
2. Diretriz de Tom de Voz: Seja extremamente objetivo, curto e direto. NUNCA use emojis em hipótese alguma. Evite saudações longas, textos de introdução formais ("Com certeza posso te ajudar com isso", "Fico feliz em atender") e palavras vazias. Vá direto ao ponto, respondendo como um atendente humano real de balcão de loja.
3. Se o cliente disser apenas "olá", "bom dia" ou perguntar se a loja está aberta, responda de forma muito curta e direta (ex: "Bom dia, Pedro. Estamos funcionando sim" ou "Olá, Pedro. Como posso ajudar?"). Mantenha o status "bot".
4. REQUISITO CRÍTICO: Sempre que o cliente perguntar sobre produtos ou opções disponíveis, liste APENAS e EXCLUSIVAMENTE os produtos retornados na seção "PRODUTOS ENCONTRADOS NO ESTOQUE" acima.
   - NUNCA invente produtos ou preços.
   - Apresente os itens e os preços de forma direta e limpa, sem rodeios.
   - Se a lista estiver vazia para a busca do cliente, informe que não há estoque e diga que vai transferir para um atendente verificar encomendas. Nesse caso, mude o status para "atendimento_humano".
5. Se o cliente fizer uma PERGUNTA DE DÚVIDA (ex: formas de pagamento, frete, prazos, dúvidas sobre compatibilidade de cordas ou se disser que quer falar com humano): diga de forma objetiva que vai transferir para um atendente. Altere o status para "atendimento_humano".
6. Se o cliente escolher ou demonstrar intenção clara de fechar/comprar um dos produtos (ex: "quero o violão folk mahogany"), peça o endereço de entrega de forma direta (ex: "Pedro, qual é o teu endereço?"). Mantenha o status "bot".
7. Se o cliente fornecer o endereço de entrega, diga apenas que um consultor entrará em contato em instantes para finalizar a compra e enviar os dados de pagamento. Altere o status para "qualificado".

IMAGENS DE PRODUTOS:
Se você estiver apresentando ou sugerindo um produto da seção "PRODUTOS ENCONTRADOS NO ESTOQUE" que possua uma URL no campo "Imagem", preencha o campo "imageUrl" no JSON de resposta com essa URL exata. Se não, deixe "imageUrl" como null ou vazio.

FORMATO DE RESPOSTA OBRIGATÓRIO (responda estritamente em JSON puro, sem markdown \`\`\`json):
{
  "reply": "O texto da resposta em português para enviar no WhatsApp do cliente. Super objetivo, conciso, sem emojis.",
  "status": "bot" | "atendimento_humano" | "qualificado",
  "imageUrl": "URL_DA_IMAGEM_SE_HOUVER"
}

Importante: Apenas o JSON puro na resposta.`

  // Monta as mensagens para a API
  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({
      role: h.role === 'user' ? 'user' as const : 'assistant' as const,
      content: h.content
    })),
    { role: 'user', content: latestMessage }
  ]

  try {
    const response = await $fetch<{
      choices: { message: { content: string } }[]
    }>('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: {
        model: 'gpt-4o-mini',
        messages: apiMessages,
        response_format: { type: 'json_object' },
        temperature: 0.7
      }
    })

    const contentStr = response?.choices?.[0]?.message?.content?.trim() ?? ''
    if (!contentStr) {
      throw new Error('Resposta vazia da OpenAI')
    }

    // Trata possíveis marcações de markdown de código no JSON
    let cleanJson = contentStr
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.substring(7)
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.substring(3)
    }
    if (cleanJson.endsWith('```')) {
      cleanJson = cleanJson.substring(0, cleanJson.length - 3)
    }
    cleanJson = cleanJson.trim()

    const parsed = JSON.parse(cleanJson) as AIResponse
    return {
      reply: parsed.reply || "Desculpe, não entendi muito bem. Poderia repetir?",
      status: parsed.status || 'bot'
    }
  } catch (e) {
    console.error('[aiService] Erro ao chamar a API da OpenAI:', e)
    return {
      reply: "Desculpe-me, tive uma instabilidade ao processar sua resposta. Pode repetir, por favor?",
      status: 'bot'
    }
  }
}
