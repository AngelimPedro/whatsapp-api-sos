/**
 * Tipos do domínio do chat. Espelham (de forma simplificada) o que
 * deverá vir da API oficial do WhatsApp quando a integração entrar.
 */

export interface Conversa {
  id: string
  name: string
  time: string
  preview: string
  /** true => mostra o "visto" (double check) na prévia */
  sent?: boolean
  /** avatar como URL/data-URI */
  img?: string
  /** cor de fundo do avatar quando não há imagem */
  color?: string
  /** iniciais exibidas quando não há imagem */
  initials?: string
  status?: 'bot' | 'atendimento_humano' | 'qualificado' | 'desqualificado'
  reminder_sent?: boolean
}

export interface Peer {
  name: string
  img?: string
}

/** Divisor de data no fluxo de mensagens */
export interface MensagemData {
  type: 'date'
  label: string
}

/** Direção da mensagem */
export type Direcao = 'in' | 'out'

/** Status de entrega (mostrado só em mensagens enviadas) */
export type Status = 'sent' | 'delivered' | 'read'

/** Tipos de balão suportados */
export type Kind = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker'

/** Campos comuns a todo balão */
export interface BaseBalao {
  type: 'msg'
  kind: Kind
  /** id da linha no banco */
  id?: string
  /** wamid (Meta) — usado p/ dedup e match de status no realtime */
  waMessageId?: string
  /** id temporário do envio otimista (antes de ter o wamid) */
  clientId?: string
  /** 'in' = recebida | 'out' = enviada */
  from?: Direcao
  /** horário exibido (ex.: "09:27") */
  time?: string
  /** status de entrega (só para 'out') */
  status?: Status
}

/** Mensagem de texto */
export interface TextMensagem extends BaseBalao {
  kind: 'text'
  text: string
}

/** Imagem (com legenda opcional) */
export interface ImageMensagem extends BaseBalao {
  kind: 'image'
  url: string
  caption?: string
}

/** Áudio / mensagem de voz */
export interface AudioMensagem extends BaseBalao {
  kind: 'audio'
  url: string
  /** duração formatada (ex.: "0:14") */
  duration?: string
  /** true => mensagem de voz (PTT) em vez de arquivo de áudio */
  voice?: boolean
}

/** Vídeo (com legenda opcional) */
export interface VideoMensagem extends BaseBalao {
  kind: 'video'
  url: string
  caption?: string
  /** imagem de capa */
  poster?: string
  /** duração formatada (ex.: "1:32") */
  duration?: string
}

/** Documento / arquivo */
export interface DocumentMensagem extends BaseBalao {
  kind: 'document'
  url: string
  /** nome do arquivo exibido */
  filename: string
  /** tamanho formatado (ex.: "1,2 MB") */
  size?: string
  /** extensão exibida no selo (ex.: "PDF") */
  ext?: string
  /** nº de páginas (ex.: "3 páginas") */
  pages?: string
  caption?: string
}

/** Sticker (figurinha, sem balão) */
export interface StickerMensagem extends BaseBalao {
  kind: 'sticker'
  url: string
}

/** União de todos os balões */
export type MensagemBalao =
  | TextMensagem
  | ImageMensagem
  | AudioMensagem
  | VideoMensagem
  | DocumentMensagem
  | StickerMensagem

export type Mensagem = MensagemData | MensagemBalao
