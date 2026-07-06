<script setup lang="ts">
import type { ImageMensagem } from '~/types/chat'

const props = defineProps<{ msg: ImageMensagem }>()
const out = computed(() => props.msg.from === 'out')
</script>

<template>
  <div
    class="p-0.75 max-w-80 shadow-[0_1px_1px_var(--bubble-shadow)] overflow-hidden"
    :class="out ? 'bubble-out bg-bubble-out text-bubble-out-text' : 'bubble-in bg-bubble-in text-bubble-text'"
  >
    <div class="relative">
      <img
        :src="msg.url"
        alt=""
        class="rounded-md w-full block max-h-80 object-cover cursor-pointer"
      />
      <!-- sem legenda: meta sobreposto com gradiente -->
      <template v-if="!msg.caption">
        <div
          class="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/45 to-transparent rounded-b-md pointer-events-none"
        />
        <MessageMeta
          :time="msg.time"
          :status="msg.status"
          on-media
          class="absolute right-2 bottom-1.5"
        />
      </template>
    </div>

    <!-- com legenda: texto + meta abaixo -->
    <div v-if="msg.caption" class="px-1.5 pt-1 pb-0.5">
      <p class="text-[14.2px] leading-[1.4] whitespace-pre-wrap break-words">{{ msg.caption }}</p>
      <MessageMeta :time="msg.time" :status="msg.status" class="mt-1" />
    </div>
  </div>
</template>
