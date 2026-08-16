<script setup lang="ts">
import type { MensagemBalao } from '~/types/chat'

const props = defineProps<{ msg: MensagemBalao }>()
const emit = defineEmits<{ encaminhar: [id: string] }>()

const icons = useIcons()
const out = computed(() => props.msg.from === 'out')

// só dá pra encaminhar o que já existe no banco — o balão do envio otimista
// ainda não tem id de linha até o POST voltar
const podeEncaminhar = computed(() => !!props.msg.id)

/* ---------- toque longo (mobile) ----------
 * No celular não existe hover, então o gesto é o mesmo do WhatsApp: segurar
 * o balão abre o encaminhamento. Só vale para toque — segurar o mouse no
 * desktop não deve disparar nada, lá o botão aparece no hover. */
const TOQUE_LONGO_MS = 500
const TOLERANCIA_PX = 10

let timer: ReturnType<typeof setTimeout> | null = null
let origem: { x: number; y: number } | null = null

function cancela() {
  if (timer) clearTimeout(timer)
  timer = null
  origem = null
}

function aoPressionar(e: PointerEvent) {
  if (e.pointerType !== 'touch' || !podeEncaminhar.value) return
  cancela()
  origem = { x: e.clientX, y: e.clientY }
  timer = setTimeout(() => {
    cancela()
    emit('encaminhar', props.msg.id!)
  }, TOQUE_LONGO_MS)
}

// rolar a conversa não pode virar toque longo
function aoMover(e: PointerEvent) {
  if (!origem) return
  if (Math.abs(e.clientX - origem.x) > TOLERANCIA_PX || Math.abs(e.clientY - origem.y) > TOLERANCIA_PX) {
    cancela()
  }
}

onBeforeUnmount(cancela)
</script>

<template>
  <div
    class="group flex items-center gap-1.5 mb-2"
    :class="out ? 'justify-end' : 'justify-start'"
    @pointerdown="aoPressionar"
    @pointermove="aoMover"
    @pointerup="cancela"
    @pointercancel="cancela"
    @contextmenu.prevent
  >
    <!-- desktop: botão aparece no hover, do lado de fora do balão -->
    <button
      v-if="podeEncaminhar && out"
      class="hidden md:grid w-7 h-7 shrink-0 place-items-center rounded-full text-icon opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-hover-row transition-opacity [&_svg]:w-4 [&_svg]:h-4"
      title="Encaminhar"
      aria-label="Encaminhar mensagem"
      @click="emit('encaminhar', msg.id!)"
      v-html="icons.forward"
    />

    <TextMessage v-if="msg.kind === 'text'" :msg="msg" />
    <ImageMessage v-else-if="msg.kind === 'image'" :msg="msg" />
    <AudioMessage v-else-if="msg.kind === 'audio'" :msg="msg" />
    <VideoMessage v-else-if="msg.kind === 'video'" :msg="msg" />
    <DocumentMessage v-else-if="msg.kind === 'document'" :msg="msg" />
    <StickerMessage v-else-if="msg.kind === 'sticker'" :msg="msg" />
    <LocationMessage v-else-if="msg.kind === 'location'" :msg="msg" />

    <button
      v-if="podeEncaminhar && !out"
      class="hidden md:grid w-7 h-7 shrink-0 place-items-center rounded-full text-icon opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-hover-row transition-opacity [&_svg]:w-4 [&_svg]:h-4"
      title="Encaminhar"
      aria-label="Encaminhar mensagem"
      @click="emit('encaminhar', msg.id!)"
      v-html="icons.forward"
    />
  </div>
</template>
