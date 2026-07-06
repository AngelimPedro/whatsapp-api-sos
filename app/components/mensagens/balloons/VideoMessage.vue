<script setup lang="ts">
import type { VideoMensagem } from '~/types/chat'

const props = defineProps<{ msg: VideoMensagem }>()
const out = computed(() => props.msg.from === 'out')
</script>

<template>
  <div
    class="p-0.75 max-w-80 shadow-[0_1px_1px_var(--bubble-shadow)] overflow-hidden"
    :class="out ? 'bubble-out bg-bubble-out text-bubble-out-text' : 'bubble-in bg-bubble-in text-bubble-text'"
  >
    <div class="relative">
      <video
        :src="msg.url"
        :poster="msg.poster"
        controls
        preload="none"
        class="rounded-md w-full block max-h-80 bg-black"
      />
      <!-- duração no canto -->
      <span
        v-if="msg.duration"
        class="absolute left-2 top-2 text-[11px] text-white/95 bg-black/45 rounded px-1.5 py-0.5 pointer-events-none"
      >
        {{ msg.duration }}
      </span>
    </div>

    <!-- legenda + meta -->
    <div v-if="msg.caption" class="px-1.5 pt-1 pb-0.5">
      <p class="text-[14.2px] leading-[1.4] whitespace-pre-wrap break-words">{{ msg.caption }}</p>
      <MessageMeta :time="msg.time" :status="msg.status" class="mt-1" />
    </div>
    <MessageMeta v-else :time="msg.time" :status="msg.status" class="px-1.5 pt-1 pb-0.5" />
  </div>
</template>
