<script setup lang="ts">
import type { Conversa } from '~/types/chat'
import type { ConversationsPage } from '~/types/database'

/**
 * Seletor de destinos do encaminhamento, no estilo do WhatsApp: busca,
 * seleção múltipla e um botão de confirmar com a contagem.
 */
const props = defineProps<{
  /** id da mensagem sendo encaminhada; null fecha o modal */
  messageId: string | null
  /** conversa de origem, escondida da lista de destinos */
  origemId?: string
}>()
const emit = defineEmits<{ fechar: []; enviado: [qtd: number] }>()

const icons = useIcons()
const chat = useChatStore()

const LIMITE = 50

const conversas = ref<Conversa[]>([])
const carregando = ref(false)
const enviando = ref(false)
const erro = ref('')
const busca = ref('')
const selecionadas = ref<string[]>([])

const filtradas = computed(() => {
  const termo = busca.value.trim().toLowerCase()
  return conversas.value.filter((c) => {
    if (c.id === props.origemId) return false
    return !termo || c.name.toLowerCase().includes(termo)
  })
})

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    // sem `aba` = todas as conversas, que é o universo certo p/ encaminhar
    const res = await $fetch<ConversationsPage>('/api/conversations', {
      query: { limit: LIMITE, offset: 0 },
    })
    conversas.value = res.items.map(mapConversa)
  } catch (e) {
    console.error('[encaminhar] carregar conversas:', e)
    erro.value = 'Não foi possível carregar as conversas.'
  } finally {
    carregando.value = false
  }
}

function alterna(id: string) {
  selecionadas.value = selecionadas.value.includes(id)
    ? selecionadas.value.filter((x) => x !== id)
    : [...selecionadas.value, id]
}

async function confirmar() {
  if (!props.messageId || selecionadas.value.length === 0 || enviando.value) return
  enviando.value = true
  erro.value = ''
  try {
    const { resultados } = await $fetch<{
      resultados: { conversationId: string; ok: boolean; erro?: string }[]
    }>('/api/messages/forward', {
      method: 'POST',
      body: { messageId: props.messageId, conversationIds: selecionadas.value },
    })

    const falhas = resultados.filter((r) => !r.ok)
    if (falhas.length === resultados.length) {
      erro.value = falhas[0]?.erro || 'Falha ao encaminhar.'
      return
    }

    // as cópias foram criadas no servidor: sem isto elas só apareceriam
    // na conversa de destino depois de recarregar a página
    await chat.aposEncaminhar(resultados.filter((r) => r.ok).map((r) => r.conversationId))
    // sucesso parcial ainda fecha: o que foi, foi — o resto aparece no aviso
    emit('enviado', resultados.length - falhas.length)
    emit('fechar')
  } catch (e) {
    console.error('[encaminhar] envio:', e)
    erro.value = 'Falha ao encaminhar. Tente de novo.'
  } finally {
    enviando.value = false
  }
}

// abrir o modal = recarregar a lista e zerar a seleção anterior
watch(
  () => props.messageId,
  (id) => {
    if (!id) return
    busca.value = ''
    selecionadas.value = []
    erro.value = ''
    carregar()
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="messageId"
    class="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50"
    @click.self="emit('fechar')"
  >
    <div
      class="w-full md:w-125 max-h-[85dvh] md:max-h-150 flex flex-col bg-panel-left md:rounded-xl rounded-t-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
    >
      <!-- cabeçalho -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-panel-divider shrink-0">
        <button
          class="w-9 h-9 grid place-items-center rounded-full text-icon hover:bg-hover-row transition-colors shrink-0 [&_svg]:w-5 [&_svg]:h-5"
          aria-label="Fechar"
          @click="emit('fechar')"
          v-html="icons.arrowLeft"
        />
        <h2 class="text-base font-medium text-text-primary">Encaminhar para</h2>
      </div>

      <!-- busca -->
      <div class="px-3 py-2 shrink-0">
        <div class="flex items-center gap-3 bg-search-bg rounded-lg px-4 py-2">
          <span class="text-text-secondary shrink-0 [&_svg]:w-4.5 [&_svg]:h-4.5" v-html="icons.search" />
          <input
            v-model="busca"
            placeholder="Buscar conversa"
            class="border-none bg-transparent outline-none text-text-primary text-[16px] md:text-[15px] w-full placeholder:text-text-secondary"
          />
        </div>
      </div>

      <!-- lista -->
      <div class="flex-1 min-h-0 overflow-y-auto scroll">
        <p v-if="carregando" class="text-center text-text-secondary text-sm py-6">Carregando…</p>
        <p v-else-if="!filtradas.length" class="text-center text-text-secondary text-sm py-6">
          Nenhuma conversa encontrada.
        </p>
        <button
          v-for="c in filtradas"
          :key="c.id"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-hover-row transition-colors"
          @click="alterna(c.id)"
        >
          <span
            class="w-5 h-5 shrink-0 rounded-full border-2 grid place-items-center transition-colors"
            :class="
              selecionadas.includes(c.id)
                ? 'bg-brand-green border-brand-green text-white'
                : 'border-panel-divider'
            "
          >
            <span
              v-if="selecionadas.includes(c.id)"
              class="[&_svg]:w-3 [&_svg]:h-3"
              v-html="icons.check"
            />
          </span>
          <span
            class="w-10 h-10 rounded-full shrink-0 grid place-items-center bg-active-row text-text-secondary text-sm"
          >
            {{ c.initials || '?' }}
          </span>
          <span class="flex-1 min-w-0">
            <span class="block text-[15px] text-text-primary truncate">{{ c.name }}</span>
            <span class="block text-xs text-text-secondary truncate">{{ c.preview }}</span>
          </span>
        </button>
      </div>

      <!-- rodapé -->
      <div class="px-4 py-3 border-t border-panel-divider shrink-0">
        <p v-if="erro" class="text-[13px] text-rose-400 mb-2">{{ erro }}</p>
        <button
          class="w-full py-2.5 rounded-lg font-medium text-[15px] transition-colors"
          :class="
            selecionadas.length && !enviando
              ? 'bg-brand-green text-white'
              : 'bg-active-row text-text-secondary cursor-default'
          "
          :disabled="!selecionadas.length || enviando"
          @click="confirmar"
        >
          {{ enviando ? 'Encaminhando…' : `Encaminhar${selecionadas.length ? ` (${selecionadas.length})` : ''}` }}
        </button>
      </div>
    </div>
  </div>
</template>
