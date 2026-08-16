<script setup lang="ts">
import type { Aba, AbaKey } from '~/types/chat'

defineProps<{ abas: Aba[]; aba: AbaKey }>()
defineEmits<{ aba: [value: AbaKey] }>()

const icons = useIcons()

// No mobile as 5 abas dividem a largura da tela, sem rolagem horizontal — os
// rótulos longos não cabem, então cada um tem uma versão curta.
const ROTULO_CURTO: Record<AbaKey, string> = {
  entrada: 'Entrada',
  qualificado: 'Qualif.',
  pedidos: 'Pedidos',
  atendimento_humano: 'Humano',
  desqualificado: 'Desq.',
}
</script>

<template>
  <div class="shrink-0">
    <!-- título + ações -->
    <div class="flex items-center justify-between px-4 md:px-5 pt-3 md:pt-4 pb-3 md:pb-3.5 bg-panel-left shrink-0">
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
      class="flex items-stretch px-1 md:px-2 border-b border-panel-divider md:overflow-x-auto [&::-webkit-scrollbar]:hidden"
    >
      <button
        v-for="t in abas"
        :key="t.key"
        class="relative flex flex-1 md:flex-none items-center justify-center gap-1 md:gap-1.5 px-0.5 md:px-2.5 py-3 text-[12px] md:text-[13px] font-medium whitespace-nowrap cursor-pointer transition-colors"
        :class="[
          t.key === aba
            ? 'text-brand-green'
            : 'text-text-secondary hover:text-text-primary',
          // no mobile o hub abre em Pedidos, então ela vem primeiro na barra
          t.key === 'pedidos' ? 'order-first md:order-none' : '',
        ]"
        @click="$emit('aba', t.key)"
      >
        <span class="md:hidden">{{ ROTULO_CURTO[t.key] }}</span>
        <span class="hidden md:inline">{{ t.label }}</span>
        <!-- contagem só na aba ativa (como na referência) -->
        <span
          v-if="t.key === aba"
          class="min-w-4.5 md:min-w-5 h-4.5 md:h-5 px-1 md:px-1.5 grid place-items-center rounded-full text-[10px] md:text-[11px] font-semibold leading-none bg-chip-active-bg text-chip-active-text"
        >
          {{ t.count }}
        </span>
        <!-- indicador da aba ativa -->
        <span class="absolute left-1 right-1 md:left-2 md:right-2 -bottom-px h-0.5 rounded-full bg-brand-green" v-if="t.key === aba" />
      </button>
    </div>

    <!-- busca -->
    <div class="px-3 pt-2.5 pb-2">
      <div class="flex items-center gap-3.5 bg-search-bg rounded-lg px-4 py-2">
        <span class="text-text-secondary shrink-0 [&_svg]:w-4.5 [&_svg]:h-4.5" v-html="icons.search" />
        <input
          placeholder="Pesquisar conversas"
          class="border-none bg-transparent outline-none text-text-primary text-[16px] md:text-[15px] w-full placeholder:text-text-secondary"
        />
      </div>
    </div>
  </div>
</template>
