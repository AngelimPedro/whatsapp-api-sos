import { AGENCY_INFO } from './agencyConfig'
import { useProdutos, type Produto } from './useProdutos'

interface AIResponse {
  reply: string
  status: 'bot' | 'atendimento_humano' | 'qualificado'
  imageUrl?: string
  messagesToSend?: { type: 'text' | 'image'; text?: string; imageUrl?: string }[]
}

interface RegraIA {
  titulo: string
  descricao: string
}

let cachedCategories: string[] | null = null
let categoriesCacheTimestamp = 0
const CATEGORIES_CACHE_MS = 60 * 1000

let cachedRegras: RegraIA[] | null = null
let regrasCacheTimestamp = 0
const REGRAS_CACHE_MS = 60 * 1000

/**
 * Normaliza texto de categoria para comparação (ex: "0.11" ≈ "011").
 */
function normalizeCategoryKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Resolve um nome retornado pela IA para o nome EXATO da API, ou null.
 */
function resolveCategoryName(candidate: string | null | undefined, categories: string[]): string | null {
  if (!candidate || !categories.length) return null

  const trimmed = candidate.trim()
  const exact = categories.find(c => c === trimmed)
  if (exact) return exact

  const caseInsensitive = categories.find(c => c.toLowerCase() === trimmed.toLowerCase())
  if (caseInsensitive) return caseInsensitive

  const normalizedCandidate = normalizeCategoryKey(trimmed)
  if (!normalizedCandidate) return null

  const fuzzy = categories.find(c => normalizeCategoryKey(c) === normalizedCandidate)
  return fuzzy || null
}

/**
 * Filtra sugestões da IA mantendo apenas nomes que existem na API.
 */
function resolveSuggestedCategories(suggested: string[] | undefined, categories: string[]): string[] {
  if (!suggested?.length) return []

  const resolved: string[] = []
  for (const item of suggested) {
    const match = resolveCategoryName(item, categories)
    if (match && !resolved.includes(match)) {
      resolved.push(match)
    }
  }
  return resolved
}

/**
 * Busca categorias exclusivamente da API da SOS Cordas Belém.
 */
async function getCategories(): Promise<string[]> {
  const now = Date.now()
  if (cachedCategories && (now - categoriesCacheTimestamp < CATEGORIES_CACHE_MS)) {
    return cachedCategories
  }

  try {
    const data = await $fetch<any>('https://hub.soscordasbelem.com.br/api/categorias', {
      method: 'GET'
    })
    if (data?.results?.length) {
      cachedCategories = data.results
        .map((c: any) => String(c.nome_categoria || '').trim())
        .filter(Boolean)
      categoriesCacheTimestamp = now
      return cachedCategories!
    }
  } catch (err) {
    console.error('[aiService] Erro ao buscar categorias:', err)
  }

  return cachedCategories || []
}

/**
 * Busca todas as regras ativas em https://hub.soscordasbelem.com.br/api/regras-ia
 */
async function getRegrasIA(): Promise<RegraIA[]> {
  const now = Date.now()
  if (cachedRegras && (now - regrasCacheTimestamp < REGRAS_CACHE_MS)) {
    return cachedRegras
  }

  try {
    const data = await $fetch<{
      error?: boolean
      results?: { titulo?: string; descricao?: string }[]
    }>('https://hub.soscordasbelem.com.br/api/regras-ia', {
      method: 'GET'
    })

    if (data?.results?.length) {
      cachedRegras = data.results
        .map((r) => ({
          titulo: String(r.titulo || '').trim(),
          descricao: String(r.descricao || '').trim()
        }))
        .filter((r) => r.titulo || r.descricao)
      regrasCacheTimestamp = now
      return cachedRegras
    }
  } catch (err) {
    console.error('[aiService] Erro ao buscar regras-ia:', err)
  }

  return cachedRegras || []
}

/**
 * Monta o bloco único de regras (conversação + fluxo + classificação) vindo da API.
 */
function formatRegrasPrompt(regras: RegraIA[]): string {
  if (!regras.length) {
    console.warn('[aiService] Nenhuma regra carregada da API regras-ia')
    return 'REGRAS: (nenhuma regra carregada da API — responda de forma objetiva e não invente dados.)'
  }

  const linhas = regras.map((r, i) => {
    const titulo = r.titulo || `Regra ${i + 1}`
    const descricao = r.descricao || titulo
    return `${i + 1}. ${titulo}: ${descricao}`
  })

  return `REGRAS OBRIGATÓRIAS (fonte: API regras-ia — conversação, fluxo e classificação):
${linhas.join('\n')}`
}

/**
 * Contexto dinâmico desta mensagem (só fatos da busca; regras comportamentais vêm da API).
 */
function buildSearchContext(params: {
  exactMatch: string | null
  suggestedCategories: string[]
  produtos: Produto[]
  categories: string[]
  isSuggested: boolean
  latestMessage: string
}): string {
  const { exactMatch, suggestedCategories, produtos, categories, isSuggested, latestMessage } = params

  if (exactMatch) {
    const produtosTxt = produtos.map(p =>
      `- Título: ${p.nome}\n  Categoria: ${p.descricaoCurta}\n  Valor: R$ ${p.preco}\n  Imagem: ${p.imagemURL}`
    ).join('\n\n')

    return `FATO DA BUSCA: categoria correspondente "${exactMatch}".
O sistema enviará as imagens dos produtos separadamente no WhatsApp.
PRODUTOS RETORNADOS DA API:
${produtosTxt || '(lista vazia — nenhum produto retornado)'}
`
  }

  if (isSuggested && suggestedCategories.length > 0) {
    return `FATO DA BUSCA: sem match exato; o sistema enviará estas categorias em mensagens separadas no WhatsApp:
${suggestedCategories.map(c => `- ${c}`).join('\n')}
Mensagem do cliente: "${latestMessage}"
`
  }

  return `FATO DA BUSCA: sem match de produto/categoria nesta mensagem.
Mensagem do cliente: "${latestMessage}"
Categorias oficiais disponíveis (referência): ${categories.slice(0, 30).join(', ') || '(nenhuma)'}
`
}

function stripCodeFences(content: string): string {
  let clean = content.trim()
  if (clean.startsWith('```json')) clean = clean.substring(7)
  else if (clean.startsWith('```')) clean = clean.substring(3)
  if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3)
  return clean.trim()
}

/**
 * Classifica a intenção do cliente. Regras vêm da API; aqui só há lista + formato JSON.
 */
async function classifyIntent(
  latestMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  categories: string[],
  regras: RegraIA[],
  apiKey: string
): Promise<{ exactMatch: string | null; suggestedCategories: string[] }> {
  if (!categories.length) {
    return { exactMatch: null, suggestedCategories: [] }
  }

  try {
    const systemPrompt = `Você é um classificador de intenções para chatbot de e-commerce de instrumentos musicais.
Analise a última mensagem e o histórico para decidir se há categoria correspondente.

LISTA OFICIAL DE CATEGORIAS (use APENAS estes nomes, copiados exatamente):
${categories.map(c => `- ${c}`).join('\n')}

${formatRegrasPrompt(regras)}

FORMATO DE RESPOSTA (JSON puro, sem markdown):
{
  "exactMatch": "NOME_DA_CATEGORIA_OU_NULL",
  "suggestedCategories": ["CATEGORIA_1", "CATEGORIA_2", ...]
}`

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
    const parsed = JSON.parse(stripCodeFences(contentStr))
    return {
      exactMatch: resolveCategoryName(parsed.exactMatch, categories),
      suggestedCategories: resolveSuggestedCategories(parsed.suggestedCategories, categories)
    }
  } catch (e) {
    console.error('[aiService] Erro ao classificar intenção:', e)
    return { exactMatch: null, suggestedCategories: [] }
  }
}

/**
 * Gera a resposta da IA. Regras de conversação/fluxo vêm da API regras-ia.
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
      reply: 'Olá! No momento nosso sistema de inteligência artificial está em manutenção. Por favor, aguarde que um atendente humano irá falar com você em instantes.',
      status: 'atendimento_humano'
    }
  }

  const [categories, regras] = await Promise.all([getCategories(), getRegrasIA()])
  console.log('[aiService] Categorias da API:', categories.length)
  console.log('[aiService] Regras IA da API:', regras.length)

  const classification = await classifyIntent(latestMessage, history, categories, regras, apiKey)
  console.log('[aiService] Classificação da busca:', classification)

  let produtos: Produto[] = []
  let isSuggested = false

  if (classification.exactMatch) {
    produtos = (await useProdutos(classification.exactMatch)).data
  } else if (classification.suggestedCategories.length > 0) {
    isSuggested = true
  } else {
    const lookingForProduct = /quero|busco|tem|vende|corda|produto|categoria/i.test(latestMessage)
    if (lookingForProduct && categories.length > 0) {
      isSuggested = true
      classification.suggestedCategories = categories
    }
  }

  const contextInstruction = buildSearchContext({
    exactMatch: classification.exactMatch,
    suggestedCategories: classification.suggestedCategories,
    produtos,
    categories,
    isSuggested,
    latestMessage
  })

  const systemPrompt = `Você é a inteligência artificial de atendimento da loja online "${AGENCY_INFO.nome}".
Sobre a loja:
- Descrição: ${AGENCY_INFO.descricao}
- Horário de Atendimento: ${AGENCY_INFO.horarioAtendimento}
- Contato: ${AGENCY_INFO.contato}
- Políticas e Envios: ${AGENCY_INFO.valoresSobre}

O nome do cliente é: ${contactName || 'Cliente'}.

CONTEXTO DINÂMICO DESTA MENSAGEM:
${contextInstruction}

${formatRegrasPrompt(regras)}

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON puro, sem markdown):
{
  "reply": "Texto em português para o WhatsApp do cliente",
  "status": "bot" | "atendimento_humano" | "qualificado"
}`

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
    if (!contentStr) throw new Error('Resposta vazia da OpenAI')

    const parsed = JSON.parse(stripCodeFences(contentStr))
    const replyText = parsed.reply || 'Desculpe, não entendi muito bem. Poderia repetir?'

    const messagesToSend: { type: 'text' | 'image'; text?: string; imageUrl?: string }[] = []

    if (replyText) {
      messagesToSend.push({ type: 'text', text: replyText })
    }

    if (classification.exactMatch && produtos.length > 0) {
      for (const p of produtos.slice(0, 5)) {
        messagesToSend.push({
          type: 'image',
          imageUrl: p.imagemURL,
          text: `${p.nome} - ${p.descricaoCurta} - R$ ${p.preco}`
        })
      }
    } else if (isSuggested && classification.suggestedCategories.length > 0) {
      for (const cat of classification.suggestedCategories.slice(0, 8)) {
        messagesToSend.push({ type: 'text', text: cat })
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
      reply: 'Desculpe-me, tive uma instabilidade ao processar sua resposta. Pode repetir, por favor?',
      status: 'bot'
    }
  }
}
