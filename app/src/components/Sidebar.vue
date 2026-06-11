<template>
  <!-- rail fixo à esquerda: recolhido (48px, só ícones) por padrão; 200px com labels -->
  <nav
    class="flex flex-shrink-0 flex-col gap-1 border-r border-ink-500 bg-ink-850 py-2 transition-[width] duration-150"
    :class="open ? 'w-[200px]' : 'w-12'"
    aria-label="Navegação principal"
  >
    <button
      type="button"
      class="side-item"
      :class="active === 'tasks' ? 'bg-ink-600 text-txt' : 'text-faint hover:bg-ink-700 hover:text-muted'"
      title="Tarefas"
      :aria-current="active === 'tasks' ? 'page' : null"
      @click="$emit('navigate', 'tasks')"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 flex-shrink-0"><rect x="3" y="4" width="4" height="12" rx="1" /><rect x="8.5" y="4" width="4" height="8" rx="1" /><rect x="14" y="4" width="4" height="10" rx="1" /></svg>
      <span v-if="open" class="truncate">Tarefas</span>
    </button>

    <button
      type="button"
      class="side-item"
      :class="active === 'dashboard' ? 'bg-ink-600 text-txt' : 'text-faint hover:bg-ink-700 hover:text-muted'"
      title="Dashboard"
      :aria-current="active === 'dashboard' ? 'page' : null"
      @click="$emit('navigate', 'dashboard')"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 flex-shrink-0"><path d="M3 17V9M8 17V4M13 17v-6M18 17V7" stroke-linecap="round" /></svg>
      <span v-if="open" class="truncate">Dashboard</span>
    </button>

    <button
      type="button"
      class="side-item text-faint hover:bg-ink-700 hover:text-muted"
      title="Configurações"
      @click="$emit('open-settings')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4 flex-shrink-0">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span v-if="open" class="truncate">Configurações</span>
    </button>

    <div class="flex-1"></div>

    <button
      type="button"
      class="side-item text-faint hover:bg-ink-700 hover:text-muted"
      :title="open ? 'Recolher menu' : 'Expandir menu'"
      :aria-expanded="open ? 'true' : 'false'"
      @click="toggle"
    >
      <svg v-if="open" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4 flex-shrink-0"><path d="M12 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <svg v-else viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4 flex-shrink-0"><path d="M8 5l5 5-5 5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span v-if="open" class="truncate">Recolher</span>
    </button>
  </nav>
</template>

<script>
const openKey = 'basalt.sidebarOpen';

export default {
  name: 'Sidebar',
  props: {
    active: { type: String, default: 'tasks' }, // 'tasks' | 'dashboard'
  },
  emits: ['navigate', 'open-settings'],
  data() {
    return { open: this.loadOpen() };
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
</style>
