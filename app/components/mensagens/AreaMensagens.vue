<script setup lang="ts">
import type { Mensagem, Peer } from '~/types/chat'

defineProps<{
  peer: Peer
  mensagens: Mensagem[]
  conversationId?: string
  hasMore?: boolean
  /** contador que sobe quando o painel reaparece e o scroll precisa voltar pro fim */
  ancorarNoFim?: number
}>()
defineEmits<{ send: [text: string]; loadOlder: []; back: [] }>()
</script>

<template>
  <div
    class="flex flex-col min-w-0 min-h-0 relative bg-chat-bg w-full h-dvh overflow-hidden"
  >
    <HeaderMensagens :peer="peer" @back="$emit('back')" />
    <ListaMensagens
      :mensagens="mensagens"
      :conversation-id="conversationId"
      :has-more="hasMore"
      :ancorar-no-fim="ancorarNoFim"
      @load-older="$emit('loadOlder')"
    />
    <ChatInput @send="$emit('send', $event)" />
  </div>
</template>
