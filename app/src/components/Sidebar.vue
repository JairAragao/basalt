<template>
  <!-- rail fixo à esquerda (padrão ACM): w-14 recolhida (default) ↔ w-56, botão
       flutuante na borda direita com chevron que rotaciona ao recolher -->
  <nav
    class="relative flex flex-shrink-0 flex-col gap-1 overflow-visible border-r border-ink-500 bg-ink-850 py-2 transition-all duration-300"
    :class="open ? 'w-56' : 'w-14'"
    aria-label="Navegação principal"
  >
    <!-- toggle flutuante (estilo ACM) -->
    <button
      type="button"
      class="absolute -right-3.5 top-6 z-50 flex h-7 w-7 items-center justify-center rounded-md bg-accent text-ink-900 shadow-lg transition-all duration-300 hover:scale-105"
      :title="open ? 'Recolher menu' : 'Expandir menu'"
      :aria-expanded="open ? 'true' : 'false'"
      @click="toggle"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="h-4 w-4 transition-transform duration-300"
        :class="{ 'rotate-180': !open }"
      ><path d="M12 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>

    <button
      type="button"
      class="side-item"
      :class="active === 'dashboard' ? 'bg-ink-600 text-txt' : 'text-faint hover:bg-ink-700 hover:text-muted'"
      :title="open ? null : 'Dashboard'"
      :aria-current="active === 'dashboard' ? 'page' : null"
      @click="$emit('navigate', 'dashboard')"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 flex-shrink-0"><path d="M3 17V9M8 17V4M13 17v-6M18 17V7" stroke-linecap="round" /></svg>
      <span v-if="open" class="truncate">Dashboard</span>
    </button>

    <!-- Tarefas: Kanban e Tabela são itens de topo (não mais submenu) -->
    <button
      v-for="opt in viewOptions"
      :key="opt.id"
      type="button"
      class="side-item"
      :class="active === 'tasks' && view === opt.id ? 'bg-ink-600 text-txt' : 'text-faint hover:bg-ink-700 hover:text-muted'"
      :title="open ? null : opt.navLabel"
      :aria-current="active === 'tasks' && view === opt.id ? 'page' : null"
      @click="$emit('set-view', opt.id)"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 flex-shrink-0" v-html="opt.svg"></svg>
      <span v-if="open" class="truncate">{{ opt.navLabel }}</span>
    </button>

    <button
      type="button"
      class="side-item"
      :class="active === 'extensions' ? 'bg-ink-600 text-txt' : 'text-faint hover:bg-ink-700 hover:text-muted'"
      :title="open ? null : 'Extensões'"
      :aria-current="active === 'extensions' ? 'page' : null"
      @click="$emit('navigate', 'extensions')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 flex-shrink-0"><path d="M9 3h4v2.5a1.5 1.5 0 0 0 3 0V3h2v4h2.5a1.5 1.5 0 0 1 0 3H18v4h2a1 1 0 0 1 1 1v4H4V4a1 1 0 0 1 1-1h4Z" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span v-if="open" class="truncate">Extensões</span>
    </button>

    <!-- Configurações ancorada no rodapé -->
    <div class="mt-auto">
      <!-- destaque de atualização pendente (só quando há update disponível/pronto) -->
      <button
        v-if="updatePending"
        type="button"
        class="side-item relative mb-1 border border-accent/50 bg-accent/10 text-accent hover:bg-accent/15"
        :title="open ? null : 'Atualização disponível'"
        @click="$emit('open-update')"
      >
        <span class="relative flex-shrink-0">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M10 3v9M6 8l4 4 4-4M4 16h12" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span class="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent"></span>
        </span>
        <span v-if="open" class="truncate">Atualização disponível</span>
      </button>

      <div class="mx-2 mb-1 h-px bg-ink-500/60"></div>
      <button
        type="button"
        class="side-item text-faint hover:bg-ink-700 hover:text-muted"
        :title="open ? null : 'Configurações'"
        @click="$emit('open-settings')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4 flex-shrink-0">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span v-if="open" class="truncate">Configurações</span>
      </button>

      <!-- versão do Basalt (rodapé) -->
      <div
        class="mt-1 select-none px-2 font-mono text-[10px] leading-none text-faint/70"
        :class="open ? 'text-left' : 'text-center'"
        :title="'Versão do Basalt: ' + version"
      >{{ open ? ('v' + version) : version }}</div>
    </div>
  </nav>
</template>

<script>
const openKey = 'basalt.sidebarOpen';

export default {
  name: 'Sidebar',
  props: {
    active: { type: String, default: 'tasks' }, // 'tasks' | 'dashboard'
    view: { type: String, default: 'kanban' },   // 'kanban' | 'table' — visualização das tarefas
    version: { type: String, default: '' },      // versão do Basalt (rodapé da sidebar)
    updatePending: { type: Boolean, default: false }, // atualização disponível/baixando/pronta
  },
  emits: ['navigate', 'open-settings', 'set-view', 'open-update'],
  data() {
    return {
      open: this.loadOpen(),
      viewOptions: [
        { id: 'kanban', label: 'Kanban', navLabel: 'Tarefas em Kanban', svg: '<rect x="3" y="4" width="4" height="12" rx="1" /><rect x="8.5" y="4" width="4" height="8" rx="1" /><rect x="14" y="4" width="4" height="10" rx="1" />' },
        { id: 'table', label: 'Tabela', navLabel: 'Tarefas em Tabela', svg: '<rect x="3" y="4" width="14" height="12" rx="1" /><path d="M3 8h14M3 12h14M9 4v12" />' },
      ],
    };
  },
  methods: {
    loadOpen() {
      // default RECOLHIDO ('0')
      try { return localStorage.getItem(openKey) === '1'; } catch (e) { return false; }
    },
    toggle() {
      this.open = !this.open;
      try { localStorage.setItem(openKey, this.open ? '1' : '0'); } catch (e) { /* ignore */ }
    },
  },
};
</script>

<style scoped>
.side-item {
  @apply mx-1.5 flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] transition-colors;
}
.side-subitem {
  @apply flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] transition-colors;
}
.submenu-enter-active, .submenu-leave-active { transition: opacity .18s ease, max-height .22s ease; max-height: 120px; }
.submenu-enter-from, .submenu-leave-to { opacity: 0; max-height: 0; }
</style>
