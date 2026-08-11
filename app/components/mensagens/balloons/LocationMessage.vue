<script setup lang="ts">
import type { LocationMensagem } from '~/types/chat'

const props = defineProps<{ msg: LocationMensagem }>()
const out = computed(() => props.msg.from === 'out')

const mapsUrl = computed(() =>
  `https://www.google.com/maps?q=${props.msg.latitude},${props.msg.longitude}`,
)

const embedUrl = computed(() => {
  const lat = props.msg.latitude
  const lng = props.msg.longitude
  const delta = 0.008
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}&layer=mapnik&marker=${lat}%2C${lng}`
})

const titulo = computed(() => {
  if (props.msg.name) return props.msg.name
  if (props.msg.live) return 'Localização em tempo real'
  return 'Localização'
})

const coords = computed(() =>
  `${props.msg.latitude.toFixed(6)}, ${props.msg.longitude.toFixed(6)}`,
)
</script>

<template>
  <div
    class="max-w-80 shadow-[0_1px_1px_var(--bubble-shadow)] overflow-hidden"
    :class="out ? 'bubble-out bg-bubble-out text-bubble-out-text' : 'bubble-in bg-bubble-in text-bubble-text'"
  >
    <a
      :href="mapsUrl"
      target="_blank"
      rel="noopener"
      class="block no-underline text-inherit"
    >
      <div class="h-36 bg-black/5 dark:bg-white/5 relative overflow-hidden">
        <iframe
          :src="embedUrl"
          class="w-full h-full border-0 pointer-events-none"
          loading="lazy"
          title="Mapa da localização"
        />
      </div>
      <div class="px-2.5 pt-2 pb-1">
        <div class="flex items-start gap-2">
          <span class="text-base leading-none mt-0.5" aria-hidden="true">📍</span>
          <div class="min-w-0 flex-1">
            <div class="text-[14px] font-medium truncate">{{ titulo }}</div>
            <div v-if="msg.address" class="text-[12px] text-bubble-meta mt-0.5 line-clamp-2">
              {{ msg.address }}
            </div>
            <div class="text-[11px] text-bubble-meta mt-0.5 font-mono truncate">
              {{ coords }}
            </div>
          </div>
        </div>
        <MessageMeta :time="msg.time" :status="msg.status" class="mt-1" />
      </div>
    </a>
  </div>
</template>
