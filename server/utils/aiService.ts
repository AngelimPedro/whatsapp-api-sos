import { AGENCY_INFO } from './agencyConfig'
import { useProdutos, type Produto } from './useProdutos'

interface AIResponse {
  reply: string
  status: 'bot' | 'atendimento_humano' | 'qualificado'
  imageUrl?: string
  messagesToSend?: { type: 'text' | 'image'; text?: string; imageUrl?: string }[]
}

let cachedCategories: string[] | null = null
let cacheTimestamp = 0

/**
 * Busca categorias da SOS Cordas Belém.
 */
async function getCategories(): Promise<string[]> {
  const now = Date.now()
  if (cachedCategories && (now - cacheTimestamp < 5 * 60 * 1000)) {
    return cachedCategories
  }

  try {
    const data = await $fetch<any>('https://hub.soscordasbelem.com.br/api/categorias', {
      method: 'GET'
    })
    if (data?.results) {
      cachedCategories = data.results.map((c: any) => c.nome_categoria.trim())
      cacheTimestamp = now
      return cachedCategories!
    }
  } catch (err) {
    console.error('[aiService] Erro ao buscar categorias:', err)
  }
  return cachedCategories || []
}

/**
 * Classifica a intenção do cliente com base no histórico e lista de categorias.
 */
async function classifyIntent(
  latestMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  categories: string[],
  apiKey: string
): Promise<{ exactMatch: string | null; suggestedCategories: string[] }> {
  try {
    const systemPrompt = `Você é um classificador inteligente de intenções para um chatbot de e-commerce de instrumentos musicais.
Você deve analisar a última mensagem do cliente e o histórico da conversa para identificar se ele está procurando por produtos e qual categoria exata da nossa loja melhor corresponde à sua busca.

LISTA DE CATEGORIAS EXISTENTES:
${categories.map(c => `- ${c}`).join('\n')}

REGRAS:
1. Se a última mensagem ou a escolha recente do cliente corresponder de forma clara a UMA categoria da lista (permita variações, sinônimos, erros de digitação, ex: "cordas de guitarra" ou "guitarra" ou "violao nylon"), defina "exactMatch" com o NOME EXATO da categoria (exemplo: "Cordas de Guitarra").
2. Se a mensagem for relacionada a produtos mas for ampla (ex: "gostaria de saber sobre cordas"), retorne "exactMatch" como null e liste as categorias semelhantes/relacionadas em "suggestedCategories" (máximo de 8).
3. Se a pesquisa do cliente não for semelhante a NENHUMA categoria (ex: digitou algo totalmente fora do contexto, ou apenas uma saudação como "olá", ou uma dúvida de frete/pagamento), retorne "exactMatch" como null e "suggestedCategories" como um array vazio.

FORMATO DE RESPOSTA:
Retorne estritamente um objeto JSON com esta estrutura (sem formatação markdown \`\`\`json):
{
  "exactMatch": "NOME_DA_CATEGORIA_OU_NULL",
  "suggestedCategories": ["CATEGORIA_1", "CATEGORIA_2", ...]
}
`

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
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map(h => ({
            role: h.role === 'user' ? 'user' as const : 'assistant' as const,
            content: h.content
          })),
          { role: 'user', content: latestMessage }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      }
    })

    const contentStr = response?.choices?.[0]?.message?.content?.trim() ?? ''
    
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

    const parsed = JSON.parse(cleanJson)
    return {
      exactMatch: parsed.exactMatch || null,
      suggestedCategories: parsed.suggestedCategories || []
    }
  } catch (e) {
    console.error('[aiService] Erro ao classificar intenção:', e)
    return { exactMatch: null, suggestedCategories: [] }
  }
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

  // 1) Busca categorias dinâmicas da API da SOS Cordas
  const categories = await getCategories()

  // 2) Classifica a intenção do usuário
  const classification = await classifyIntent(latestMessage, history, categories, apiKey)
  console.log('[aiService] Classificação da busca:', classification)

  let produtos: Produto[] = []
  let contextInstruction = ""
  let isSuggested = false

  if (classification.exactMatch) {
    // 3) Busca os produtos exatos da categoria identificada
    produtos = (await useProdutos(classification.exactMatch)).data
    
    const produtosTxt = produtos.map(p => 
      `- Título: ${p.nome}\n  Categoria: ${p.descricaoCurta}\n  Valor: R$ ${p.preco}\n  Imagem: ${p.imagemURL}`
    ).join('\n\n')

    contextInstruction = `O cliente está buscando produtos da categoria específica "${classification.exactMatch}".
Abaixo estão os produtos reais encontrados no estoque da loja para esta categoria. 
Nós vamos enviar as imagens destes produtos separadamente no WhatsApp com o formato "titulo - descrição - valor" no rodapé/caption.
Escreva um texto de introdução muito direto e conciso, informando que encontrou as opções de "${classification.exactMatch}".

PRODUTOS ENCONTRADOS NO ESTOQUE:
${produtosTxt || 'Nenhum produto correspondente retornado da API.'}
`
  } else if (classification.suggestedCategories && classification.suggestedCategories.length > 0) {
    // 4) Se for uma busca abrangente, sugere categorias relevantes
    isSuggested = true
    contextInstruction = `A busca do cliente foi abrangente. 
Nós vamos enviar as categorias sugeridas separadamente como mensagens individuais no WhatsApp.
Escreva APENAS uma frase de introdução muito objetiva, perguntando qual destas categorias ele gostaria de ver. 
IMPORTANTE: NUNCA liste as categorias no seu texto de reply, pois nós faremos isso programaticamente.`
  } else {
    // 5) Sem relação direta
    const isSearchingProduct = latestMessage.toLowerCase().includes('quero') || 
                              latestMessage.toLowerCase().includes('busco') || 
                              latestMessage.toLowerCase().includes('tem') || 
                              latestMessage.toLowerCase().includes('vende') || 
                              latestMessage.toLowerCase().includes('corda') ||
                              latestMessage.toLowerCase().includes('produto')

    if (isSearchingProduct) {
      isSuggested = true
      contextInstruction = `O cliente está procurando por algo que não corresponde diretamente a nenhuma de nossas categorias. 
Nós vamos enviar a lista de todas as categorias existentes separadamente como mensagens individuais no WhatsApp.
Escreva APENAS uma frase de introdução educada e muito curta, explicando que não encontramos a correspondência exata, e pergunte se ele deseja ver alguma de nossas categorias disponíveis.
IMPORTANTE: NUNCA liste as categorias no seu texto de reply, pois nós faremos isso programaticamente.`
      classification.suggestedCategories = categories
    } else {
      contextInstruction = `O cliente iniciou uma conversa casual ou fez uma pergunta geral (como formas de pagamento, frete, falar com humano). Responda de forma extremamente concisa e objetiva de acordo com as regras gerais da loja.`
    }
  }

  const systemPrompt = `Você é a inteligência artificial de atendimento da loja online "${AGENCY_INFO.nome}".
Sobre a loja:
- Descrição: ${AGENCY_INFO.descricao}
- Horário de Atendimento: ${AGENCY_INFO.horarioAtendimento}
- Contato: ${AGENCY_INFO.contato}
- Políticas e Envios: ${AGENCY_INFO.valoresSobre}

O nome do cliente é: ${contactName || 'Cliente'}. Use o primeiro nome dele de forma natural nas respostas se achar adequado.

CONTEXTO DE PRODUTOS E BUSCA DO CLIENTE:
${contextInstruction}

REGRAS DE CONVERSAÇÃO E FLUXO:
1. O status atual da conversa é "bot".
2. Diretriz de Tom de Voz: Seja extremamente objetivo, curto e direto. NUNCA use emojis em hipótese alguma. Vá direto ao ponto.
3. Se o cliente disser apenas "olá", "bom dia" ou perguntar se a loja está aberta, responda de forma muito curta e direta. Mantenha o status "bot".
4. REQUISITO CRÍTICO: Não invente produtos ou preços.
5. Se a lista de produtos da categoria estiver vazia, informe que não há estoque no momento e diga que vai transferir para um atendente verificar encomendas. Nesse caso, mude o status para "atendimento_humano".
6. Se o cliente demonstrar intenção clara de fechar/comprar um dos produtos apresentados, peça o endereço de entrega de forma direta. Mantenha o status "bot".
7. Se o cliente fornecer o endereço de entrega, diga apenas que um consultor entrará em contato em instantes para finalizar a compra e enviar os dados de pagamento. Altere o status para "qualificado".

FORMATO DE RESPOSTA OBRIGATÓRIO (responda estritamente em JSON puro, sem markdown \`\`\`json):
{
  "reply": "O texto da resposta em português para enviar no WhatsApp do cliente. Super objetivo, conciso, sem emojis.",
  "status": "bot" | "atendimento_humano" | "qualificado"
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

    const parsed = JSON.parse(cleanJson)
    const replyText = parsed.reply || "Desculpe, não entendi muito bem. Poderia repetir?"
    
    // Constrói a lista de mensagens a enviar
    const messagesToSend: { type: 'text' | 'image'; text?: string; imageUrl?: string }[] = []

    if (replyText) {
      messagesToSend.push({ type: 'text', text: replyText })
    }

    if (classification.exactMatch && produtos.length > 0) {
      // Adiciona cada produto como mensagem de imagem com a descrição formatada
      // Limitando a 5 produtos para evitar spam
      const limitProdutos = produtos.slice(0, 5)
      for (const p of limitProdutos) {
        messagesToSend.push({
          type: 'image',
          imageUrl: p.imagemURL,
          text: `${p.nome} - ${p.descricaoCurta} - R$ ${p.preco}`
        })
      }
    } else if (isSuggested && classification.suggestedCategories.length > 0) {
      // Adiciona cada categoria recomendada separadamente
      const limitCategories = classification.suggestedCategories.slice(0, 8)
      for (const cat of limitCategories) {
        messagesToSend.push({
          type: 'text',
          text: cat
        })
      }
    }

    return {
      reply: replyText,
      status: parsed.status || 'bot',
      messagesToSend
    }
  } catch (e) {
    console.error('[aiService] Erro ao chamar a API da OpenAI:', e)
    return {
      reply: "Desculpe-me, tive uma instabilidade ao processar sua resposta. Pode repetir, por favor?",
      status: 'bot'
    }
  }
}
