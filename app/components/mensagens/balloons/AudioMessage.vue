<script setup lang="ts">
import type { AudioMensagem } from '~/types/chat'

const props = defineProps<{ msg: AudioMensagem }>()
const out = computed(() => props.msg.from === 'out')
const icons = useIcons()

const audioEl = ref<HTMLAudioElement | null>(null)
const playing = ref(false)

// alturas das barras (waveform fake) — preenchem toda a largura
const bars = [
  5, 8, 12, 16, 22, 18, 13, 9, 6, 10, 15, 20, 24, 19, 14, 10, 7, 5, 9, 13,
  18, 23, 20, 15, 11, 8, 6, 10, 14, 19, 22, 17, 12, 8, 6, 9, 13, 17, 11, 7,
]

function toggle() {
  const a = audioEl.value
  if (!a) return
  if (a.paused) {
    a.play()
    playing.value = true
  } else {
    a.pause()
    playing.value = false
  }
}
</script>

<template>
  <div
    class="px-2.5 py-2 w-85 max-w-full shadow-[0_1px_1px_var(--bubble-shadow)]"
    :class="out ? 'bubble-out bg-bubble-out text-bubble-out-text' : 'bubble-in bg-bubble-in text-bubble-text'"
  >
    <div class="flex items-center gap-2.5">
      <!-- botão play/pause -->
      <button
        class="w-10 h-10 rounded-full grid place-items-center bg-brand-green text-white shrink-0 [&_svg]:w-6 [&_svg]:h-6"
        @click="toggle"
        v-html="playing ? icons.pause : icons.play"
      />

      <div class="flex-1 min-w-0">
        <!-- waveform -->
        <div class="flex items-center justify-between h-6.5">
          <span
            v-for="(h, i) in bars"
            :key="i"
            class="w-0.75 rounded-full bg-text-secondary/55 shrink-0"
            :style="{ height: h + 'px' }"
          />
        </div>
        <div class="flex items-center justify-between mt-1">
          <span class="text-[11px] text-bubble-meta">{{ msg.duration ?? '0:00' }}</span>
          <MessageMeta :time="msg.time" :status="msg.status" />
        </div>
      </div>
    </div>

    <audio ref="audioEl" :src="msg.url" preload="none" class="hidden" @ended="playing = false" />
  </div>
</template>
