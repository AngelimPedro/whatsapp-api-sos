<script setup lang="ts">
import type { Aba, AbaKey } from '~/types/chat'

defineProps<{ abas: Aba[]; aba: AbaKey }>()
defineEmits<{ aba: [value: AbaKey] }>()

const icons = useIcons()
</script>

<template>
  <div>
    <!-- título + ações -->
    <div class="flex items-center justify-between px-5 pt-4 pb-3.5 bg-panel-left">
      <h1 class="text-[22px] font-bold text-brand-green tracking-tight">WhatsApp</h1>
      <div class="flex items-center gap-1.5">
        <button
          class="w-10 h-10 grid place-items-center rounded-full text-icon hover:bg-hover-row transition-colors [&_svg]:w-5.5 [&_svg]:h-5.5"
          v-html="icons.newChat"
        />
        <button
          class="w-10 h-10 grid place-items-center rounded-full text-icon hover:bg-hover-row transition-colors [&_svg]:w-5.5 [&_svg]:h-5.5"
          v-html="icons.menu"
        />
      </div>
    </div>

    <!-- abas de status -->
    <div
      class="flex items-stretch px-2 border-b border-panel-divider overflow-x-auto [&::-webkit-scrollbar]:hidden"
    >
      <button
        v-for="t in abas"
        :key="t.key"
        class="relative flex items-center gap-1.5 px-2.5 py-3 text-[13px] font-medium whitespace-nowrap cursor-pointer transition-colors"
        :class="
          t.key === aba
            ? 'text-brand-green'
            : 'text-text-secondary hover:text-text-primary'
        "
        @click="$emit('aba', t.key)"
      >
        {{ t.label }}
        <!-- contagem só na aba ativa (como na referência) -->
        <span
          v-if="t.key === aba"
          class="min-w-5 h-5 px-1.5 grid place-items-center rounded-full text-[11px] font-semibold leading-none bg-chip-active-bg text-chip-active-text"
        >
          {{ t.count }}
        </span>
        <!-- indicador da aba ativa -->
        <span class="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-brand-green" v-if="t.key === aba" />
      </button>
    </div>

    <!-- busca -->
    <div class="px-3 pt-2.5 pb-2">
      <div class="flex items-center gap-3.5 bg-search-bg rounded-lg px-4 py-2">
        <span class="text-text-secondary shrink-0 [&_svg]:w-4.5 [&_svg]:h-4.5" v-html="icons.search" />
        <input
          placeholder="Pesquisar conversas"
          class="border-none bg-transparent outline-none text-text-primary text-[15px] w-full placeholder:text-text-secondary"
        />
      </div>
    </div>
  </div>
</template>
