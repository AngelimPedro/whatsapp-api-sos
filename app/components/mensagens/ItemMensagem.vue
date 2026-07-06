<script setup lang="ts">
import type { MensagemBalao } from '~/types/chat'

defineProps<{ msg: MensagemBalao }>()
</script>

<template>
  <div class="flex mb-2" :class="msg.from === 'out' ? 'justify-end' : 'justify-start'">
    <TextMessage v-if="msg.kind === 'text'" :msg="msg" />
    <ImageMessage v-else-if="msg.kind === 'image'" :msg="msg" />
    <AudioMessage v-else-if="msg.kind === 'audio'" :msg="msg" />
    <VideoMessage v-else-if="msg.kind === 'video'" :msg="msg" />
    <DocumentMessage v-else-if="msg.kind === 'document'" :msg="msg" />
    <StickerMessage v-else-if="msg.kind === 'sticker'" :msg="msg" />
  </div>
</template>
