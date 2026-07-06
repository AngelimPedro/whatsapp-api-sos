<script setup lang="ts">
import type { Mensagem } from '~/types/chat'

const props = defineProps<{
  mensagens: Mensagem[]
  conversationId?: string
  hasMore?: boolean
}>()
const emit = defineEmits<{ loadOlder: [] }>()

const scrollEl = ref<HTMLElement | null>(null)
let pendingOlder = false
let prevHeight = 0

// scroll pro fim (mensagem mais recente)
function scrollToBottom() {
  const el = scrollEl.value
  if (el) el.scrollTop = el.scrollHeight
}

// ao chegar perto do topo, pede mensagens mais antigas
function onScroll() {
  const el = scrollEl.value
  if (!el || !props.hasMore || pendingOlder) return
  if (el.scrollTop < 120) {
    pendingOlder = true
    prevHeight = el.scrollHeight
    emit('loadOlder')
  }
}

// trocou de conversa -> rola pro fim
watch(
  () => props.conversationId,
  async () => {
    await nextTick()
    scrollToBottom()
  },
)

// mudou a lista:
//  - prepend de antigas -> mantém o ponto de leitura
//  - load inicial / nova mensagem -> rola pro fim
watch(
  () => props.mensagens.length,
  async () => {
    await nextTick()
    const el = scrollEl.value
    if (!el) return
    if (pendingOlder) {
      el.scrollTop = el.scrollHeight - prevHeight
      pendingOlder = false
    } else {
      scrollToBottom()
    }
  },
)

onMounted(async () => {
  await nextTick()
  scrollToBottom()
})
</script>

<template>
  <div
    ref="scrollEl"
    class="flex-1 min-h-0 overflow-y-auto pt-3.5 px-16 pb-24 relative scroll flex flex-col"
    @scroll.passive="onScroll"
  >
    <!-- padrão de fundo -->
    <div class="absolute inset-0 pointer-events-none z-0 chat-bg-pattern" />

    <!-- fluxo de mensagens (ancorado na base com mt-auto) -->
    <div class="relative z-1 w-full max-w-205 mx-auto mt-auto">
      <template v-for="(m, i) in mensagens" :key="i">
        <!-- divisor de data -->
        <div v-if="m.type === 'date'" class="flex justify-center my-3.5">
          <span
            class="bg-date-pill-bg text-date-pill-text text-[12.5px] font-medium px-3.5 py-1.5 rounded-lg shadow-[0_1px_1px_var(--bubble-shadow)]"
          >
            {{ m.label }}
          </span>
        </div>
        <!-- balão -->
        <ItemMensagem v-else :msg="m" />
      </template>
    </div>
  </div>
</template>
