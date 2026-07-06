<script setup lang="ts">
import type { Peer } from '~/types/chat'

defineProps<{ peer: Peer }>()

const icons = useIcons()
</script>

<template>
  <div
    class="flex items-center justify-between px-4.5 py-2.25 bg-header-bg border-l border-panel-divider z-3"
  >
    <div class="flex items-center gap-3.5">
      <div
        class="w-10.5 h-10.5 rounded-full shrink-0 overflow-hidden grid place-items-center bg-[#d9f0e3] text-[#6b7c84]"
      >
        <img v-if="peer.img" :src="peer.img" alt="" class="w-full h-full object-cover" />
        <span v-else class="w-6.5 h-6.5" v-html="icons.person" />
      </div>
      <span class="text-base font-medium text-text-primary">{{ peer.name }}</span>
    </div>

    <div class="flex items-center gap-1.5">
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
