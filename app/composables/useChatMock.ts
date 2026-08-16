import type { Conversa, Mensagem } from '~/types/chat'

/* ----- avatares/mídias mocados (data-URI) ----- */
const avatarD7 =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="#1c1c2b"/><g fill="#a78bfa"><rect x="14" y="26" width="5" height="12"/><rect x="22" y="20" width="5" height="18"/><rect x="30" y="14" width="5" height="24"/></g></svg>',
  )

const avatarMeta =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><defs><radialGradient id="g" cx="30%" cy="30%"><stop offset="0%" stop-color="#a78bfa"/><stop offset="60%" stop-color="#6366f1"/><stop offset="100%" stop-color="#ec4899"/></radialGradient></defs><circle cx="25" cy="25" r="25" fill="#fff"/><circle cx="25" cy="25" r="20" fill="url(#g)" opacity="0.4"/><g fill="url(#g)"><circle cx="18" cy="20" r="4"/><circle cx="32" cy="20" r="4"/><circle cx="25" cy="30" r="4"/><circle cx="16" cy="30" r="3"/><circle cx="34" cy="30" r="3"/></g></svg>',
  )

export const burger =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#caa46a"/><ellipse cx="240" cy="120" rx="180" ry="60" fill="#e8c98a"/><rect x="60" y="150" width="360" height="40" rx="14" fill="#7a4a28"/><ellipse cx="240" cy="210" rx="180" ry="55" fill="#e8c98a"/><rect x="40" y="250" width="400" height="22" rx="8" fill="#ffffff"/></svg>',
  )

/* ----- conversas mocadas ----- */
export const conversasMock: Conversa[] = [
  {
    id: 'd7',
    name: '+55 41 9133-8055',
    time: '17:42',
    preview: 'bao e vc',
    sent: true,
    img: avatarD7,
  },
  {
    id: 't1',
    name: 'Test Number',
    time: 'segunda-feira',
    preview: 'Lembrete de Consulta Olá Israel, sua consulta e…',
  },
  {
    id: 'meta',
    name: 'Meta AI',
    time: '10/06/2026',
    preview: 'Boa! Em 2026 você não vai precisar acordar de …',
    img: avatarMeta,
  },
  {
    id: 'sp',
    name: 'Sem Parar',
    time: '07/06/2026',
    preview: 'Olá, você está no BALNEARIO SHOPPING! O Se…',
    color: '#1f2d3d',
    initials: 'SP',
  },
  {
    id: 'datafy',
    name: 'Datafy',
    time: '06/04/2026',
    preview: 'Ola',
    color: '#f4a7c0',
    initials: '',
  },
]

/* sticker de exemplo (transparente, data-URI) */
const stickerSample =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="#ffd83d"/><circle cx="44" cy="50" r="7" fill="#1c1c1c"/><circle cx="76" cy="50" r="7" fill="#1c1c1c"/><path d="M40 74c8 12 32 12 40 0" fill="none" stroke="#1c1c1c" stroke-width="6" stroke-linecap="round"/></svg>',
  )

/* ----- thread de mensagens mocadas (da conversa ativa) -----
   Mostra os 6 tipos de balão. Os de mídia recebem link público. */
export const mensagensMock: Mensagem[] = [
  {
    type: 'msg',
    kind: 'text',
    from: 'in',
    text: 'Olá, Israel! 👋 Tudo bem? Posso te ajudar com seu atendimento de hoje?',
    time: '09:20',
  },
  {
    type: 'msg',
    kind: 'image',
    from: 'in',
    url: 'https://picsum.photos/id/1080/600/400',
    caption: 'Esse é o produto que comentei 🍓',
    time: '09:21',
  },
  {
    type: 'msg',
    kind: 'text',
    from: 'out',
    text: 'Ficou ótimo! Pode me mandar o catálogo completo?',
    time: '09:22',
    status: 'read',
  },
  {
    type: 'msg',
    kind: 'document',
    from: 'out',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    filename: 'Catalogo-2026.pdf',
    ext: 'PDF',
    pages: '12 páginas',
    size: '2,4 MB',
    time: '09:23',
    status: 'delivered',
  },
  { type: 'date', label: 'Hoje' },
  {
    type: 'msg',
    kind: 'audio',
    from: 'in',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    duration: '0:14',
    voice: true,
    time: '09:30',
  },
  {
    type: 'msg',
    kind: 'video',
    from: 'in',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    poster: 'https://picsum.photos/id/1025/600/340',
    caption: 'Demonstração rápida 🎥',
    duration: '0:30',
    time: '09:31',
  },
  {
    type: 'msg',
    kind: 'image',
    from: 'in',
    url: 'https://picsum.photos/id/1062/500/360',
    time: '09:31',
  },
  {
    type: 'msg',
    kind: 'sticker',
    from: 'out',
    url: stickerSample,
    time: '09:32',
    status: 'read',
  },
  {
    type: 'msg',
    kind: 'text',
    from: 'out',
    text: 'Perfeito, obrigado! 🙌',
    time: '09:33',
    status: 'read',
  },
]

export function useChatMock() {
  return { conversasMock, mensagensMock, burger }
}
