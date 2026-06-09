<template>
  <div class="flex h-screen flex-col bg-ink-900 text-txt font-sans">
    <!-- Barra de título custom: logo + abas (vaults) + controles de janela -->
    <TitleBar
      :vaults="vaults"
      :active-path="activeVault"
      :configuring="configuring"
      @switch="switchToVault"
      @add="startAddVault"
      @remove="removeVaultTab"
    />

    <!-- Toolbar (filtros/view/ações) — só com vault ativo e fora da configuração -->
    <header v-if="config && !loadError && !configuring" class="flex h-12 flex-shrink-0 items-center gap-3 border-b border-ink-500 bg-ink-850 px-4">
      <span class="font-mono text-[11px] text-faint" title="Versão do Basalt">v{{ version }}</span>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <!-- Sincronizar (git pull) -->
        <button class="icon-btn h-8 w-8" title="Sincronizar (git pull)" :disabled="syncing" @click="doSync">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4" :class="{ 'animate-spin': syncing }">
            <path d="M4 7a6 6 0 0 1 10.5-2.5M16 13a6 6 0 0 1-10.5 2.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M14.5 4.5V2.5h2M5.5 15.5v2h-2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <!-- Notificações (sino + painel) -->
        <div class="relative z-50">
          <button class="icon-btn relative h-8 w-8" title="Notificações" @click="toggleNotif">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><path d="M6 8a4 4 0 0 1 8 0c0 4 1.5 5 1.5 5h-11S6 12 6 8Z" stroke-linecap="round" stroke-linejoin="round" /><path d="M8.5 16a1.5 1.5 0 0 0 3 0" stroke-linecap="round" /></svg>
            <span v-if="notifications.length" class="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">{{ notifications.length > 9 ? '9+' : notifications.length }}</span>
          </button>
          <template v-if="notifOpen">
            <div class="fixed inset-0 z-40" @click="notifOpen = false"></div>
            <div class="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-xl border border-ink-500 bg-ink-850 shadow-2xl">
              <div class="flex items-center justify-between border-b border-ink-500 px-3 py-2">
                <span class="text-[13px] font-medium">Notificações</span>
                <button v-if="notifications.length" class="text-[12px] text-faint hover:text-muted" @click="clearAllNotif">Limpar tudo</button>
              </div>
              <div class="max-h-96 overflow-y-auto">
                <div v-if="!notifications.length" class="px-3 py-6 text-center text-[12px] text-faint">Nada por aqui.</div>
                <div
                  v-for="n in notifications"
                  :key="n.id"
                  class="group/n flex cursor-pointer items-start gap-2 border-b border-ink-500/40 px-3 py-2 transition-colors hover:bg-ink-700"
                  @click="openNotif(n)"
                >
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-[13px] text-txt">{{ n.title }}</div>
                    <div class="truncate text-[12px] text-muted">{{ n.summary }}</div>
                    <div class="mt-0.5 text-[11px] text-faint">por {{ n.author }}</div>
                  </div>
                  <button class="icon-btn h-6 w-6 flex-shrink-0 opacity-0 group-hover/n:opacity-100" title="Dispensar" @click.stop="clearOneNotif(n.id)">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>

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
      <!-- Configuração do vault (wizard como conteúdo da aba ativa) -->
      <SetupWizard
        v-if="configuring"
        embedded
        :add-mode="addingVault"
        :health="gitHealth"
        :vault="vaultStatus"
        @vault-set="onVaultSet"
        @revalidated="onSetupRevalidated"
        @registered="onRegistered"
        @dismiss="onWizardDismiss"
      />

      <template v-else>
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
          @config-saved="onConfigSaved"
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
      </template>
    </main>

    <!-- Peek lateral (criar/editar) — auto-save, sem botões -->
    <TaskPeek
      v-if="config"
      :open="peekOpen"
      :config="config"
      :task="editingTask"
      :users="users"
      @saved="onSaved"
      @autosaved="onAutosaved"
      @created="onCreated"
      @synced="onSynced"
      @config-changed="onConfigChanged"
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
import { computed } from 'vue';
import Board from './components/Board.vue';
import TableView from './components/TableView.vue';
import TaskPeek from './components/TaskPeek.vue';
import Settings from './components/Settings.vue';
import SetupWizard from './components/SetupWizard.vue';
import Dropdown from './components/Dropdown.vue';
import TitleBar from './components/TitleBar.vue';
import { getConfig, listTasks, deleteTask, getHealthGit, syncPull, listVaults, switchVault, removeVault, getUsers, getNotifications, clearNotifications } from './api';

const COLOR_KEY = 'basalt.colorColumns';
const AUTO_PULL_MS = 60000; // auto-pull periódico p/ trazer mudanças + notificações

export default {
  name: 'App',
  components: { Board, TableView, TaskPeek, Settings, SetupWizard, Dropdown, TitleBar },
  // disponibiliza o roster (reativo) para componentes filhos (ex.: TaskCard resolve user id → nome)
  provide() {
    return { basaltUsers: computed(() => this.users) };
  },
  data() {
    return {
      version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '',
      config: null,
      tasks: [],
      filters: {},
      loading: false,
      loadError: '',
      view: 'kanban',
      // default genérico; o board.sort do vault sobrescreve em loadActive()
      sort: { by: 'created_at', dir: 'desc' },
      colorColumns: this.loadColorColumns(),
      settingsOpen: false,
      peekOpen: false,
      editingTask: null,
      deleteTarget: null,
      deleting: false,
      syncing: false,
      gitHealth: null,
      vaultStatus: null,
      vaults: [],          // vaults configurados (abas)
      activeVault: '',     // path do vault ativo
      configuring: false,  // true = mostrando o SetupWizard (1ª run / adicionar aba)
      addingVault: false,  // true = "+" (vault NOVO, do zero) vs 1ª run
      toast: { show: false, text: '', type: 'success', timer: null },
      users: [],           // roster do time (config/users.json)
      notifications: [],   // notificações locais do vault ativo
      notifOpen: false,    // painel de notificações aberto?
      pullTimer: null,     // intervalo do auto-pull
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
    // Ordenável por qualquer propriedade do schema (genérico — sem chaves fixas;
    // props type 'formula' já estão em properties, então também entram aqui).
    sortFields() {
      return Object.keys(this.properties).map((key) => ({
        value: key,
        label: this.properties[key].label || key,
      }));
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
  async created() {
    await this.bootstrap();
    // Avisa o Electron que o app está pronto → fecha a splash de carregamento.
    try { if (window.electron && window.electron.signalReady) window.electron.signalReady(); } catch (e) { /* noop */ }
  },
  methods: {
    loadColorColumns() {
      // default ATIVO: só fica off se o usuário tiver desligado explicitamente ('0').
      try { const v = localStorage.getItem(COLOR_KEY); return v === null ? true : v === '1'; } catch (e) { return true; }
    },
    toggleColorColumns() {
      this.colorColumns = !this.colorColumns;
      try { localStorage.setItem(COLOR_KEY, this.colorColumns ? '1' : '0'); } catch (e) { /* ignore */ }
    },
    setFilter(name, value) {
      this.filters[name] = value == null ? null : value;
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
      await this.loadVaults();
      // Primeira run: nenhum vault configurado → wizard (1ª aba = configuração).
      if (!this.vaults.length) {
        this.configuring = true;
        this.loading = false;
        this.checkGitHealth();
        return;
      }
      this.configuring = false;
      await this.loadActive();
      this.loading = false;
      this.checkGitHealth();
    },
    // Lista os vaults (abas) + define o ativo.
    async loadVaults() {
      try {
        const r = await listVaults();
        this.vaults = (r && r.vaults) || [];
        this.activeVault = (r && r.active) || '';
        const act = this.vaults.find((v) => v.path === this.activeVault);
        if (act) this.vaultStatus = act;
      } catch (e) {
        this.vaults = [];
        this.activeVault = '';
      }
    },
    // Carrega config + tarefas do vault ativo.
    async loadActive() {
      try {
        const [cfg, tasks] = await Promise.all([getConfig(), listTasks()]);
        this.config = cfg || { schema: {}, board: {}, gute: {} };
        this.tasks = Array.isArray(tasks) ? tasks : [];
        const f = {};
        this.filterNames.forEach((name) => { f[name] = null; });
        this.filters = f;
        const s = this.config.board && this.config.board.sort;
        if (s && s.by) this.sort = { by: s.by, dir: s.dir || 'desc' };
        // roster + notificações (best-effort — não bloqueiam o board)
        try { this.users = (await getUsers()) || []; } catch (e) { this.users = []; }
        try { this.notifications = (await getNotifications()) || []; } catch (e) { this.notifications = []; }
        this.startAutoPull();
      } catch (e) {
        this.loadError = e.message || 'Erro desconhecido.';
      }
    },
    // Troca a aba ativa (vault).
    async switchToVault(path) {
      if (!path) return;
      if (!this.configuring && path === this.activeVault) return;
      this.loading = true;
      try {
        await switchVault(path);
        this.configuring = false;
        this.addingVault = false;
        await this.loadVaults();
        await this.loadActive();
        this.checkGitHealth();
      } catch (e) {
        this.notify(e.message || 'Falha ao trocar de vault.', 'error');
      } finally {
        this.loading = false;
      }
    },
    // "+" — abre o wizard pra configurar um vault NOVO, do zero (nova aba).
    startAddVault() {
      this.addingVault = true;
      this.configuring = true;
    },
    // Remove uma aba (NÃO apaga a pasta do vault).
    async removeVaultTab(path) {
      try {
        const r = await removeVault(path);
        this.vaults = (r && r.vaults) || [];
        this.activeVault = (r && r.active) || '';
        if (!this.vaults.length) {
          this.configuring = true;
          this.addingVault = false;
          this.config = null;
        } else {
          this.configuring = false;
          await this.loadActive();
        }
        this.notify('Aba removida.');
      } catch (e) {
        this.notify(e.message || 'Falha ao remover a aba.', 'error');
      }
    },
    async checkGitHealth() {
      try {
        this.gitHealth = await getHealthGit();
      } catch (e) {
        this.gitHealth = null;
      }
    },
    // O wizard definiu/semeou um vault: atualiza as abas + carrega o board atrás.
    async onVaultSet() {
      await this.loadVaults();
      await this.loadActive();
      this.notify('Vault definido.');
    },
    // Usuário se cadastrou/atualizou no wizard → atualiza o roster em memória.
    onRegistered(r) {
      if (r && Array.isArray(r.users)) this.users = r.users;
    },
    // Revalidação do wizard: recebe { health, vault } atualizados.
    onSetupRevalidated(payload) {
      const h = payload && payload.health;
      const v = payload && payload.vault;
      if (v) this.vaultStatus = v;
      if (h) this.gitHealth = h;
    },
    // Fecha o wizard ("Ir pro board" / "Pular") → mostra o board do vault ativo.
    async onWizardDismiss() {
      this.configuring = false;
      this.addingVault = false;
      if (!this.config) {
        this.loading = true;
        await this.loadVaults();
        await this.loadActive();
        this.loading = false;
      }
    },
    async doSync() {
      if (this.syncing) return;
      this.syncing = true;
      try {
        const res = await syncPull();
        if (res && res.ok) {
          this.notify(res.message || 'Sincronizado.');
          this.applyPull(res);
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
    // Aplica o resultado do pull: atualiza notificações + avisa se vieram novas.
    applyPull(res) {
      if (!res) return;
      if (Array.isArray(res.notifications)) this.notifications = res.notifications;
      const fresh = (res.newNotifications || []).length;
      if (fresh) this.notify(`${fresh} ${fresh === 1 ? 'nova notificação' : 'novas notificações'}`);
    },
    // ── auto-pull periódico (traz mudanças de outros + dispara notificações) ──
    startAutoPull() {
      this.stopAutoPull();
      this.pullTimer = setInterval(() => { this.silentPull(); }, AUTO_PULL_MS);
    },
    stopAutoPull() {
      if (this.pullTimer) { clearInterval(this.pullTimer); this.pullTimer = null; }
    },
    async silentPull() {
      if (this.syncing || !this.config) return;
      try {
        const res = await syncPull();
        if (res && res.ok) {
          this.applyPull(res);
          const tasks = await listTasks();
          this.tasks = Array.isArray(tasks) ? tasks : [];
        }
      } catch (e) { /* silencioso */ }
    },
    // ── eventos do TaskPeek (auto-save / auto-create) ──
    async onAutosaved(saved) {
      if (saved && saved.warning) this.notify(saved.warning, 'error');
      await this.reload(); // atualiza o board, mantém o dialog aberto
    },
    async onCreated(saved) {
      if (saved && saved.warning) this.notify(saved.warning, 'error');
      await this.reload();
    },
    async onSynced(res) {
      this.applyPull(res);
      await this.reload();
    },
    // kebab da propriedade alterou o schema (label/tipo/oculto): recarrega config + tarefas
    async onConfigChanged() {
      await this.loadActive();
    },
    // ── notificações (UI) ──
    toggleNotif() { this.notifOpen = !this.notifOpen; },
    openNotif(n) {
      this.notifOpen = false;
      const t = this.tasks.find((x) => x.id === (n && n.taskId));
      if (t) this.openEdit(t);
      else this.notify('Tarefa não encontrada (pode ter sido removida).', 'error');
    },
    async clearOneNotif(id) {
      try { this.notifications = (await clearNotifications(id)) || []; } catch (e) { /* noop */ }
    },
    async clearAllNotif() {
      try { this.notifications = (await clearNotifications()) || []; this.notifOpen = false; } catch (e) { /* noop */ }
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
  beforeUnmount() {
    this.stopAutoPull();
  },
};
</script>

<style>
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }
</style>
