<script setup lang="ts">
import type { Peer } from '~/types/chat'

defineProps<{ peer: Peer }>()
defineEmits<{ back: [] }>()

const icons = useIcons()
</script>

<template>
  <div
    class="flex items-center justify-between gap-2 px-2 md:px-4.5 py-2.25 bg-header-bg md:border-l border-panel-divider z-3 shrink-0"
  >
    <div class="flex items-center gap-2 md:gap-3.5 min-w-0">
      <!-- voltar pra lista (só no mobile, onde os painéis não convivem) -->
      <button
        class="md:hidden w-9 h-9 grid place-items-center rounded-full text-icon hover:bg-hover-row transition-colors shrink-0 [&_svg]:w-5.5 [&_svg]:h-5.5"
        aria-label="Voltar para as conversas"
        @click="$emit('back')"
        v-html="icons.arrowLeft"
      />
      <div
        class="w-9.5 h-9.5 md:w-10.5 md:h-10.5 rounded-full shrink-0 overflow-hidden grid place-items-center bg-active-row text-text-secondary"
      >
        <img v-if="peer.img" :src="peer.img" alt="" class="w-full h-full object-cover" />
        <span v-else class="w-6.5 h-6.5" v-html="icons.person" />
      </div>
      <span class="text-base font-medium text-text-primary truncate">{{ peer.name }}</span>
    </div>

    <div class="flex items-center gap-1.5 shrink-0">
      <button
        class="w-10 h-10 grid place-items-center rounded-full text-icon hover:bg-hover-row transition-colors [&_svg]:w-5.5 [&_svg]:h-5.5"
        v-html="icons.search"
      />
      <button
        class="w-10 h-10 grid place-items-center rounded-full text-icon hover:bg-hover-row transition-colors [&_svg]:w-5.5 [&_svg]:h-5.5"
        v-html="icons.menu"
      />
    </div>
  </div>
</template>
