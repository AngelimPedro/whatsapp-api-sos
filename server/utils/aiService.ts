import { AGENCY_INFO } from './agencyConfig'
import { useProdutos, type Produto } from './useProdutos'

interface AIResponse {
  reply: string
  status: 'bot' | 'atendimento_humano' | 'qualificado'
  imageUrl?: string
}

let cachedSubgroups: string[] | null = null
let cacheTimestamp = 0

/**
 * Busca subcategorias da SOS Cordas na API do home.
 */
async function getSubgroups(): Promise<string[]> {
  const now = Date.now()
  // Cache de 5 minutos
  if (cachedSubgroups && (now - cacheTimestamp < 5 * 60 * 1000)) {
    return cachedSubgroups
  }

  try {
    const token = process.env.SOS_CORDAS_TOKEN || '618d11b0-bdc7-41b7-bf35-3c39af19376e'
    const data = await $fetch<any>('https://api.soscordas.com.br/soscordas/v2/home', {
      method: 'GET',
      headers: {
        'Token': token
      }
    })
    if (data?.subgroups) {
      cachedSubgroups = data.subgroups.map((s: any) => s.name.trim())
      cacheTimestamp = now
      return cachedSubgroups!
    }
  } catch (err) {
    console.error('[aiService] Erro ao buscar subgrupos para classificação:', err)
  }
  return cachedSubgroups || []
}

/**
 * Classifica a intenção do cliente com base no histórico e lista de subcategorias.
 */
async function classifyIntent(
  latestMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  subgroups: string[],
  apiKey: string
): Promise<{ exactMatch: string | null; suggestedSubcategories: string[] }> {
  try {
    const systemPrompt = `Você é um classificador inteligente de intenções para um chatbot de e-commerce de instrumentos musicais.
Você deve analisar a última mensagem do cliente e o histórico da conversa para identificar se ele está procurando por produtos e qual subcategoria exata da nossa loja melhor corresponde à sua busca.

LISTA DE SUBCATEGORIAS EXISTENTES:
${subgroups.map(s => `- ${s}`).join('\n')}

REGRAS:
1. Se a última mensagem ou a escolha recente do cliente corresponder de forma clara a EXATAMENTE UMA subcategoria da lista (permita variações, sinônimos, erros de digitação), defina "exactMatch" com o NOME EXATO da subcategoria (exemplo: "ENCORDOAMENTO BAIXO 4 CORDAS 0.40").
2. Se a mensagem for relacionada a produtos mas for ampla (ex: "quero ver cordas de violão" ou "vocês vendem palhetas?"), retorne "exactMatch" como null e liste as subcategorias semelhantes/relacionadas em "suggestedSubcategories" (máximo de 8).
3. Se a pesquisa do cliente não for semelhante a NENHUMA subcategoria (ex: digitou algo totalmente fora do contexto, ou apenas uma saudação como "olá", ou uma dúvida de frete/pagamento), retorne "exactMatch" como null e "suggestedSubcategories" como um array vazio.

FORMATO DE RESPOSTA:
Retorne estritamente um objeto JSON com esta estrutura (sem formatação markdown \`\`\`json):
{
  "exactMatch": "NOME_DA_SUBCATEGORIA_OU_NULL",
  "suggestedSubcategories": ["SUBCATEGORIA_1", "SUBCATEGORIA_2", ...]
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
      suggestedSubcategories: parsed.suggestedSubcategories || []
    }
  } catch (e) {
    console.error('[aiService] Erro ao classificar intenção:', e)
    return { exactMatch: null, suggestedSubcategories: [] }
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

  // 1) Busca subcategorias dinâmicas da API da SOS Cordas
  const subcategories = await getSubgroups()

  // 2) Classifica a intenção do usuário
  const classification = await classifyIntent(latestMessage, history, subcategories, apiKey)
  console.log('[aiService] Classificação da busca:', classification)

  let produtos: Produto[] = []
  let contextInstruction = ""

  if (classification.exactMatch) {
    // 3) Busca os produtos exatos da subcategoria identificada
    produtos = (await useProdutos(classification.exactMatch)).data
    
    // Constrói a descrição detalhada dos produtos encontrados
    const produtosTxt = produtos.map(p => 
      `- ID: ${p.id}\n  Nome: ${p.nome}\n  Código: ${p.codigo || 'N/A'}\n  Preço: R$ ${p.preco}\n  Estoque disponível: ${p.estoque?.saldoVirtualTotal ?? 0} unidades\n  Descrição: ${p.descricaoCurta || 'Sem descrição'}\n  Imagem: ${p.imagemURL || ''}`
    ).join('\n\n')

    contextInstruction = `O cliente está buscando produtos da subcategoria específica "${classification.exactMatch}".
Abaixo estão os produtos reais encontrados no estoque da loja para esta subcategoria. Apresente-os ao cliente da forma mais objetiva e direta possível, informando o preço. Se houver imagem, mostre que você tem a imagem disponível.

PRODUTOS ENCONTRADOS NO ESTOQUE:
${produtosTxt || 'Nenhum produto correspondente retornado da API da SOS Cordas no momento.'}
`
  } else if (classification.suggestedSubcategories && classification.suggestedSubcategories.length > 0) {
    // 4) Se for uma busca abrangente, sugere subcategorias relevantes
    contextInstruction = `A busca do cliente foi abrangente ou não encontrou uma subcategoria específica direta. 
Apresente as seguintes subcategorias relevantes e pergunte de forma objetiva qual delas ele está procurando:
${classification.suggestedSubcategories.map(s => `- ${s}`).join('\n')}
`
  } else {
    // 5) Se for uma busca que não tem relação nenhuma com os produtos que vendemos
    const isSearchingProduct = latestMessage.toLowerCase().includes('quero') || 
                              latestMessage.toLowerCase().includes('busco') || 
                              latestMessage.toLowerCase().includes('tem') || 
                              latestMessage.toLowerCase().includes('vende') || 
                              latestMessage.toLowerCase().includes('corda') ||
                              latestMessage.toLowerCase().includes('produto')

    if (isSearchingProduct) {
      contextInstruction = `O cliente está procurando por um produto ou instrumento que não corresponde a nenhuma de nossas subcategorias. 
Explique de forma educada e muito direta que não trabalhamos com esse item específico. Apresente de forma resumida as principais subcategorias que vendemos (como Encordoamentos para Violão, Guitarra, Baixo, Cavaquinho, Afinadores, Cabos, Palhetas, Suportes, etc.) e pergunte se ele gostaria de ver alguma destas.`
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

O nome do cliente é: ${contactName || 'Cliente'}. Use o primeiro nome dele de forma natural nas respostas se achar adequado (ex: "Pedro, qual é o teu endereço?").

CONTEXTO DE PRODUTOS E BUSCA DO CLIENTE:
${contextInstruction}

REGRAS DE CONVERSAÇÃO E FLUXO:
1. O status atual da conversa é "bot".
2. Diretriz de Tom de Voz: Seja extremamente objetivo, curto e direto. NUNCA use emojis em hipótese alguma. Evite saudações longas, textos de introdução formais ("Com certeza posso te ajudar com isso", "Fico feliz em atender") e palavras vazias. Vá direto ao ponto, respondendo como um atendente humano real de balcão de loja.
3. Se o cliente disser apenas "olá", "bom dia" ou perguntar se a loja está aberta, responda de forma muito curta e direta (ex: "Bom dia, Pedro. Estamos funcionando sim" ou "Olá, Pedro. Como posso ajudar?"). Mantenha o status "bot".
4. REQUISITO CRÍTICO: Se houver produtos reais listados no contexto, apresente APENAS e EXCLUSIVAMENTE esses produtos.
   - Apresente os itens e os preços de forma direta e limpa, sem rodeios.
   - NUNCA invente produtos ou preços.
   - Se a lista de produtos estiver vazia e a subcategoria informada não tiver estoque, informe que não há estoque no momento e diga que vai transferir para um atendente verificar encomendas. Nesse caso, mude o status para "atendimento_humano".
5. Se o cliente fizer uma PERGUNTA DE DÚVIDA (ex: formas de pagamento, frete, prazos, dúvidas sobre compatibilidade de cordas ou se disser que quer falar com humano): diga de forma objetiva que vai transferir para um atendente. Altere o status para "atendimento_humano".
6. Se o cliente escolher ou demonstrar intenção clara de fechar/comprar um dos produtos apresentados (ex: "quero o afinador eclipse"), peça o endereço de entrega de forma direta (ex: "Pedro, qual é o teu endereço?"). Mantenha o status "bot".
7. Se o cliente fornecer o endereço de entrega, diga apenas que um consultor entrará em contato em instantes para finalizar a compra e enviar os dados de pagamento. Altere o status para "qualificado".

IMAGENS DE PRODUTOS:
Se você estiver apresentando ou sugerindo um produto da seção "PRODUTOS ENCONTRADOS NO ESTOQUE" acima que possua uma URL no campo "Imagem", preencha o campo "imageUrl" no JSON de resposta com essa URL exata. Se não, deixe "imageUrl" como null ou vazio.

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
      status: parsed.status || 'bot',
      imageUrl: parsed.imageUrl || undefined
    }
  } catch (e) {
    console.error('[aiService] Erro ao chamar a API da OpenAI:', e)
    return {
      reply: "Desculpe-me, tive uma instabilidade ao processar sua resposta. Pode repetir, por favor?",
      status: 'bot'
    }
  }
}
