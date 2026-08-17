<script setup lang="ts">
import type { Mensagem, Peer } from '~/types/chat'

const props = defineProps<{
  peer: Peer
  mensagens: Mensagem[]
  conversationId?: string
  hasMore?: boolean
  /** contador que sobe quando o painel reaparece e o scroll precisa voltar pro fim */
  ancorarNoFim?: number
}>()
const emit = defineEmits<{
  send: [text: string]
  sendFile: [file: File, legenda?: string]
  loadOlder: []
  back: []
}>()

const icons = useIcons()
const chat = useChatStore()


/** id da mensagem em encaminhamento; null = modal fechado */
const encaminhandoId = ref<string | null>(null)
const aviso = ref('')
let avisoTimer: ReturnType<typeof setTimeout> | null = null

function mostraAviso(texto: string, ms = 3000) {
  aviso.value = texto
  if (avisoTimer) clearTimeout(avisoTimer)
  avisoTimer = setTimeout(() => (aviso.value = ''), ms)
}

// falha de envio de arquivo vira aviso na tela — antes o balão sumia e o
// motivo só aparecia no console, então ninguém sabia o que tinha acontecido
watch(
  () => chat.erroEnvio,
  (msg) => {
    if (msg) mostraAviso(msg, 8000)
  },
)

function confirmado(ok: number, falhas = 0) {
  const base = ok === 1 ? 'Mensagem encaminhada' : `Mensagem encaminhada para ${ok} conversas`
  mostraAviso(falhas ? `${base} — ${falhas} falhou(ram), veja o log` : base)
}

/* ---------- arrastar e soltar ----------
 * O contador existe porque dragenter/dragleave também disparam ao passar por
 * elementos filhos: sem ele o overlay pisca ao arrastar sobre os balões. */
const LIMITE_BYTES = 100 * 1024 * 1024 // teto de documento do WhatsApp

const arrastando = ref(false)
let profundidade = 0

/** Só reage a arrasto de arquivo — selecionar texto na página não conta. */
function temArquivo(e: DragEvent): boolean {
  return !!e.dataTransfer?.types?.includes('Files')
}

function aoEntrar(e: DragEvent) {
  if (!temArquivo(e) || !props.conversationId) return
  profundidade++
  arrastando.value = true
}

function aoSair(e: DragEvent) {
  if (!temArquivo(e)) return
  profundidade = Math.max(0, profundidade - 1)
  if (profundidade === 0) arrastando.value = false
}

function aoSoltar(e: DragEvent) {
  profundidade = 0
  arrastando.value = false
  if (!props.conversationId) return

  const arquivos = Array.from(e.dataTransfer?.files ?? [])
  if (!arquivos.length) return

  const grandes = arquivos.filter((f) => f.size > LIMITE_BYTES)
  if (grandes.length) {
    mostraAviso(`Arquivo acima de 100 MB: ${grandes[0]!.name}`)
    return
  }
  pendentes.value = arquivos
}

/* ---------- prévia + confirmação ----------
 * O botão de anexo também passa por aqui: o arquivo nunca sai direto,
 * sempre há uma confirmação antes de virar mensagem. */
const pendentes = ref<File[]>([])

function enviarPendentes(arquivos: File[], legenda: string) {
  // a legenda acompanha só o primeiro, como no WhatsApp
  arquivos.forEach((f, i) => emit('sendFile', f, i === 0 ? legenda || undefined : undefined))
  pendentes.value = []
}

onBeforeUnmount(() => {
  if (avisoTimer) clearTimeout(avisoTimer)
})
</script>

<template>
  <div
    class="flex flex-col min-w-0 min-h-0 relative bg-chat-bg w-full h-dvh overflow-hidden"
    @dragenter.prevent="aoEntrar"
    @dragover.prevent
    @dragleave.prevent="aoSair"
    @drop.prevent="aoSoltar"
  >
    <HeaderMensagens :peer="peer" @back="$emit('back')" />
    <ListaMensagens
      :mensagens="mensagens"
      :conversation-id="conversationId"
      :has-more="hasMore"
      :ancorar-no-fim="ancorarNoFim"
      @load-older="$emit('loadOlder')"
      @encaminhar="encaminhandoId = $event"
    />
    <ChatInput @send="$emit('send', $event)" @send-file="pendentes = [$event]" />

    <!-- alvo do arrasto -->
    <div
      v-if="arrastando"
      class="absolute inset-0 z-20 grid place-items-center bg-chat-bg/90 pointer-events-none"
    >
      <div
        class="flex flex-col items-center gap-3 border-2 border-dashed border-brand-green rounded-2xl px-10 py-8 text-center"
      >
        <span class="text-brand-green [&_svg]:w-9 [&_svg]:h-9" v-html="icons.plus" />
        <p class="text-text-primary text-[15px] font-medium">Solte para enviar</p>
        <p class="text-text-secondary text-[13px]">Você confirma antes do envio</p>
      </div>
    </div>

    <!-- avisos (encaminhamento, arquivo grande) -->
    <div
      v-if="aviso"
      class="absolute left-1/2 -translate-x-1/2 bottom-24 z-30 bg-header-bg border border-panel-divider text-text-primary text-[13px] px-4 py-2 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
    >
      {{ aviso }}
    </div>

    <ModalPreviaArquivo
      :arquivos="pendentes"
      @cancelar="pendentes = []"
      @confirmar="enviarPendentes"
    />

    <ModalEncaminhar
      :message-id="encaminhandoId"
      :origem-id="props.conversationId"
      @fechar="encaminhandoId = null"
      @enviado="confirmado"
    />
  </div>
</template>
