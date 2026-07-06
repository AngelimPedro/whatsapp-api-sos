import { AGENCY_INFO } from './agencyConfig'
import { useProdutos } from './useProdutos'

interface AIResponse {
  reply: string
  status: 'bot' | 'atendimento_humano' | 'qualificado'
  imageUrl?: string
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

  // Extrai palavras-chave simples da mensagem para pesquisar produtos específicos no Bling
  let query = 'VIOLAO'
  const text = latestMessage.toLowerCase()
  if (text.includes('guitarra')) query = 'GUITARRA'
  else if (text.includes('baixo')) query = 'BAIXO'
  else if (text.includes('afinador')) query = 'AFINADOR'
  else if (text.includes('cabo')) query = 'CABO'
  else if (text.includes('capa') || text.includes('bag')) query = 'CAPA'
  else if (text.includes('cavaquinho')) query = 'CAVAQUINHO'
  else if (text.includes('bandolim')) query = 'BANDOLIM'
  else if (text.includes('palheta')) query = 'PALHETA'
  else if (text.includes('suporte')) query = 'SUPORTE'
  else if (text.includes('tarraxa')) query = 'TARRAXA'
  else if (text.includes('ukulele')) query = 'UKULELE'
  else if (text.includes('violino')) query = 'VIOLINO'
  else if (text.includes('viola')) query = 'VIOLA'

  const result = await useProdutos(query)
  const produtos = result?.data || []

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
