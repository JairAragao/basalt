<template>
  <div class="fixed inset-0 z-40 grid place-items-center bg-black/40" @mousedown.self="$emit('close')">
    <div class="flex h-[86vh] w-[760px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-ink-500 bg-ink-800 shadow-2xl">
      <!-- header -->
      <header class="flex h-12 flex-shrink-0 items-center gap-3 border-b border-ink-500 px-4">
        <span class="text-[14px] font-medium text-txt">Configurações</span>
        <div class="flex-1"></div>
        <button class="icon-btn h-7 w-7" title="Fechar" @click="$emit('close')">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M13 7l-6 6M7 7l6 6" stroke-linecap="round" /></svg>
        </button>
      </header>

      <!-- abas -->
      <div class="flex flex-shrink-0 gap-1 border-b border-ink-500 px-3 pt-2">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="rounded-t-md px-3 py-1.5 text-[13px] transition-colors"
          :class="tab === t.id ? 'bg-ink-700 text-txt' : 'text-faint hover:text-muted'"
          @click="tab = t.id"
        >{{ t.label }}</button>
      </div>

      <!-- corpo -->
      <div class="flex-1 overflow-hidden p-4">
        <StatusEditor
          v-if="tab === 'status'"
          :config="config"
          @saved="(c) => $emit('saved', c)"
        />
        <FiltersEditor
          v-else-if="tab === 'filters'"
          :config="config"
          :current-filters="currentFilters"
          @apply-local="(f) => $emit('apply-local-filters', f)"
        />
        <CardEditor
          v-else-if="tab === 'card'"
          :config="config"
          @saved="(c) => $emit('saved', c)"
        />
        <SyncSettings
          v-else-if="tab === 'sync'"
          :last-pull-at="lastPullAt"
        />
        <GitHistory
          v-else-if="tab === 'history'"
          :tasks="tasks"
          @open-task="(p) => $emit('open-task', p)"
        />
        <UpdateSettings
          v-else-if="tab === 'updates'"
          :version="version"
        />
        <PropertyEditor
          v-else
          :config="config"
          @saved="(c) => $emit('saved', c)"
        />
      </div>
    </div>
  </div>
</template>

<script>
import StatusEditor from './StatusEditor.vue';
import PropertyEditor from './PropertyEditor.vue';
import FiltersEditor from './FiltersEditor.vue';
import CardEditor from './CardEditor.vue';
import SyncSettings from './SyncSettings.vue';
import UpdateSettings from './UpdateSettings.vue';
import GitHistory from './GitHistory.vue';

export default {
  name: 'Settings',
  components: { StatusEditor, PropertyEditor, FiltersEditor, CardEditor, SyncSettings, UpdateSettings, GitHistory },
  props: {
    config: { type: Object, required: true },
    lastPullAt: { type: Number, default: null }, // timestamp do último pull OK (App)
    initialTab: { type: String, default: 'status' },
    version: { type: String, default: '' },
    currentFilters: { type: Array, default: null }, // lista efetiva de filtros (local ?? shared)
    tasks: { type: Array, default: () => [] }, // p/ o histórico global resolver título das tarefas
  },
  emits: ['saved', 'apply-local-filters', 'open-task', 'close'],
  data() {
    const ids = ['status', 'properties', 'filters', 'card', 'sync', 'history', 'updates'];
    return {
      tab: ids.includes(this.initialTab) ? this.initialTab : 'status',
      tabs: [
        { id: 'status', label: 'Status' },
        { id: 'properties', label: 'Propriedades' },
        { id: 'filters', label: 'Filtros' },
        { id: 'card', label: 'Cartão' },
        { id: 'sync', label: 'Sync' },
        { id: 'history', label: 'Histórico' },
        { id: 'updates', label: 'Atualizações' },
      ],
    };
  },
};
</script>
