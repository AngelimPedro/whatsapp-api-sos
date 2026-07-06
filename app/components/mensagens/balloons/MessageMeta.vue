<script setup lang="ts">
import type { Status } from '~/types/chat'

const props = defineProps<{
  time?: string
  status?: Status
  /** true => versão sobreposta na mídia (texto branco + fundo escuro) */
  onMedia?: boolean
}>()

const icons = useIcons()
// 'read' = visto (azul) | 'delivered' = dois traços | 'sent' = um traço
const tick = computed(() =>
  props.status === 'sent' ? icons.check : icons.doubleCheck,
)
</script>

<template>
  <div
    class="flex items-center justify-end gap-1 text-[11px] leading-none"
    :class="
      onMedia
        ? 'text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]'
        : 'text-bubble-meta'
    "
  >
    <span>{{ time }}</span>
    <span
      v-if="status"
      class="inline-flex [&_svg]:w-4 [&_svg]:h-4"
      :class="status === 'read' ? 'text-check' : onMedia ? 'text-white/95' : 'text-bubble-meta'"
      v-html="tick"
    />
  </div>
</template>
