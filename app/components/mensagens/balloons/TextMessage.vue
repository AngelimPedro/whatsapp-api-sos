<script setup lang="ts">
import type { TextMensagem } from '~/types/chat'

const props = defineProps<{ msg: TextMensagem }>()
const out = computed(() => props.msg.from === 'out')
</script>

<template>
  <div
    class="max-w-[85%] md:max-w-120 shadow-[0_1px_1px_var(--bubble-shadow)] overflow-hidden"
    :class="out ? 'bubble-out bg-bubble-out text-bubble-out-text' : 'bubble-in bg-bubble-in text-bubble-text'"
  >
    <div class="px-2.5 pt-1.5 pb-1">
      <EncaminhadaTag v-if="msg.forwarded" />
      <p class="text-[14.2px] leading-[1.4] whitespace-pre-wrap break-words">{{ msg.text }}</p>
      <MessageMeta :time="msg.time" :status="msg.status" class="mt-1" />
    </div>
  </div>
</template>
