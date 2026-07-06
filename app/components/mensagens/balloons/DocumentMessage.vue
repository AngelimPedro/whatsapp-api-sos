<script setup lang="ts">
import type { DocumentMensagem } from '~/types/chat'

const props = defineProps<{ msg: DocumentMensagem }>()
const out = computed(() => props.msg.from === 'out')
const icons = useIcons()

// "12 páginas · PDF · 2,4 MB"
const subInfo = computed(() =>
  [props.msg.pages, props.msg.ext, props.msg.size].filter(Boolean).join(' · '),
)
</script>

<template>
  <div
    class="px-2 pt-2 pb-1 max-w-80 shadow-[0_1px_1px_var(--bubble-shadow)]"
    :class="out ? 'bubble-out bg-bubble-out text-bubble-out-text' : 'bubble-in bg-bubble-in text-bubble-text'"
  >
    <a
      :href="msg.url"
      target="_blank"
      rel="noopener"
      class="flex items-center gap-3 bg-black/5 dark:bg-white/5 rounded-lg p-2.5 no-underline text-inherit"
    >
      <!-- selo do arquivo -->
      <div
        class="w-10 h-12 rounded-md grid place-items-center bg-white/70 dark:bg-black/25 text-[#e44] shrink-0 [&_svg]:w-6 [&_svg]:h-6"
        v-html="icons.doc"
      />
      <div class="flex-1 min-w-0">
        <div class="text-[14px] font-medium truncate">{{ msg.filename }}</div>
        <div class="text-[12px] text-bubble-meta mt-0.5 truncate">{{ subInfo }}</div>
      </div>
      <span class="text-icon shrink-0 [&_svg]:w-5 [&_svg]:h-5" v-html="icons.download" />
    </a>

    <!-- legenda opcional -->
    <p
      v-if="msg.caption"
      class="text-[14.2px] leading-[1.4] whitespace-pre-wrap break-words px-0.5 pt-1.5"
    >
      {{ msg.caption }}
    </p>
    <MessageMeta :time="msg.time" :status="msg.status" class="px-0.5 pt-1" />
  </div>
</template>
