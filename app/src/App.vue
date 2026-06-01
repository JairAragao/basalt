<template>
  <div class="flex h-screen flex-col bg-ink-900 text-txt font-sans">
    <!-- Topbar -->
    <header class="flex h-12 flex-shrink-0 items-center gap-3 border-b border-ink-500 bg-ink-850 px-4">
      <div class="flex items-center gap-2 text-sm font-medium">
        <span class="grid h-6 w-6 place-items-center overflow-hidden rounded-md border border-ink-500 bg-ink-600 shadow-[0_0_12px_rgba(217,160,30,0.15)]"><img src="/basalt.png" alt="Basalt" class="h-5 w-5 max-w-none scale-[1.6] object-contain" /></span>
        Basalt
      </div>

      <div class="flex-1"></div>

      <template v-if="config && !loadError">
        <!-- Filtros (board.filters) com Dropdown -->
        <Dropdown
          v-for="f in filterFields"
          :key="f.name"
          :value="filters[f.name]"
          :options="f.options"
          :placeholder="f.label + ': todos'"
          clearable
          class="w-44"
          @input="(v) => setFilter(f.name, v)"
        />

        <!-- separador -->
        <span class="mx-0.5 h-5 w-px bg-ink-500"></span>

        <!-- Ordenação -->
        <Dropdown
          :value="sort.by"
          :options="sortFields"
          placeholder="Ordenar por"
          class="w-44"
          @input="setSortBy"
        />
        <button class="icon-btn h-8 w-8" :title="sort.dir === 'asc' ? 'Crescente' : 'Decrescente'" @click="toggleSortDir">
          <svg v-if="sort.dir === 'asc'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M10 16V4M6 8l4-4 4 4" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <svg v-else viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M10 4v12M6 12l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>

        <!-- separador -->
        <span class="mx-0.5 h-5 w-px bg-ink-500"></span>

        <!-- Toggle de view (Kanban | Tabela) -->
        <div class="flex items-center rounded-md border border-ink-500 p-0.5 text-[13px]">
          <button
            class="flex items-center gap-1.5 rounded px-2 py-1 transition-colors"
            :class="view === 'kanban' ? 'bg-ink-600 text-txt' : 'text-faint hover:text-muted'"
            @click="view = 'kanban'"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5"><rect x="3" y="4" width="4" height="12" rx="1" /><rect x="8.5" y="4" width="4" height="8" rx="1" /><rect x="14" y="4" width="4" height="10" rx="1" /></svg>
            Kanban
          </button>
          <button
            class="flex items-center gap-1.5 rounded px-2 py-1 transition-colors"
            :class="view === 'table' ? 'bg-ink-600 text-txt' : 'text-faint hover:text-muted'"
            @click="view = 'table'"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5"><rect x="3" y="4" width="14" height="12" rx="1" /><path d="M3 8h14M3 12h14M9 4v12" /></svg>
            Tabela
          </button>
        </div>

        <!-- Colorir colunas (só no kanban) -->
        <button
          v-if="view === 'kanban'"
          class="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] transition-colors"
          :class="colorColumns ? 'border-accent/60 bg-accent/15 text-txt' : 'border-ink-500 text-faint hover:text-muted'"
          title="Colorir cabeçalhos das colunas"
          @click="toggleColorColumns"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><circle cx="10" cy="10" r="6" /><path d="M10 4a6 6 0 0 0 0 12" fill="currentColor" stroke="none" /></svg>
          Colorir
        </button>

        <!-- Configurações -->
        <button class="icon-btn h-8 w-8" title="Configurações" @click="settingsOpen = true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" class="h-4 w-4">
            <circle cx="10" cy="10" r="2.5" />
            <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7" stroke-linecap="round" />
          </svg>
        </button>

        <!-- Sincronizar (git pull) -->
        <button class="icon-btn h-8 w-8" title="Sincronizar (git pull)" :disabled="syncing" @click="doSync">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4" :class="{ 'animate-spin': syncing }">
            <path d="M4 7a6 6 0 0 1 10.5-2.5M16 13a6 6 0 0 1-10.5 2.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M14.5 4.5V2.5h2M5.5 15.5v2h-2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <!-- Recarregar -->
        <button class="icon-btn h-8 w-8" title="Recarregar" :disabled="loading" @click="reload">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4" :class="{ 'animate-spin': loading }">
            <path d="M16 10a6 6 0 1 1-1.8-4.3" stroke-linecap="round" />
            <path d="M15 3v3h-3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <!-- Nova tarefa -->
        <button
          class="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-40"
          @click="openCreate"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4"><path d="M10 4v12M4 10h12" stroke-linecap="round" /></svg>
          Nova tarefa
        </button>
      </template>
    </header>

    <!-- Conteúdo -->
    <main class="relative flex-1 overflow-hidden">
      <div v-if="loading && !config" class="grid h-full place-items-center text-muted text-sm">
        Carregando…
      </div>

      <div v-else-if="loadError" class="grid h-full place-items-center">
        <div class="max-w-sm rounded-lg border border-red-500/40 bg-red-500/10 p-5 text-center">
          <div class="text-sm font-medium text-red-300">Não foi possível carregar a configuração</div>
          <div class="mt-1 text-xs text-muted">{{ loadError }}</div>
          <button class="mt-3 rounded-md border border-ink-500 px-3 py-1.5 text-xs hover:bg-ink-700" @click="reload">
            Tentar novamente
          </button>
        </div>
      </div>

      <template v-else-if="config">
        <Board
          v-if="view === 'kanban'"
          :tasks="filteredTasks"
          :config="config"
          :color-columns="colorColumns"
          :sort="sort"
          @open="openEdit"
          @delete="confirmDelete"
          @moved="onMoved"
          @error="(m) => notify(m, 'error')"
        />
        <TableView
          v-else
          :tasks="filteredTasks"
          :config="config"
          :sort="sort"
          @open="openEdit"
          @sort="(s) => (sort = s)"
        />
      </template>
    </main>

    <!-- Peek lateral (criar/editar) -->
    <TaskPeek
      v-if="config"
      :open="peekOpen"
      :config="config"
      :task="editingTask"
      @saved="onSaved"
      @delete="confirmDelete"
      @close="peekOpen = false"
    />

    <!-- Configurações -->
    <Settings
      v-if="settingsOpen && config"
      :config="config"
      @saved="onConfigSaved"
      @close="settingsOpen = false"
    />

    <!-- Setup / saúde do git (mostrado quando getHealthGit().ok === false) -->
    <SetupWizard
      v-if="setupOpen"
      :health="gitHealth"
      @revalidated="onGitRevalidated"
      @dismiss="setupOpen = false"
    />

    <!-- Confirmação de exclusão -->
    <div v-if="deleteTarget" class="fixed inset-0 z-40 grid place-items-center bg-black/50" @click.self="deleteTarget = null">
      <div class="w-[380px] rounded-lg border border-ink-500 bg-ink-800 p-5 shadow-xl">
        <div class="text-sm font-medium">Excluir tarefa</div>
        <div class="mt-2 text-[13px] text-muted">
          Excluir <strong class="text-txt">{{ deleteTarget.titulo }}</strong>? Não dá pra desfazer.
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button class="rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-ink-700" :disabled="deleting" @click="deleteTarget = null">Cancelar</button>
          <button class="rounded-md bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50" :disabled="deleting" @click="doDelete">
            {{ deleting ? 'Excluindo…' : 'Excluir' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <transition name="toast">
      <div
        v-if="toast.show"
        class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md border px-4 py-2 text-[13px] shadow-lg"
        :class="toast.type === 'error' ? 'border-red-500/50 bg-red-500/15 text-red-200' : 'border-ink-500 bg-ink-700 text-txt'"
      >
        {{ toast.text }}
      </div>
    </transition>
  </div>
</template>

<script>
import Board from './components/Board.vue';
import TableView from './components/TableView.vue';
import TaskPeek from './components/TaskPeek.vue';
import Settings from './components/Settings.vue';
import SetupWizard from './components/SetupWizard.vue';
import Dropdown from './components/Dropdown.vue';
import { getConfig, listTasks, deleteTask, getHealthGit, syncPull } from './api';

const COLOR_KEY = 'basalt.colorColumns';

export default {
  name: 'App',
  components: { Board, TableView, TaskPeek, Settings, SetupWizard, Dropdown },
  data() {
    return {
      config: null,
      tasks: [],
      filters: {},
      loading: false,
      loadError: '',
      view: 'kanban',
      sort: { by: 'prioridade_gute', dir: 'desc' },
      colorColumns: this.loadColorColumns(),
      settingsOpen: false,
      peekOpen: false,
      editingTask: null,
      deleteTarget: null,
      deleting: false,
      syncing: false,
      gitHealth: null,
      setupOpen: false,
      toast: { show: false, text: '', type: 'success', timer: null },
    };
  },
  computed: {
    properties() {
      return (this.config && this.config.schema && this.config.schema.properties) || {};
    },
    derivedNames() {
      return (this.config && this.config.schema && this.config.schema.derived) || [];
    },
    filterNames() {
      return (this.config && this.config.board && this.config.board.filters) || [];
    },
    filterFields() {
      return this.filterNames.map((name) => {
        const prop = this.properties[name] || {};
        let options = prop.options;
        if (!options || !options.length) {
          const seen = new Set();
          this.tasks.forEach((t) => {
            const v = t[name];
            if (v !== null && v !== undefined && v !== '') seen.add(v);
          });
          options = [...seen].sort();
        }
        return { name, label: prop.label || name, options };
      });
    },
    // Props ordenáveis: propriedades + prioridade_gute + GUT (derivados úteis).
    sortFields() {
      const out = Object.keys(this.properties).map((key) => ({
        value: key,
        label: this.properties[key].label || key,
      }));
      ['prioridade_gute', 'GUT'].forEach((d) => {
        if (!out.some((o) => o.value === d)) {
          const lbl = (this.properties[d] && this.properties[d].label) || (d === 'GUT' ? 'GUT' : 'Prioridade GUTE');
          out.push({ value: d, label: lbl });
        }
      });
      return out;
    },
    filteredTasks() {
      const active = Object.keys(this.filters).filter((k) => {
        const v = this.filters[k];
        return v !== null && v !== undefined && v !== '';
      });
      if (!active.length) return this.tasks;
      return this.tasks.filter((t) => active.every((k) => t[k] === this.filters[k]));
    },
  },
  created() {
    this.bootstrap();
  },
  methods: {
    loadColorColumns() {
      try { return localStorage.getItem(COLOR_KEY) === '1'; } catch (e) { return false; }
    },
    toggleColorColumns() {
      this.colorColumns = !this.colorColumns;
      try { localStorage.setItem(COLOR_KEY, this.colorColumns ? '1' : '0'); } catch (e) { /* ignore */ }
    },
    setFilter(name, value) {
      this.$set(this.filters, name, value == null ? null : value);
    },
    setSortBy(by) {
      if (!by) return;
      this.sort = { ...this.sort, by };
    },
    toggleSortDir() {
      this.sort = { ...this.sort, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' };
    },
    async bootstrap() {
      this.loading = true;
      this.loadError = '';
      try {
        const [cfg, tasks] = await Promise.all([getConfig(), listTasks()]);
        this.config = cfg || { schema: {}, board: {}, gute: {} };
        this.tasks = Array.isArray(tasks) ? tasks : [];
        const f = {};
        this.filterNames.forEach((name) => { f[name] = null; });
        this.filters = f;
        const s = this.config.board && this.config.board.sort;
        if (s && s.by) this.sort = { by: s.by, dir: s.dir || 'desc' };
      } catch (e) {
        this.loadError = e.message || 'Erro desconhecido.';
      } finally {
        this.loading = false;
      }
      // checagem de saúde do git (não bloqueia o board)
      this.checkGitHealth();
    },
    async checkGitHealth() {
      try {
        const h = await getHealthGit();
        this.gitHealth = h;
        this.setupOpen = !!(h && h.ok === false);
      } catch (e) {
        // health indisponível: não trava a app, só não abre o wizard
        this.gitHealth = null;
      }
    },
    onGitRevalidated(h) {
      this.gitHealth = h;
      if (h && h.ok) {
        this.setupOpen = false;
        this.notify('Git configurado com sucesso.');
      }
      // se ainda não ok, mantém o wizard aberto com os checks atualizados
    },
    async doSync() {
      if (this.syncing) return;
      this.syncing = true;
      try {
        const res = await syncPull();
        if (res && res.ok) {
          this.notify(res.message || 'Sincronizado.');
          await this.reload();
        } else {
          this.notify((res && (res.error || res.message)) || 'Falha ao sincronizar.', 'error');
        }
      } catch (e) {
        this.notify(e.message || 'Falha ao sincronizar.', 'error');
      } finally {
        this.syncing = false;
      }
    },
    async reload() {
      if (!this.config) return this.bootstrap();
      this.loading = true;
      try {
        const tasks = await listTasks();
        this.tasks = Array.isArray(tasks) ? tasks : [];
      } catch (e) {
        this.notify(e.message, 'error');
      } finally {
        this.loading = false;
      }
    },
    openCreate() {
      this.editingTask = null;
      this.peekOpen = true;
    },
    openEdit(task) {
      this.editingTask = task;
      this.peekOpen = true;
    },
    onSaved(saved) {
      this.peekOpen = false;
      this.notify('Tarefa salva.');
      if (saved && saved.warning) this.notify(saved.warning, 'error');
      this.reload();
    },
    onMoved(payload) {
      if (payload && payload.warning) this.notify(payload.warning, 'error');
      this.reload();
    },
    async onConfigSaved() {
      // Re-bootstrap: recarrega config + tasks (a edição pode ter migrado tarefas).
      await this.bootstrap();
      this.settingsOpen = false;
      this.notify('Configuração salva.');
    },
    confirmDelete(task) {
      this.deleteTarget = task;
    },
    async doDelete() {
      if (!this.deleteTarget) return;
      this.deleting = true;
      try {
        const res = await deleteTask(this.deleteTarget.id);
        this.tasks = this.tasks.filter((t) => t.id !== this.deleteTarget.id);
        this.notify('Tarefa excluída.');
        if (res && res.warning) this.notify(res.warning, 'error');
        this.deleteTarget = null;
        this.peekOpen = false;
      } catch (e) {
        this.notify(e.message, 'error');
      } finally {
        this.deleting = false;
      }
    },
    notify(text, type = 'success') {
      clearTimeout(this.toast.timer);
      this.toast = { show: true, text, type, timer: null };
      this.toast.timer = setTimeout(() => { this.toast.show = false; }, 3200);
    },
  },
};
</script>

<style>
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter, .toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }
</style>
