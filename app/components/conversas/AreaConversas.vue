<script setup lang="ts">
import type { Conversa } from '~/types/chat'

defineProps<{ conversas: Conversa[]; activeId: string; filtro: string; hasMore?: boolean }>()
defineEmits<{ select: [id: string]; filtro: [value: string]; loadMore: [] }>()
</script>

<template>
  <div
    class="flex flex-col bg-panel-left border-r border-panel-divider min-w-0 h-screen overflow-hidden"
  >
    <HeaderConversa :filtro="filtro" @filtro="$emit('filtro', $event)" />
    <ListaConversa
      :conversas="conversas"
      :active-id="activeId"
      :has-more="hasMore"
      @select="$emit('select', $event)"
      @load-more="$emit('loadMore')"
    />
  </div>
</template>
