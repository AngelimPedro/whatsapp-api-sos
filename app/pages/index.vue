<script setup lang="ts">
import type { AbaKey } from '~/types/chat'

const icons = useIcons()

const dark = ref(true)

// store Pinia: cacheia conversas e mensagens (volta instantânea, sem refetch)
const chat = useChatStore()
const {
  conversas,
  conversaAtiva,
  mensagens,
  activeId,
  abaAtiva: aba,
  totalConversas,
  hasMoreConversas,
  hasMoreMensagens,
} = storeToRefs(chat)

onMounted(async () => {
  // SOS HUB: inicia no tema dark premium
  document.documentElement.setAttribute('data-theme', dark.value ? 'dark' : 'light')

  // No mobile o hub abre em "Pedidos": é a fila pequena e acionável, enquanto a
  // Entrada tende a crescer muito. Leitura única (não é um watcher) e antes do
  // load, pra buscar só a fila que vai aparecer. No desktop abre na Entrada.
  if (window.matchMedia('(max-width: 767px)').matches) await chat.setAba('pedidos')

  await chat.loadConversas()
})

/* ---------- abas por status da conversa ----------
 * Cada aba é uma fila paginada no servidor (ver /api/conversations), então só
 * dá pra saber o tamanho da que está carregada — que é justamente a única
 * cujo contador o header mostra. */
const abas = computed(() =>
  (
    [
      ['entrada', 'Entrada'],
      ['qualificado', 'Qualificados'],
      ['pedidos', 'Pedidos'],
      ['atendimento_humano', 'Humano'],
      ['desqualificado', 'Desqualificados'],
    ] as [AbaKey, string][]
  ).map(([key, label]) => ({
    key,
    label,
    count: key === aba.value ? totalConversas.value : 0,
  })),
)

const activePeer = computed(() => ({
  name: conversaAtiva.value?.name ?? '',
  img: conversaAtiva.value?.img,
}))

/* ---------- navegação mobile (uma tela por vez, como o app nativo) ----------
 * No desktop os dois painéis convivem no grid. No mobile só um aparece:
 * a lista é a tela raiz e a conversa entra por cima ao ser tocada.
 * A store já seleciona a 1ª conversa no load (o desktop depende disso),
 * então o que controla a tela no mobile é este flag, não o activeId. */
const chatAbertoMobile = ref(false)

// No mobile o painel do chat fica em display:none enquanto a lista está na
// tela, então o scroll inicial do ListaMensagens roda com altura 0 e para no
// topo. Abrir a mesma conversa que já era a ativa também não mexe no
// conversationId, que é o gatilho normal de reancorar. Este contador avisa a
// lista de mensagens que ela acabou de aparecer e precisa voltar pro fim.
const ancorarNoFim = ref(0)

function abrirConversa(id: string) {
  chat.selectConversa(id)
  chatAbertoMobile.value = true
  ancorarNoFim.value++
}

function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.setAttribute('data-theme', dark.value ? 'dark' : 'light')
}

function enviarMensagem(text: string) {
  // envia via Datafy (com update otimista dentro da action)
  chat.sendMensagem(text)
}
</script>

<template>
  <div
    class="h-dvh overflow-hidden bg-bg-app md:grid md:grid-cols-[360px_1fr] lg:grid-cols-[420px_1fr]"
  >
    <!-- painel da lista: tela raiz no mobile, coluna fixa no desktop -->
    <div class="min-w-0" :class="chatAbertoMobile ? 'hidden md:block' : 'block'">
      <AreaConversas
        :conversas="conversas"
        :active-id="activeId"
        :abas="abas"
        :aba="aba"
        :has-more="hasMoreConversas"
        @select="abrirConversa"
        @aba="chat.setAba($event)"
        @load-more="chat.loadMoreConversas()"
      />
    </div>

    <!-- painel da conversa: ocupa a tela toda no mobile -->
    <div class="min-w-0" :class="chatAbertoMobile ? 'block' : 'hidden md:block'">
      <!-- com as abas viradas filas independentes, uma aba vazia deixa de ter
           conversa ativa — antes o painel mostrava uma conversa de outra aba -->
      <div
        v-if="!activeId"
        class="h-dvh grid place-items-center bg-chat-bg text-text-secondary text-[15px] px-8 text-center"
      >
        Selecione uma conversa para começar
      </div>
      <AreaMensagens
        v-else
        :peer="activePeer"
        :mensagens="mensagens"
        :conversation-id="activeId"
        :has-more="hasMoreMensagens"
        :ancorar-no-fim="ancorarNoFim"
        @send="enviarMensagem"
        @load-older="chat.loadOlderMensagens"
        @back="chatAbertoMobile = false"
      />
    </div>
  </div>

  <!-- toggle de tema flutuante — no mobile some quando a conversa está aberta
       (a barra de input ocupa esse canto) e vira só o ícone -->
  <button
    class="fixed bottom-4 left-4 z-50 items-center gap-2 bg-header-bg border border-panel-divider text-icon px-3 py-2 rounded-full cursor-pointer text-[13px] shadow-[0_2px_8px_rgba(0,0,0,0.12)] [&_svg]:w-4 [&_svg]:h-4"
    :class="chatAbertoMobile ? 'hidden md:flex' : 'flex'"
    @click="toggleTheme"
  >
    <span v-html="dark ? icons.sun : icons.moon" />
    <span class="hidden md:inline">{{ dark ? 'Modo claro' : 'Modo escuro' }}</span>
  </button>
</template>
