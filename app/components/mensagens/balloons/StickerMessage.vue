<script setup lang="ts">
import type { StickerMensagem } from '~/types/chat'

defineProps<{ msg: StickerMensagem }>()
</script>

<template>
  <!-- sticker não tem balão (fundo transparente) -->
  <div class="flex flex-col items-start gap-0.5">
    <img :src="msg.url" alt="" class="w-30 h-30 object-contain" />
    <MessageMeta :time="msg.time" :status="msg.status" class="px-1" />
  </div>
</template>
