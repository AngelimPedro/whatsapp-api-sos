<script setup lang="ts">
const icons = useIcons()
const text = ref('')
const fieldEl = ref<HTMLTextAreaElement | null>(null)

const emit = defineEmits<{ send: [text: string] }>()

const podeEnviar = computed(() => text.value.trim().length > 0)

// auto-grow do textarea (até um limite)
function autoGrow() {
  const el = fieldEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function enviar() {
  if (!podeEnviar.value) return
  emit('send', text.value.trim())
  text.value = ''
  nextTick(autoGrow)
}
</script>

<template>
  <!--
    Barra de input em fluxo normal (flex item, não absolute).
    A altura do contêiner pai (h-dvh) encolhe quando o teclado abre
    (interactive-widget=resizes-content no Android; dvh nativo no iOS 15.4+),
    empurrando a barra para cima naturalmente.
    pb-[env(safe-area-inset-bottom)] protege o indicador home do iPhone.
  -->
  <div class="shrink-0 bg-chat-bg pb-[env(safe-area-inset-bottom)]">
    <div class="flex justify-center px-2 md:px-6 py-2 md:py-3">
      <div
        class="w-full flex items-end gap-2.5 bg-input-bar-bg rounded-[26px] shadow-[0_2px_10px_rgba(11,20,26,0.16)] px-2.5 py-1.5"
      >
        <button
          class="w-10 h-10 grid place-items-center rounded-full text-icon hover:bg-hover-row transition-colors shrink-0 [&_svg]:w-5.5 [&_svg]:h-5.5"
          v-html="icons.plus"
        />
        <!-- no mobile a barra fica apertada: o sticker sai pra sobrar largura pro texto -->
        <button
          class="hidden md:grid w-10 h-10 place-items-center rounded-full text-icon hover:bg-hover-row transition-colors shrink-0 [&_svg]:w-5.5 [&_svg]:h-5.5"
          v-html="icons.sticker"
        />

        <!-- 16px no mobile é obrigatório: abaixo disso o Safari do iOS dá zoom
             automático ao focar o campo. No desktop volta pros 15px do layout. -->
        <textarea
          ref="fieldEl"
          v-model="text"
          rows="1"
          placeholder="Digite uma mensagem"
          class="flex-1 resize-none bg-transparent border-none outline-none text-text-primary text-[16px] md:text-[15px] leading-snug px-1.5 py-2.25 max-h-30 placeholder:text-text-secondary"
          @input="autoGrow"
          @keydown.enter.exact.prevent="enviar"
        />

        <!-- enviar (Enter) -->
        <button
          class="w-10 h-10 grid place-items-center rounded-full transition-colors shrink-0 [&_svg]:w-5.5 [&_svg]:h-5.5"
          :class="podeEnviar ? 'text-brand-green hover:bg-hover-row' : 'text-text-tertiary cursor-default'"
          :disabled="!podeEnviar"
          @click="enviar"
          v-html="icons.send"
        />
      </div>
    </div>
  </div>
</template>
