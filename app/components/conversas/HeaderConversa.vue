<script setup lang="ts">
defineProps<{ filtro: string }>()
defineEmits<{ filtro: [value: string] }>()

const icons = useIcons()
const filtros = ['Tudo', 'Não lidas', 'Favoritas', 'Grupos']
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

    <!-- busca -->
    <div class="px-3 pt-1 pb-2">
      <div class="flex items-center gap-3.5 bg-search-bg rounded-lg px-4 py-2">
        <span class="text-text-secondary shrink-0 [&_svg]:w-4.5 [&_svg]:h-4.5" v-html="icons.search" />
        <input
          placeholder="Pesquisar conversas favoritas"
          class="border-none bg-transparent outline-none text-text-primary text-[15px] w-full placeholder:text-text-secondary"
        />
      </div>
    </div>

    <!-- chips de filtro -->
    <div class="flex items-center gap-2 px-3.5 pt-1.5 pb-3">
      <button
        v-for="f in filtros"
        :key="f"
        class="border text-sm px-3.5 py-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors"
        :class="
          f === filtro
            ? 'bg-chip-active-bg text-chip-active-text border-transparent'
            : 'border-chip-border text-chip-text hover:bg-hover-row'
        "
        @click="$emit('filtro', f)"
      >
        {{ f }}
      </button>
      <button
        class="w-8.5 h-8.5 grid place-items-center rounded-full border border-chip-border text-chip-text hover:bg-hover-row transition-colors [&_svg]:w-4 [&_svg]:h-4"
        v-html="icons.chevron"
      />
    </div>
  </div>
</template>
