<script setup lang="ts">
import type { Mensagem, Peer } from '~/types/chat'

defineProps<{
  peer: Peer
  mensagens: Mensagem[]
  conversationId?: string
  hasMore?: boolean
}>()
defineEmits<{ send: [text: string]; loadOlder: [] }>()
</script>

<template>
  <div
    class="flex flex-col min-w-0 min-h-0 relative bg-chat-bg h-screen overflow-hidden"
  >
    <HeaderMensagens :peer="peer" />
    <ListaMensagens
      :mensagens="mensagens"
      :conversation-id="conversationId"
      :has-more="hasMore"
      @load-older="$emit('loadOlder')"
    />
    <ChatInput @send="$emit('send', $event)" />
  </div>
</template>
