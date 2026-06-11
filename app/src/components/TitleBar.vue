<template>
  <!-- barra de título custom (frameless). `drag` = arrasta a janela; `no-drag` = interativo -->
  <div class="titlebar drag flex h-10 flex-shrink-0 items-stretch bg-ink-950 text-txt select-none">
    <!-- logo (região arrastável) — sem quadrado, com o glow pulsante do splash -->
    <div class="drag flex flex-shrink-0 items-center gap-2 pl-3 pr-2.5">
      <span class="relative grid h-10 w-10 place-items-center self-center">
        <span class="logo-glow pointer-events-none absolute inset-0 rounded-full"></span>
        <img src="/basalt.png" alt="Basalt" class="relative z-[1] h-9 w-9 object-contain" />
      </span>
    </div>

    <!-- abas (uma por vault) — o container herda `drag` (área vazia arrasta a janela);
         cada aba/botão é `no-drag` (clicável) -->
    <div class="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto px-1 pt-1">
      <div
        v-for="v in vaults"
        :key="v.path"
        class="group/tab no-drag mt-1 flex max-w-[200px] flex-shrink-0 cursor-pointer items-center gap-2 rounded-t-lg px-3 py-1.5 text-[13px] transition-colors"
        :class="(!configuring && v.path === activePath) ? 'bg-ink-850 text-txt' : 'text-faint hover:bg-ink-850/50 hover:text-muted'"
        :title="v.path"
        @click="$emit('switch', v.path)"
      >
        <span
          class="h-1.5 w-1.5 flex-shrink-0 rounded-full"
          :class="v.needsSetup ? 'bg-amber-400' : 'bg-green-500/70'"
        ></span>
        <span class="truncate">{{ v.name }}</span>
        <button
          class="grid h-4 w-4 flex-shrink-0 place-items-center rounded text-faint opacity-0 transition-opacity hover:bg-ink-600 hover:text-txt group-hover/tab:opacity-100"
          title="Remover aba"
          @click.stop="$emit('remove', v.path)"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3 w-3"><path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" /></svg>
        </button>
      </div>

      <!-- aba de configuração (ativa enquanto configura um vault) -->
      <div
        v-if="configuring"
        class="mt-1 flex flex-shrink-0 items-center gap-2 rounded-t-lg bg-ink-850 px-3 py-1.5 text-[13px] text-txt"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-3.5 w-3.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke-linecap="round" stroke-linejoin="round" /></svg>
        Configuração
      </div>

      <!-- + adicionar vault -->
      <button
        class="no-drag ml-1 grid h-7 w-7 flex-shrink-0 self-center place-items-center rounded-md text-faint transition-colors hover:bg-ink-700 hover:text-txt"
        title="Adicionar vault (nova aba)"
        @click="$emit('add')"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4"><path d="M10 4v12M4 10h12" stroke-linecap="round" /></svg>
      </button>
    </div>

    <!-- controles de janela (só no Electron) -->
    <div v-if="isElectron" class="no-drag flex flex-shrink-0 items-stretch">
      <button class="win-btn" title="Minimizar" @click="winMin">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" class="h-3 w-3"><path d="M2 6h8" stroke-linecap="round" /></svg>
      </button>
      <button class="win-btn" :title="maximized ? 'Restaurar' : 'Maximizar'" @click="winMax">
        <svg v-if="maximized" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" class="h-3 w-3"><rect x="3" y="3" width="6" height="6" rx="1" /><path d="M3.5 1.5h6a1 1 0 0 1 1 1v6" /></svg>
        <svg v-else viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" class="h-3 w-3"><rect x="2" y="2" width="8" height="8" rx="1" /></svg>
      </button>
      <button class="win-btn win-close" title="Fechar" @click="winClose">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" class="h-3 w-3"><path d="M3 3l6 6M9 3l-6 6" stroke-linecap="round" /></svg>
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'TitleBar',
  props: {
    vaults: { type: Array, default: () => [] },
    activePath: { type: String, default: '' },
    configuring: { type: Boolean, default: false },
  },
  data() {
    return { maximized: false, _off: null };
  },
  computed: {
    isElectron() {
      return !!(typeof window !== 'undefined' && window.electron && window.electron.isElectron);
    },
  },
  async mounted() {
    if (this.isElectron && window.electron.window) {
      try { this.maximized = await window.electron.window.isMaximized(); } catch (e) { /* noop */ }
      this._off = window.electron.window.onMaximizeChange((v) => { this.maximized = v; });
    }
  },
  beforeUnmount() {
    if (this._off) this._off();
  },
  methods: {
    winMin() { window.electron.window.minimize(); },
    winMax() { window.electron.window.maximize(); },
    winClose() { window.electron.window.close(); },
  },
};
</script>

<style scoped>
.drag { -webkit-app-region: drag; }
.no-drag { -webkit-app-region: no-drag; }
/* mini-splash: glow âmbar pulsante atrás do logo (CSS puro, não fura o drag) */
.logo-glow {
  background: radial-gradient(circle, rgba(217, 160, 30, .38) 0%, rgba(217, 160, 30, .14) 45%, transparent 72%);
  animation: logo-pulse 3s ease-in-out infinite;
}
@keyframes logo-pulse {
  0%, 100% { opacity: .55; transform: scale(.92); }
  50% { opacity: 1; transform: scale(1.08); }
}
.win-btn {
  -webkit-app-region: no-drag;
  display: grid;
  place-items: center;
  width: 46px;
  color: #9b9b9b;
  transition: background-color .12s, color .12s;
}
.win-btn:hover { background: #2a2a2f; color: #ECECEA; }
.win-close:hover { background: #e0566b; color: #fff; }
</style>
