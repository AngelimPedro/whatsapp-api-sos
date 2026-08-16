<script setup lang="ts">
import type { Conversa } from '~/types/chat'

const props = defineProps<{ conversas: Conversa[]; activeId: string; hasMore?: boolean }>()
const emit = defineEmits<{ select: [id: string]; loadMore: [] }>()

const icons = useIcons()
const scrollEl = ref<HTMLElement | null>(null)

// scroll infinito: ao chegar perto do fim, pede mais
function onScroll() {
  const el = scrollEl.value
  if (!el || !props.hasMore) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
    emit('loadMore')
  }
}
</script>

<template>
  <div ref="scrollEl" class="flex-1 overflow-y-auto scroll" @scroll.passive="onScroll">
    <ConversaItem
      v-for="c in conversas"
      :key="c.id"
      :conversa="c"
      :active="c.id === activeId"
      @select="$emit('select', $event)"
    />

    <!-- nota de criptografia -->
    <div
      class="text-center text-[12.5px] text-footer-note px-10 pt-4.5 pb-5.5 leading-normal border-t border-panel-divider"
    >
      <span class="align-[-2px] mr-0.75 inline-block" v-html="icons.lock" />
      Suas mensagens pessoais são protegidas com a
      <a href="#" class="text-brand-green no-underline font-medium" @click.prevent>
        criptografia de ponta a ponta
      </a>
    </div>
  </div>
</template>
