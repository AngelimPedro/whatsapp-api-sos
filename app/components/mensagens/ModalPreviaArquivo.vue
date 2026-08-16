<script setup lang="ts">
/**
 * Prévia do arquivo antes de enviar, como no WhatsApp Web: mostra o que vai
 * ser enviado, deixa escrever uma legenda e só dispara no "Enviar".
 * Vale tanto para arrastar e soltar quanto para o botão de anexo.
 */
const props = defineProps<{
  /** arquivos a enviar; lista vazia = modal fechado */
  arquivos: File[]
}>()
const emit = defineEmits<{ cancelar: []; confirmar: [arquivos: File[], legenda: string] }>()

const icons = useIcons()

const legenda = ref('')
const indiceAtual = ref(0)

const atual = computed<File | undefined>(() => props.arquivos[indiceAtual.value])
const ehImagem = computed(() => !!atual.value?.type.startsWith('image/'))
const ehVideo = computed(() => !!atual.value?.type.startsWith('video/'))

/** Só JPEG/PNG viram mensagem de imagem no WhatsApp; o resto vai como documento. */
const viraDocumento = computed(
  () => !atual.value || !['image/jpeg', 'image/png'].includes(atual.value.type),
)

// URLs de objeto criadas p/ a prévia — precisam ser revogadas ou vazam memória
const urls = ref<string[]>([])

function limparUrls() {
  urls.value.forEach((u) => URL.revokeObjectURL(u))
  urls.value = []
}

watch(
  () => props.arquivos,
  (lista) => {
    limparUrls()
    legenda.value = ''
    indiceAtual.value = 0
    urls.value = lista.map((f) =>
      f.type.startsWith('image/') || f.type.startsWith('video/') ? URL.createObjectURL(f) : '',
    )
  },
  { immediate: true },
)

onBeforeUnmount(limparUrls)

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extensao(nome: string): string {
  return nome.includes('.') ? nome.split('.').pop()!.toUpperCase().slice(0, 4) : 'ARQ'
}

function confirmar() {
  if (!props.arquivos.length) return
  emit('confirmar', props.arquivos, legenda.value.trim())
}
</script>

<template>
  <div
    v-if="arquivos.length"
    class="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60"
    @click.self="emit('cancelar')"
  >
    <div
      class="w-full md:w-140 max-h-[90dvh] flex flex-col bg-panel-left md:rounded-xl rounded-t-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
    >
      <!-- cabeçalho -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-panel-divider shrink-0">
        <button
          type="button"
          class="w-9 h-9 grid place-items-center rounded-full text-icon hover:bg-hover-row transition-colors shrink-0 [&_svg]:w-5 [&_svg]:h-5"
          aria-label="Cancelar envio"
          @click="emit('cancelar')"
          v-html="icons.arrowLeft"
        />
        <h2 class="text-base font-medium text-text-primary">
          {{ arquivos.length > 1 ? `Enviar ${arquivos.length} arquivos` : 'Enviar arquivo' }}
        </h2>
      </div>

      <!-- prévia -->
      <div class="flex-1 min-h-0 overflow-y-auto scroll grid place-items-center p-5">
        <img
          v-if="ehImagem"
          :src="urls[indiceAtual]"
          alt=""
          class="max-w-full max-h-90 rounded-lg object-contain"
        />
        <video
          v-else-if="ehVideo"
          :src="urls[indiceAtual]"
          controls
          class="max-w-full max-h-90 rounded-lg bg-black"
        />
        <!-- sem prévia visual: cartão com selo da extensão -->
        <div v-else class="flex flex-col items-center gap-3 py-8 text-center">
          <div
            class="w-20 h-24 rounded-lg bg-active-row grid place-items-center text-text-secondary text-sm font-semibold"
          >
            {{ atual ? extensao(atual.name) : 'ARQ' }}
          </div>
          <p class="text-[15px] text-text-primary break-all max-w-70">{{ atual?.name }}</p>
        </div>

        <p v-if="atual" class="mt-3 text-xs text-text-secondary text-center">
          {{ atual.name }} · {{ tamanhoLegivel(atual.size) }}
          <span v-if="viraDocumento"> · enviado como documento</span>
        </p>
      </div>

      <!-- miniaturas quando há mais de um -->
      <div
        v-if="arquivos.length > 1"
        class="flex gap-2 px-4 pb-2 overflow-x-auto shrink-0 [&::-webkit-scrollbar]:hidden"
      >
        <button
          v-for="(f, i) in arquivos"
          :key="i"
          type="button"
          class="w-12 h-12 shrink-0 rounded-md overflow-hidden grid place-items-center bg-active-row text-[10px] text-text-secondary border-2 transition-colors"
          :class="i === indiceAtual ? 'border-brand-green' : 'border-transparent'"
          @click="indiceAtual = i"
        >
          <img v-if="urls[i] && f.type.startsWith('image/')" :src="urls[i]" alt="" class="w-full h-full object-cover" />
          <span v-else>{{ extensao(f.name) }}</span>
        </button>
      </div>

      <!-- legenda + ações -->
      <div class="px-4 py-3 border-t border-panel-divider shrink-0 flex flex-col gap-3">
        <input
          v-model="legenda"
          placeholder="Adicione uma legenda (opcional)"
          class="w-full bg-search-bg rounded-lg px-4 py-2.5 border-none outline-none text-text-primary text-[16px] md:text-[15px] placeholder:text-text-secondary"
          @keydown.enter.prevent="confirmar"
        />
        <p v-if="arquivos.length > 1" class="text-xs text-text-secondary -mt-1">
          A legenda vai no primeiro arquivo; os demais seguem sem legenda.
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 py-2.5 rounded-lg font-medium text-[15px] bg-active-row text-text-primary"
            @click="emit('cancelar')"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="flex-1 py-2.5 rounded-lg font-medium text-[15px] bg-brand-green text-white"
            @click="confirmar"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
