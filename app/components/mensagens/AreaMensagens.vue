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
defineEmits<{ send: [text: string]; sendFile: [file: File]; loadOlder: []; back: [] }>()

/** id da mensagem em encaminhamento; null = modal fechado */
const encaminhandoId = ref<string | null>(null)
const aviso = ref('')
let avisoTimer: ReturnType<typeof setTimeout> | null = null

function confirmado(qtd: number) {
  aviso.value = qtd === 1 ? 'Mensagem encaminhada' : `Mensagem encaminhada para ${qtd} conversas`
  if (avisoTimer) clearTimeout(avisoTimer)
  avisoTimer = setTimeout(() => (aviso.value = ''), 3000)
}

onBeforeUnmount(() => {
  if (avisoTimer) clearTimeout(avisoTimer)
})
</script>

<template>
  <div
    class="flex flex-col min-w-0 min-h-0 relative bg-chat-bg w-full h-dvh overflow-hidden"
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
    <ChatInput @send="$emit('send', $event)" @send-file="$emit('sendFile', $event)" />

    <!-- confirmação do encaminhamento -->
    <div
      v-if="aviso"
      class="absolute left-1/2 -translate-x-1/2 bottom-24 z-10 bg-header-bg border border-panel-divider text-text-primary text-[13px] px-4 py-2 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
    >
      {{ aviso }}
    </div>

    <ModalEncaminhar
      :message-id="encaminhandoId"
      :origem-id="props.conversationId"
      @fechar="encaminhandoId = null"
      @enviado="confirmado"
    />
  </div>
</template>
