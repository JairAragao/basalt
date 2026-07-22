<template>
  <div class="flex h-screen flex-col bg-ink-900 text-txt font-sans">
    <TitleBar
      :vaults="vaults"
      :active-path="activeVault"
      :configuring="configuring"
      @switch="switchToVault"
      @add="startAddVault"
      @remove="removeVaultTab"
    />

    <!-- corpo: sidebar (rail à esquerda) + coluna de conteúdo. A sidebar some
         durante o setup do vault (SetupWizard ocupa a área toda). -->
    <div class="flex min-h-0 flex-1">
    <Sidebar
      v-if="config && !configuring"
      :active="activeView"
      :view="view"
      :version="version"
      :update-pending="['available', 'downloading', 'downloaded'].includes(update.state)"
      @navigate="setActiveView"
      @set-view="setView"
      @open-settings="openSettings('status')"
      @open-update="openUpdate"
    />

    <div class="flex min-w-0 flex-1 flex-col">
    <!-- Toolbar (filtros/view/ações) — só com vault ativo e fora da configuração -->
    <header v-if="config && !loadError && !configuring" class="flex h-12 flex-shrink-0 items-center gap-3 border-b border-ink-500 bg-ink-850 px-4">
      <div class="flex-1"></div>

      <template v-if="config && !loadError">
        <template v-if="activeView === 'tasks'">
        <!-- Filtros (board.filters) tipados pelo tipo da prop -->
        <template v-for="f in filterFields" :key="f.name">
          <!-- texto livre (contains, debounce 200ms, X limpa) -->
          <div v-if="f.type === 'string'" class="relative w-44">
            <input
              class="field h-8 !py-1 !pr-7 text-[13px]"
              :placeholder="f.label"
              :value="filterDrafts[f.name] || ''"
              @input="(e) => setStringFilter(f.name, e.target.value)"
            />
            <button
              v-if="filterDrafts[f.name]"
              type="button"
              class="absolute right-1.5 top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center text-faint transition-colors hover:text-txt"
              aria-label="Limpar"
              @click="clearStringFilter(f.name)"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
            </button>
          </div>

          <!-- número (igualdade exata; vazio = sem filtro) -->
          <input
            v-else-if="f.type === 'int'"
            type="number"
            class="field h-8 !w-28 !py-1 text-[13px]"
            :placeholder="f.label"
            :value="filters[f.name] ? filters[f.name].n : ''"
            @input="(e) => setIntFilter(f.name, e.target.value)"
          />

          <!-- data (range inclusivo por dia local) — calendário único estilizado -->
          <DateRangePicker
            v-else-if="f.type === 'datetime'"
            class="w-60"
            :from="filters[f.name] ? filters[f.name].from : ''"
            :to="filters[f.name] ? filters[f.name].to : ''"
            @change="(r) => setDateRange(f.name, r)"
          />

          <!-- enum/multiselect/user/demais: select (X de limpar no trigger) -->
          <Dropdown
            v-else
            :value="filters[f.name] ? filters[f.name].v : null"
            :options="f.options"
            :placeholder="f.label + ': todos'"
            clearable
            :search-threshold="4"
            class="w-44"
            @input="(v) => setFilter(f.name, v)"
          />
        </template>

        <span class="mx-0.5 h-5 w-px bg-ink-500"></span>

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

        <span class="mx-0.5 h-5 w-px bg-ink-500"></span>

        <!-- Colorir colunas (só no kanban; troca de view fica na sidebar) -->
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
        </template>

        <!-- Sincronizar (git pull) — âmbar quando o último pull falhou -->
        <button
          class="icon-btn h-8 w-8"
          :class="pullError ? '!text-amber-300' : ''"
          :title="pullError ? pullErrorLabel : 'Sincronizar (git pull)'"
          :disabled="syncing"
          @click="doSync"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4" :class="{ 'animate-spin': syncing }">
            <path d="M4 7a6 6 0 0 1 10.5-2.5M16 13a6 6 0 0 1-10.5 2.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M14.5 4.5V2.5h2M5.5 15.5v2h-2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <div class="relative z-50">
          <button class="icon-btn relative h-8 w-8" title="Notificações" @click="toggleNotif">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><path d="M6 8a4 4 0 0 1 8 0c0 4 1.5 5 1.5 5h-11S6 12 6 8Z" stroke-linecap="round" stroke-linejoin="round" /><path d="M8.5 16a1.5 1.5 0 0 0 3 0" stroke-linecap="round" /></svg>
            <span v-if="notifications.length" class="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-ink-900">{{ notifications.length > 9 ? '9+' : notifications.length }}</span>
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
                  <button class="icon-btn h-6 w-6 flex-shrink-0 opacity-50 transition-opacity hover:!opacity-100 group-hover/n:opacity-80" title="Dispensar" @click.stop="clearOneNotif(n.id)">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>

        <button class="icon-btn h-8 w-8" title="Recarregar" :disabled="loading" @click="reload">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4" :class="{ 'animate-spin': loading }">
            <path d="M16 10a6 6 0 1 1-1.8-4.3" stroke-linecap="round" />
            <path d="M15 3v3h-3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <button
          v-if="activeView === 'tasks'"
          class="flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3 text-[13px] font-medium text-ink-900 hover:brightness-110 disabled:opacity-40"
          @click="openCreate"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4"><path d="M10 4v12M4 10h12" stroke-linecap="round" /></svg>
          Nova tarefa
        </button>
      </template>
    </header>

    <!-- Banner: filtros locais divergem dos compartilhados (estilo Notion) -->
    <div
      v-if="config && !loadError && !configuring && activeView === 'tasks' && filtersDiverged"
      class="flex flex-shrink-0 items-center gap-2 border-b border-accent/30 bg-accent/10 px-4 py-1.5 text-[12px] text-muted"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 flex-shrink-0 text-accent"><path d="M4 6h12M6 10h8M8 14h4" stroke-linecap="round" /></svg>
      <span class="min-w-0 flex-1 truncate">Seus filtros da barra são só neste computador.</span>
      <button
        class="flex-shrink-0 rounded px-2 py-0.5 text-faint transition-colors hover:text-txt"
        @click="revertLocalFilters"
      >Reverter</button>
      <button
        class="flex-shrink-0 rounded-md bg-accent px-2.5 py-0.5 font-medium text-ink-900 transition hover:brightness-110 disabled:opacity-50"
        :disabled="committingFilters"
        @click="commitFiltersForAll"
      >{{ committingFilters ? 'Salvando…' : 'Salvar pra todos' }}</button>
    </div>

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

      <TasksView
        v-else-if="config && activeView === 'tasks'"
        :tasks="filteredTasks"
        :config="config"
        :view="view"
        :color-columns="colorColumns"
        :sort="sort"
        :filter-key="filterKey"
        @open="openEdit"
        @delete="confirmDelete"
        @moved="onMoved"
        @config-saved="onConfigSaved"
        @error="(m) => notify(m, 'error')"
        @sort="(s) => (sort = s)"
      />
      <!-- dashboard recebe as tarefas SEM os filtros do toolbar (tem período próprio) -->
      <DashboardView
        v-else-if="config && activeView === 'dashboard'"
        :config="config"
        :tasks="tasks"
        :users="users"
        :vault-path="activeVault"
        @open-settings="openSettings('status')"
      />
      <!-- extensões (plugins puxados do GitHub) -->
      <ExtensionsView
        v-else-if="config && activeView === 'extensions'"
        @error="(m) => notify(m, 'error')"
        @notify="(m) => notify(m)"
      />
      </template>
    </main>
    </div>
    </div>

    <!-- Peek lateral (criar/editar) — auto-save, sem botões -->
    <TaskPeek
      v-if="config"
      :open="peekOpen"
      :config="config"
      :task="editingTask"
      :users="users"
      :open-history-hash="peekHistoryHash"
      @saved="onSaved"
      @autosaved="onAutosaved"
      @created="onCreated"
      @synced="onSynced"
      @config-changed="onConfigChanged"
      @delete="confirmDelete"
      @close="closePeek"
    />

    <Settings
      v-if="settingsOpen && config"
      :config="config"
      :last-pull-at="lastPullAt"
      :initial-tab="settingsInitialTab"
      :version="version"
      :current-filters="filterNames"
      :tasks="tasks"
      @saved="onConfigSaved"
      @apply-local-filters="applyLocalFilters"
      @open-task="openTaskAtCommit"
      @close="settingsOpen = false"
    />

    <!-- Estratégia "Perguntar" + divergência no pull → modal -->
    <div v-if="askDiverged" class="fixed inset-0 z-40 grid place-items-center bg-black/50">
      <div class="w-[440px] rounded-lg border border-ink-500 bg-ink-800 p-5 shadow-xl">
        <div class="text-sm font-medium">Vault divergente do remoto</div>
        <div class="mt-2 text-[13px] leading-relaxed text-muted">
          O remoto tem mudanças que conflitam com as locais.
          <strong class="text-txt">Rebase agora</strong> aplica o remoto e reaplica suas mudanças
          por cima (avisa se não der). Ou deixe como está e resolva depois.
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button class="rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-ink-700" :disabled="syncing" @click="askDiverged = false">Deixar como está</button>
          <button class="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-ink-900 hover:brightness-110 disabled:opacity-50" :disabled="syncing" @click="rebaseNow">Rebase agora</button>
        </div>
      </div>
    </div>

    <div v-if="deleteTarget" class="fixed inset-0 z-40 grid place-items-center bg-black/50" @mousedown.self="deleteTarget = null">
      <div class="w-[380px] rounded-lg border border-ink-500 bg-ink-800 p-5 shadow-xl">
        <div class="text-sm font-medium">Excluir tarefa</div>
        <div class="mt-2 text-[13px] text-muted">
          Excluir <strong class="text-txt">{{ deleteTargetTitle }}</strong>? Não dá pra desfazer.
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button class="rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-ink-700" :disabled="deleting" @click="deleteTarget = null">Cancelar</button>
          <button class="rounded-md bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50" :disabled="deleting" @click="doDelete">
            {{ deleting ? 'Excluindo…' : 'Excluir' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de atualização (estilizado, tema do app). Só quando PRONTA e não adiada. -->
    <transition name="toast">
      <div v-if="update.showModal && update.state === 'downloaded'" class="fixed inset-0 z-50 grid place-items-center bg-black/50" @mousedown.self="snoozeUpdate">
        <div class="w-[440px] max-w-[92vw] overflow-hidden rounded-xl border border-ink-500 bg-ink-800 shadow-2xl">
          <div class="flex items-center gap-3 border-b border-ink-500 bg-ink-850 px-5 py-4">
            <span class="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-5 w-5"><path d="M10 3v9M6 8l4 4 4-4M4 16h12" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </span>
            <div class="min-w-0">
              <div class="text-[14px] font-semibold text-txt">Atualização disponível</div>
              <div class="text-[12px] text-muted">Basalt {{ update.version }} está pronto para instalar.</div>
            </div>
          </div>
          <div class="px-5 py-4 text-[13px] leading-relaxed text-muted">
            Uma nova versão foi baixada. Você pode reiniciar agora para aplicar, ou continuar e ela
            se instala ao fechar o app. <button class="text-accent hover:underline" @click="openSettings('updates'); snoozeUpdate()">Ver novidades</button>.
          </div>
          <div class="flex items-center justify-end gap-2 border-t border-ink-500 px-5 py-3">
            <button class="rounded-md px-3.5 py-1.5 text-[13px] text-muted hover:bg-ink-700" @click="snoozeUpdate">Depois</button>
            <button class="rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-ink-900 hover:brightness-110" @click="installUpdate">Reiniciar agora</button>
          </div>
        </div>
      </div>
    </transition>

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
import { computed, defineAsyncComponent } from 'vue';
import TasksView from './views/TasksView.vue';
import TaskPeek from './components/TaskPeek.vue';
import Settings from './components/Settings.vue';
import SetupWizard from './components/SetupWizard.vue';
import Dropdown from './components/Dropdown.vue';
import DateRangePicker from './components/DateRangePicker.vue';
import TitleBar from './components/TitleBar.vue';
import Sidebar from './components/Sidebar.vue';
import { getConfig, listTasks, deleteTask, getHealthGit, syncPull, listVaults, switchVault, removeVault, getUsers, getNotifications, clearNotifications, saveFilters } from './api';
import { matchesTask } from './filtering';
import { colorFor } from './palette';

// Lazy: dashboard (uPlot) fora do bundle inicial — só carrega ao abrir a view
// (mesmo padrão do BodyEditor no TaskPeek).
const DashboardView = defineAsyncComponent(() => import('./views/DashboardView.vue'));
const ExtensionsView = defineAsyncComponent(() => import('./views/ExtensionsView.vue'));

const COLOR_KEY = 'basalt.colorColumns';
const tasksViewKey = 'basalt.tasksView'; // 'kanban' | 'table' — visualização das tarefas
const viewKey = 'basalt.viewByVault'; // { "<vaultPath exato da API /vaults>": 'tasks'|'dashboard' }
const pullIntervalKey = 'basalt.pullIntervalMs'; // '0'|'30000'|'60000'|'300000'|'900000'
const pullStrategyKey = 'basalt.pullStrategy'; // 'rebase' (default) | 'safe' | 'ask'
// Override LOCAL (por máquina) da lista de filtros da topbar: { "<vaultPath>": string[] }.
// null/ausente = usa a lista compartilhada (board.filters, versionada). Divergência
// dispara o banner "salvar pra todos" (commit via saveFilters).
const filtersByVaultKey = 'basalt.filtersByVault';

// rótulos pt-BR dos reasons de falha do POST /sync/pull
const PULL_REASON_LABELS = {
  diverged: 'Sync: o vault local e o remoto divergiram.',
  'no-remote': 'Sync: sem remote configurado — auto-pull pausado.',
  auth: 'Sync: falha de autenticação com o remote.',
  timeout: 'Sync: o remote demorou a responder.',
  other: 'Sync: falha ao sincronizar.',
};

export default {
  name: 'App',
  components: { TasksView, DashboardView, ExtensionsView, TaskPeek, Settings, SetupWizard, Dropdown, DateRangePicker, TitleBar, Sidebar },
  // disponibiliza roster + tarefas (reativos) para componentes filhos
  // (TaskCard resolve user id → nome; OptionMenu conta uso de opção)
  provide() {
    return {
      basaltUsers: computed(() => this.users),
      basaltTasks: computed(() => this.tasks),
    };
  },
  data() {
    return {
      version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '',
      config: null,
      tasks: [],
      filters: {}, // { [prop]: F|null } — F tipado por prop.type (ver filtering.js)
      filterDrafts: {}, // texto cru dos filtros string (o commit em filters tem debounce)
      localFilters: null, // override local da lista de filtros (null = usa a compartilhada)
      committingFilters: false, // "salvar pra todos" em voo
      loading: false,
      loadError: '',
      view: this.loadView(), // 'kanban' | 'table' (persistido em basalt.tasksView)
      activeView: 'tasks', // 'tasks' | 'dashboard' — restaurado por vault (viewKey)
      // default genérico; o board.sort do vault sobrescreve em loadActive()
      sort: { by: 'created_at', dir: 'desc' },
      colorColumns: this.loadColorColumns(),
      settingsOpen: false,
      peekOpen: false,
      editingTask: null,
      peekHistoryHash: '', // abrir o peek já com o histórico no diff deste commit (vem do histórico global)
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
      lastPullAt: null,    // timestamp do último pull OK (mostrado na aba Sync)
      pullError: null,     // reason do último pull falho (âmbar no botão) ou null
      askDiverged: false,  // modal da estratégia 'ask' em divergência
      settingsInitialTab: 'status', // aba ao abrir Configurações
      // auto-update (Electron): state = idle|checking|available|downloading|downloaded|uptodate|error
      update: { state: 'idle', version: '', percent: 0, snoozed: false, showModal: false },
    };
  },
  computed: {
    properties() {
      return (this.config && this.config.schema && this.config.schema.properties) || {};
    },
    derivedNames() {
      return (this.config && this.config.schema && this.config.schema.derived) || [];
    },
    // lista compartilhada (versionada em board.filters)
    sharedFilterNames() {
      return (this.config && this.config.board && this.config.board.filters) || [];
    },
    // lista efetiva: override local (por máquina) tem precedência sobre a compartilhada
    filterNames() {
      return this.localFilters != null ? this.localFilters : this.sharedFilterNames;
    },
    // banner "salvar pra todos": só quando o local existe E difere do compartilhado
    filtersDiverged() {
      if (this.localFilters == null) return false;
      const a = this.localFilters;
      const b = this.sharedFilterNames;
      if (a.length !== b.length) return true;
      return a.some((n, i) => n !== b[i]);
    },
    // Filtros da topbar: o widget segue o tipo da prop. Só os tipos de select
    // precisam de options (user resolve id → nome do roster).
    filterFields() {
      return this.filterNames.map((name) => {
        const prop = this.properties[name] || {};
        const type = prop.type || 'string';
        let options = [];
        if (type === 'enum' || type === 'multiselect') {
          let vals = (prop.options || []).slice();
          if (!vals.length) vals = this.distinctValues(name);
          // resolve a MESMA cor da opção (optionMeta › hash) → filtro casa com card/peek
          const meta = prop.optionMeta || {};
          options = vals.map((o) => {
            const val = (o && typeof o === 'object') ? o.value : o;
            return { value: val, label: String(val), color: colorFor(val, meta) };
          });
        } else if (type === 'user') {
          // user múltiplo guarda "id1;id2" — explode em ids individuais
          const ids = new Set();
          this.distinctValues(name).forEach((raw) => {
            String(raw).split(';').map((s) => s.trim()).filter(Boolean).forEach((id) => ids.add(id));
          });
          options = [...ids].sort().map((id) => {
            const u = this.users.find((x) => x.id === id);
            return { value: id, label: u ? (u.nome || u.id) : id };
          });
        } else if (type === 'boolean') {
          // filtro booleano: select Sim/Não (limpar = todos)
          options = [{ value: true, label: 'Sim' }, { value: false, label: 'Não' }];
        } else if (type !== 'string' && type !== 'int' && type !== 'datetime') {
          options = this.distinctValues(name); // formula etc.: valores únicos
        }
        return { name, label: prop.label || name, type, options };
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
    // título da tarefa alvo da exclusão — usa a chave-título configurável do
    // board (não hardcoda 'titulo', que pode ter sido renomeada/removida)
    deleteTargetTitle() {
      if (!this.deleteTarget) return '';
      const key = (this.config && this.config.board && this.config.board.card && this.config.board.card.title) || 'titulo';
      return this.deleteTarget[key] || this.deleteTarget.titulo || '(sem título)';
    },
    // Fonte das contagens/grupos: o que TasksView recebe já vem filtrado daqui.
    filteredTasks() {
      const schema = (this.config && this.config.schema) || {};
      return this.tasks.filter((t) => matchesTask(t, this.filters, schema));
    },
    // assinatura dos filtros ativos — muda → Board/TableView resetam as janelas
    filterKey() {
      return JSON.stringify(this.filters);
    },
    pullErrorLabel() {
      return this.pullError ? (PULL_REASON_LABELS[this.pullError] || PULL_REASON_LABELS.other) : '';
    },
  },
  watch: {
    // troca de aba (vault) restaura a view salva daquele vault (default 'tasks')
    activeVault() { this.restoreView(); },
  },
  async created() {
    this._filterTimers = {}; // debounce dos filtros string (não-reativo)
    // Settings salvou prefs de sync → re-agenda o auto-pull ao vivo
    window.addEventListener('sync-prefs-changed', this.onSyncPrefsChanged);
    await this.bootstrap();
    // Fecha a splash SÓ depois que o board (ou wizard) realmente PINTAR — senão a
    // splash saía com os dados carregados mas antes do Vue renderizar, mostrando
    // um frame "bugado" (meio pintado) antes do conteúdo. nextTick garante o
    // DOM atualizado; o duplo rAF garante que o browser já pintou esse frame.
    this.signalReadyWhenPainted();
    // Auto-update (só no Electron): escuta o status do main e aplica a política de
    // checagem (intervalo/desligado) salva. Modal só aparece quando a atualização
    // está PRONTA e o usuário não deu "Depois" nesta sessão.
    try {
      const u = window.electron && window.electron.update;
      if (u) {
        this._offUpd = u.onStatus((s) => this.onUpdateStatus(s));
        this.applyUpdatePrefs();
        window.addEventListener('update-prefs-changed', this.applyUpdatePrefs);
      }
    } catch (e) { /* noop */ }
  },
  methods: {
    // Sinaliza "pronto" ao Electron (fecha a splash) só após o board pintar.
    signalReadyWhenPainted() {
      const done = () => {
        try { if (window.electron && window.electron.signalReady) window.electron.signalReady(); } catch (e) { /* noop */ }
      };
      // se ainda estiver carregando (ex.: troca de vault em voo), espera terminar
      this.$nextTick(() => {
        requestAnimationFrame(() => requestAnimationFrame(done));
      });
    },
    loadColorColumns() {
      // default ATIVO: só fica off se o usuário tiver desligado explicitamente ('0').
      try { const v = localStorage.getItem(COLOR_KEY); return v === null ? true : v === '1'; } catch (e) { return true; }
    },
    toggleColorColumns() {
      this.colorColumns = !this.colorColumns;
      try { localStorage.setItem(COLOR_KEY, this.colorColumns ? '1' : '0'); } catch (e) { /* ignore */ }
    },
    // ── visualização das tarefas (kanban | table), na sidebar ──
    loadView() {
      try { return localStorage.getItem(tasksViewKey) === 'table' ? 'table' : 'kanban'; } catch (e) { return 'kanban'; }
    },
    setView(v) {
      this.view = v === 'table' ? 'table' : 'kanban';
      // trocar de visualização implica estar nas tarefas
      if (this.activeView !== 'tasks') this.setActiveView('tasks');
      try { localStorage.setItem(tasksViewKey, this.view); } catch (e) { /* ignore */ }
    },
    // ── view ativa (tasks | dashboard), persistida POR VAULT ──
    readViewMap() {
      try { return JSON.parse(localStorage.getItem(viewKey) || '{}') || {}; } catch (e) { return {}; }
    },
    setActiveView(v) {
      this.activeView = ['dashboard', 'extensions'].includes(v) ? v : 'tasks';
      if (!this.activeVault) return;
      try {
        const map = this.readViewMap();
        map[this.activeVault] = this.activeView; // chave = path EXATO da API /vaults
        localStorage.setItem(viewKey, JSON.stringify(map));
      } catch (e) { /* ignore */ }
    },
    restoreView() {
      const map = this.readViewMap();
      const v = map[this.activeVault];
      this.activeView = ['dashboard', 'extensions'].includes(v) ? v : 'tasks';
    },
    distinctValues(name) {
      const seen = new Set();
      this.tasks.forEach((t) => {
        const v = t[name];
        if (v !== null && v !== undefined && v !== '') seen.add(v);
      });
      return [...seen].sort();
    },
    // ── filtros tipados (estado em this.filters; shape por tipo em filtering.js) ──
    setFilter(name, value) {
      this.filters = { ...this.filters, [name]: (value == null || value === '') ? null : { v: value } };
    },
    setStringFilter(name, raw) {
      this.filterDrafts = { ...this.filterDrafts, [name]: raw };
      clearTimeout(this._filterTimers[name]);
      this._filterTimers[name] = setTimeout(() => {
        const q = String(raw || '');
        this.filters = { ...this.filters, [name]: q.trim() ? { q } : null };
      }, 200);
    },
    clearStringFilter(name) {
      clearTimeout(this._filterTimers[name]);
      this.filterDrafts = { ...this.filterDrafts, [name]: '' };
      this.filters = { ...this.filters, [name]: null };
    },
    setIntFilter(name, raw) {
      const empty = raw === '' || raw === null || raw === undefined;
      this.filters = { ...this.filters, [name]: empty ? null : { n: Number(raw) } };
    },
    // DateRangePicker emite { from, to } (YYYY-MM-DD) — vazio nos dois = sem filtro
    setDateRange(name, r) {
      const from = (r && r.from) || '';
      const to = (r && r.to) || '';
      this.filters = { ...this.filters, [name]: (from || to) ? { from, to } : null };
    },
    // ── override local da lista de filtros (por vault, em localStorage) ──
    readFiltersMap() {
      try { return JSON.parse(localStorage.getItem(filtersByVaultKey) || '{}') || {}; } catch (e) { return {}; }
    },
    writeFiltersMap(map) {
      try { localStorage.setItem(filtersByVaultKey, JSON.stringify(map)); } catch (e) { /* ignore */ }
    },
    // lê o override do vault ativo → this.localFilters (null se não houver)
    loadLocalFilters() {
      const map = this.readFiltersMap();
      const v = this.activeVault && map[this.activeVault];
      this.localFilters = Array.isArray(v) ? v.slice() : null;
    },
    // FiltersEditor aplicou uma seleção → vira override local. Se igual à
    // compartilhada, não cria override (evita banner preso).
    applyLocalFilters(list) {
      const next = Array.isArray(list) ? list.slice() : [];
      const shared = this.sharedFilterNames;
      const same = next.length === shared.length && next.every((n, i) => n === shared[i]);
      const map = this.readFiltersMap();
      if (same) {
        this.localFilters = null;
        if (this.activeVault) { delete map[this.activeVault]; this.writeFiltersMap(map); }
      } else {
        this.localFilters = next;
        if (this.activeVault) { map[this.activeVault] = next; this.writeFiltersMap(map); }
      }
      this.syncFilterState();
      this.settingsOpen = false;
    },
    // volta a usar a lista compartilhada (descarta o override local)
    revertLocalFilters() {
      const map = this.readFiltersMap();
      if (this.activeVault) { delete map[this.activeVault]; this.writeFiltersMap(map); }
      this.localFilters = null;
      this.syncFilterState();
    },
    // promove o override local a compartilhado: commita board.filters pra todos
    async commitFiltersForAll() {
      if (this.committingFilters || this.localFilters == null) return;
      this.committingFilters = true;
      try {
        const updated = await saveFilters(this.localFilters.slice());
        // sucesso → o local vira o novo compartilhado; limpa o override
        const map = this.readFiltersMap();
        if (this.activeVault) { delete map[this.activeVault]; this.writeFiltersMap(map); }
        this.localFilters = null;
        if (updated && updated.board) this.config = { ...this.config, board: updated.board };
        this.notify('Filtros salvos para todos.');
        if (updated && updated.warning) this.notify(updated.warning, 'error');
      } catch (e) {
        this.notify(e.message || 'Falha ao salvar filtros.', 'error');
      } finally {
        this.committingFilters = false;
      }
    },
    // garante que this.filters tenha chave por filtro efetivo (mantém valores,
    // descarta os removidos) — chamado quando a lista de filtros muda em runtime.
    syncFilterState() {
      const names = this.filterNames;
      const f = {};
      const drafts = {};
      names.forEach((name) => {
        f[name] = Object.prototype.hasOwnProperty.call(this.filters, name) ? this.filters[name] : null;
        if (this.filterDrafts[name] != null) drafts[name] = this.filterDrafts[name];
      });
      this.filters = f;
      this.filterDrafts = drafts;
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
        this.loadLocalFilters(); // antes de semear filters (define filterNames efetivo)
        const f = {};
        this.filterNames.forEach((name) => { f[name] = null; });
        this.filters = f;
        this.filterDrafts = {};
        const s = this.config.board && this.config.board.sort;
        this.sort = (s && s.by) ? { by: s.by, dir: s.dir || 'desc' } : { by: 'created_at', dir: 'desc' };
        this.pullError = null; // estado do vault anterior não vaza pro novo
        // roster + notificações (best-effort — não bloqueiam o board)
        try { this.users = (await getUsers()) || []; } catch (e) { this.users = []; }
        try { this.notifications = (await getNotifications()) || []; } catch (e) { this.notifications = []; }
        this.startAutoPull();
      } catch (e) {
        this.loadError = e.message || 'Erro desconhecido.';
      }
    },
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
        // remote apareceu (ou vault trocou) → retoma o auto-pull pausado por no-remote
        if (this.config && this.gitHealth && this.gitHealth.hasRemote && !this.pullTimer) this.startAutoPull();
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
    // ── preferências de sync (localStorage basalt.*) ──
    pullPrefs() {
      let interval = 60000;
      let strategy = 'rebase';
      try {
        const i = localStorage.getItem(pullIntervalKey);
        if (['0', '30000', '60000', '300000', '900000'].includes(i)) interval = Number(i);
      } catch (e) { /* default */ }
      try {
        const s = localStorage.getItem(pullStrategyKey);
        if (['rebase', 'safe', 'ask'].includes(s)) strategy = s;
      } catch (e) { /* default */ }
      return { interval, strategy };
    },
    // a API só aceita safe|rebase; 'ask' puxa em safe e pergunta na divergência
    pullStrategyForApi() {
      const { strategy } = this.pullPrefs();
      return strategy === 'ask' ? 'safe' : strategy;
    },
    onSyncPrefsChanged() {
      this.startAutoPull(); // re-agenda ao vivo com o intervalo novo
    },
    async doSync() {
      if (this.syncing) return;
      this.syncing = true;
      try {
        const res = await syncPull(this.pullStrategyForApi());
        if (this.handlePullResult(res, true)) {
          this.notify(res.message || 'Sincronizado.');
          await this.reload();
        }
      } catch (e) {
        this.notify(e.message || 'Falha ao sincronizar.', 'error');
      } finally {
        this.syncing = false;
      }
    },
    // [Rebase agora] do modal de divergência (estratégia 'ask')
    async rebaseNow() {
      this.askDiverged = false;
      if (this.syncing) return;
      this.syncing = true;
      try {
        const res = await syncPull('rebase');
        if (this.handlePullResult(res, true)) {
          this.notify(res.message || 'Sincronizado.');
          await this.reload();
        }
      } catch (e) {
        this.notify(e.message || 'Falha ao sincronizar.', 'error');
      } finally {
        this.syncing = false;
      }
    },
    // Trata QUALQUER resultado de pull (manual, auto, pós-save). ok → aplica e
    // limpa o estado de erro; falha → âmbar no botão + toast UMA vez por mudança
    // de reason (force=true reapresenta — usado nos fluxos manuais). Retorna ok.
    handlePullResult(res, force = false) {
      if (res && res.ok) {
        this.lastPullAt = Date.now();
        this.applyPull(res);
        if (this.pullError) { this.pullError = null; this.askDiverged = false; }
        return true;
      }
      const reason = (res && res.reason) || 'other';
      if (reason === 'no-remote') this.stopAutoPull(); // pausa sem loop de erro
      const changed = reason !== this.pullError;
      this.pullError = reason;
      if (changed || force) {
        this.notify(PULL_REASON_LABELS[reason] || PULL_REASON_LABELS.other, 'error');
        const { strategy } = this.pullPrefs();
        if (strategy === 'ask' && reason === 'diverged') this.askDiverged = true;
      }
      return false;
    },
    // Aplica o resultado do pull: atualiza notificações + avisa se vieram novas.
    applyPull(res) {
      if (!res) return;
      if (Array.isArray(res.notifications)) this.notifications = res.notifications;
      const fresh = (res.newNotifications || []).length;
      if (fresh) this.notify(`${fresh} ${fresh === 1 ? 'nova notificação' : 'novas notificações'}`);
      // o pull pode ter trazido config nova (board/schema/users de um colega) —
      // refetch barato (leitura local) e SÓ substitui se mudou de fato (senão o
      // watcher do Dashboard resetaria o modo edição a cada auto-pull).
      this.refreshConfigIfChanged();
    },
    async refreshConfigIfChanged() {
      try {
        const cfg = await getConfig();
        if (!cfg) return;
        if (JSON.stringify(cfg) !== JSON.stringify(this.config)) {
          this.config = cfg;
          this.syncFilterState(); // filtros efetivos podem ter mudado (board.filters novo)
        }
      } catch (e) { /* best-effort */ }
    },
    // ── auto-pull periódico (traz mudanças de outros + dispara notificações) ──
    startAutoPull() {
      this.stopAutoPull();
      const { interval } = this.pullPrefs();
      if (!interval) return; // 0 = desligado
      this.pullTimer = setInterval(() => { this.silentPull(); }, interval);
    },
    stopAutoPull() {
      if (this.pullTimer) { clearInterval(this.pullTimer); this.pullTimer = null; }
    },
    async silentPull() {
      if (this.syncing || !this.config) return;
      // vault sem remote: não insiste (a aba Sync mostra o estado do health/git)
      if (this.gitHealth && this.gitHealth.hasRepo && !this.gitHealth.hasRemote) return;
      try {
        const res = await syncPull(this.pullStrategyForApi());
        if (this.handlePullResult(res)) {
          const tasks = await listTasks();
          this.tasks = Array.isArray(tasks) ? tasks : [];
        }
      } catch (e) { /* rede/servidor fora — silencioso */ }
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
      this.handlePullResult(res); // pull pós-save também nunca é silencioso
      await this.reload();
    },
    // kebab da propriedade alterou o schema (label/tipo/oculto): atualiza config
    // + tarefas SEM resetar filtros ativos e sort da topbar (loadActive zerava).
    async onConfigChanged() {
      await Promise.all([this.refreshConfigIfChanged(), this.reload()]);
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
      try { this.notifications = (await clearNotifications(id)) || []; }
      catch (e) { this.notify(e.message || 'Falha ao dispensar a notificação.', 'error'); }
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
      this.peekHistoryHash = '';
      this.editingTask = null;
      this.peekOpen = true;
    },
    openEdit(task) {
      this.peekHistoryHash = '';
      this.editingTask = task;
      this.peekOpen = true;
    },
    closePeek() {
      this.peekOpen = false;
      this.peekHistoryHash = ''; // limpa p/ o próximo open normal não reabrir histórico
    },
    // clique num commit do histórico global → abre a tarefa no diff daquele commit
    openTaskAtCommit(payload) {
      const taskId = payload && payload.taskId;
      const hash = (payload && payload.hash) || '';
      const t = this.tasks.find((x) => x.id === taskId);
      if (!t) { this.notify('Tarefa não encontrada (pode ter sido removida).', 'error'); return; }
      this.settingsOpen = false;
      this.editingTask = t;
      this.peekHistoryHash = hash;
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
    async onConfigSaved(payload) {
      // Re-bootstrap: recarrega config + tasks (a edição pode ter migrado tarefas).
      await this.bootstrap();
      this.settingsOpen = false;
      this.notify('Configuração salva.');
      if (payload && payload.warning) this.notify(payload.warning, 'error');
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
    openSettings(tab) {
      this.settingsInitialTab = tab || 'status';
      this.settingsOpen = true;
    },
    // ── auto-update (Electron) ──
    readUpdateIntervalMs() {
      try {
        const v = parseInt(localStorage.getItem('basalt.updateIntervalMs'), 10);
        return Number.isFinite(v) && v >= 0 ? v : 10800000; // default 3h
      } catch (e) { return 10800000; }
    },
    applyUpdatePrefs() {
      const u = window.electron && window.electron.update;
      if (!u) return;
      const ms = this.readUpdateIntervalMs();
      u.setInterval(ms);        // agenda (ou desliga) o polling no main
      if (ms > 0) u.check();    // checagem ao abrir / ao religar
    },
    onUpdateStatus(s) {
      if (!s || !s.state) return;
      this.update.state = s.state;
      if (s.version) this.update.version = s.version;
      if (typeof s.percent === 'number') this.update.percent = s.percent;
      // pronto pra instalar → modal (a não ser que já tenha adiado nesta sessão)
      if (s.state === 'downloaded' && !this.update.snoozed) this.update.showModal = true;
    },
    installUpdate() {
      try { if (window.electron && window.electron.update) window.electron.update.install(); } catch (e) { /* noop */ }
    },
    snoozeUpdate() {
      this.update.snoozed = true;   // não mostra mais popup nesta sessão
      this.update.showModal = false;
    },
    // clique no destaque lateral: pronto → reabre modal; senão abre a aba
    openUpdate() {
      if (this.update.state === 'downloaded') this.update.showModal = true;
      else this.openSettings('updates');
    },
  },
  beforeUnmount() {
    this.stopAutoPull();
    window.removeEventListener('sync-prefs-changed', this.onSyncPrefsChanged);
    window.removeEventListener('update-prefs-changed', this.applyUpdatePrefs);
    Object.values(this._filterTimers || {}).forEach((t) => clearTimeout(t));
    if (this._offUpd) this._offUpd();
  },
};
</script>

<style>
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }
</style>
