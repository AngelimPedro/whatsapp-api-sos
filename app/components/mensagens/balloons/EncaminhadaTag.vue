<script setup lang="ts">
/** Selo "Encaminhada" no topo do balão, como no WhatsApp. */
const icons = useIcons()
</script>

<template>
  <div class="flex items-center gap-1 text-[12px] italic text-bubble-meta mb-0.5">
    <span class="shrink-0 [&_svg]:w-3.5 [&_svg]:h-3.5" v-html="icons.forward" />
    Encaminhada
  </div>
</template>
