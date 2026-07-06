<script setup lang="ts">
import type { Aba, AbaKey, Conversa } from '~/types/chat'

defineProps<{ conversas: Conversa[]; activeId: string; abas: Aba[]; aba: AbaKey; hasMore?: boolean }>()
defineEmits<{ select: [id: string]; aba: [value: AbaKey]; loadMore: [] }>()
</script>

<template>
  <div
    class="flex flex-col bg-panel-left border-r border-panel-divider min-w-0 h-screen overflow-hidden"
  >
    <HeaderConversa :abas="abas" :aba="aba" @aba="$emit('aba', $event)" />
    <ListaConversa
      :conversas="conversas"
      :active-id="activeId"
      :has-more="hasMore"
      @select="$emit('select', $event)"
      @load-more="$emit('loadMore')"
    />
  </div>
</template>
