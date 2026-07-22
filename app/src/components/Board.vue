<template>
  <div class="thin-scroll h-full overflow-x-auto overflow-y-hidden">
    <div class="flex h-full items-start gap-5 p-4">
      <!-- Cada grupo macro (A fazer / Em andamento / Concluído) -->
      <div
        v-for="grp in layout"
        :key="grp.id"
        class="flex h-full min-h-0 flex-shrink-0 flex-col"
      >
        <!-- rótulo macro do grupo (editável inline; placeholder invisível mantém alinhamento do fallback) -->
        <div class="mb-2 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
          <template v-if="grp.id !== '__fallback'">
            <input
              v-if="editingGroup === grp.id"
              :ref="'editg-' + grp.id"
              v-model="editGroupLabel"
              class="w-full rounded border border-accent bg-ink-900 px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-txt focus:outline-none"
              @keydown.enter.prevent="commitRenameGroup(grp)"
              @keydown.esc="cancelRenameGroup"
              @blur="commitRenameGroup(grp)"
            />
            <button
              v-else
              type="button"
              class="max-w-full truncate hover:text-muted"
              :disabled="savingCfg"
              title="Renomear grupo"
              @click="startRenameGroup(grp)"
            >{{ grp.label }}</button>
          </template>
          <span v-else class="opacity-0">·</span>
        </div>

        <!-- colunas de etapa do grupo — arrastáveis (reordena e move ENTRE grupos
             macro pela alça .col-handle; group compartilhado 'board-cols') -->
        <draggable
          :list="grp.columns"
          :group="{ name: 'board-cols' }"
          item-key="id"
          handle=".col-handle"
          :animation="160"
          ghost-class="col-ghost"
          class="flex min-h-0 flex-1 items-start gap-3"
          @change="onColChange"
        >
          <template #item="{ element: col }">
            <div
              class="flex h-full min-h-0 w-[280px] flex-shrink-0 flex-col"
              :class="colorColumns ? 'rounded-xl border p-1.5' : ''"
              :style="columnStyle(col)"
            >
              <!-- header da coluna (tingível) -->
              <div
                class="mb-2 flex flex-shrink-0 items-center gap-1.5 rounded-md px-2 py-2"
                :style="headerStyle(col)"
              >
                <!-- alça de arraste (só etapas reais) -->
                <span
                  v-if="grp.id !== '__fallback'"
                  class="col-handle grid h-5 w-4 flex-shrink-0 cursor-grab place-items-center text-faint hover:text-muted active:cursor-grabbing"
                  title="Arrastar para reordenar ou mover de grupo"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><circle cx="7.5" cy="5" r="1.25" /><circle cx="12.5" cy="5" r="1.25" /><circle cx="7.5" cy="10" r="1.25" /><circle cx="12.5" cy="10" r="1.25" /><circle cx="7.5" cy="15" r="1.25" /><circle cx="12.5" cy="15" r="1.25" /></svg>
                </span>

                <span class="h-2.5 w-2.5 flex-shrink-0 rounded-full" :style="{ background: col.color }"></span>

                <span class="min-w-0 flex-1 truncate text-[14px] font-medium text-muted">{{ col.label }}</span>

                <span class="rounded bg-ink-700 px-1.5 py-0.5 text-[11px] text-faint">{{ (grouped[col.id] || []).length }}</span>

                <!-- menu ⋮ — edição rápida de nome + cor (só etapas reais) -->
                <div v-if="grp.id !== '__fallback'" :ref="'menuwrap-' + col.id" class="relative flex-shrink-0">
                  <button
                    type="button"
                    class="icon-btn h-6 w-6"
                    title="Editar etapa (nome e cor)"
                    :disabled="savingCfg"
                    @click="toggleMenu(col)"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><circle cx="10" cy="4.5" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="10" cy="15.5" r="1.4" /></svg>
                  </button>
                  <transition name="dd">
                    <div
                      v-if="openMenu === col.id"
                      class="absolute right-0 top-8 z-50 w-[220px] rounded-lg border border-ink-line bg-ink-700 p-2.5 shadow-xl"
                    >
                      <label class="mb-1 block text-[11px] font-medium uppercase tracking-wide text-faint">Nome</label>
                      <input
                        :ref="'menuinput-' + col.id"
                        v-model="menuLabel"
                        class="field mb-3 w-full text-[13px]"
                        placeholder="Nome da etapa"
                        @keydown.enter.prevent="commitMenuRename(col)"
                        @keydown.esc="closeMenu"
                      />
                      <div class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Cor</div>
                      <div class="grid grid-cols-5 gap-1.5">
                        <button
                          v-for="p in palette"
                          :key="p.value"
                          type="button"
                          class="h-6 w-6 rounded-full hover:ring-2 hover:ring-ink-line"
                          :class="{ 'ring-2 ring-accent': col.color === p.value }"
                          :style="{ background: p.value }"
                          :title="p.name"
                          @click="pickMenuColor(col, p.value)"
                        ></button>
                      </div>
                    </div>
                  </transition>
                </div>
              </div>

              <!-- cards (janela incremental: renderiza as primeiras N; a sentinela
                   no fim da coluna carrega +N ao entrar na viewport. A contagem do
                   header continua vindo do conjunto completo em grouped) -->
              <div class="thin-scroll flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg">
                <draggable
                  :list="visibleOf(col.id)"
                  :group="{ name: 'tasks' }"
                  :animation="160"
                  item-key="id"
                  ghost-class="board-ghost"
                  drag-class="board-drag"
                  class="flex min-h-[24px] flex-1 flex-col gap-2 p-1"
                  @change="(evt) => onChange(evt, col.id)"
                >
                  <template #item="{ element: task }">
                    <TaskCard
                      :task="task"
                      :config="config"
                      :tint="colorColumns ? col.color : null"
                      @open="$emit('open', $event)"
                      @delete="$emit('delete', $event)"
                    />
                  </template>
                </draggable>
                <div v-if="hasMoreCol(col.id)" :data-col="col.id" class="h-px flex-shrink-0"></div>
              </div>

              <button
                class="mt-1 flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-500 px-2 py-2 text-[12px] text-faint transition-colors hover:border-accent hover:bg-ink-800/50 hover:text-muted"
                @click="$emit('open', { status: col.id })"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M10 4v12M4 10h12" stroke-linecap="round" /></svg>
                Nova
              </button>
            </div>
          </template>
        </draggable>
      </div>

      <!-- adicionar ETAPA (botão único no fim do board; escolhe em qual grupo macro entra) -->
      <div ref="addStageBox" class="relative mt-7 flex-shrink-0">
        <button
          type="button"
          class="flex h-10 w-[210px] items-center gap-2 rounded-xl border border-dashed border-ink-500 px-4 text-[13px] text-faint transition-colors hover:border-accent hover:bg-ink-800/50 hover:text-muted disabled:opacity-40"
          :disabled="savingCfg"
          title="Adicionar etapa"
          @click="toggleAddMenu"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M10 4v12M4 10h12" stroke-linecap="round" /></svg>
          Adicionar etapa
        </button>
        <transition name="dd">
          <div
            v-if="showAddMenu"
            ref="addMenu"
            class="absolute left-0 top-12 z-50 w-[210px] overflow-hidden rounded-lg border border-ink-line bg-ink-700 p-1 shadow-xl"
          >
            <div class="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Adicionar etapa em</div>
            <button
              v-for="g in realGroups"
              :key="g.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-txt hover:bg-ink-600 disabled:opacity-40"
              :disabled="savingCfg"
              @click="addStageToGroup(g)"
            >{{ g.label }}</button>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script>
import draggable from 'vuedraggable';
import TaskCard from './TaskCard.vue';
import { moveTask, saveStatus } from '../api';
import { PALETTE, DEFAULT_COLOR } from '../palette';

const WINDOW_STEP = 50; // cards renderizados por página da janela de cada coluna

export default {
  name: 'Board',
  components: { draggable, TaskCard },
  props: {
    tasks: { type: Array, default: () => [] },
    config: { type: Object, required: true },
    colorColumns: { type: Boolean, default: false },
    sort: { type: Object, default: null },
    filterKey: { type: String, default: '' }, // muda quando os filtros da topbar mudam → reset das janelas
  },
  data() {
    return {
      grouped: {},
      // cópia local editável do arranjo de colunas (grupos macro × etapas) —
      // é o que o vuedraggable muta ao arrastar/mover colunas. Sincronizado
      // a partir do config em syncLayout().
      layout: [],
      // janela incremental de render por coluna (default WINDOW_STEP por coluna)
      windowByCol: {},
      io: null,
      // edição direta de etapas no board
      palette: PALETTE,
      openMenu: null,   // col.id com o menu ⋮ (nome + cor) aberto
      menuLabel: '',    // rascunho do nome no menu ⋮
      editingGroup: null, // grp.id em renomeação inline
      editGroupLabel: '',
      showAddMenu: false, // popover "adicionar etapa em <grupo>"
      savingCfg: false,
    };
  },
  computed: {
    boardCfg() { return this.config.board || {}; },
    groupByKey() { return this.boardCfg.groupBy || 'status'; },
    statusGroups() { return this.boardCfg.statusGroups || []; },
    fallbackColumn() { return this.boardCfg.fallbackColumn || { id: '_none', label: 'Sem status', color: '#4b4b4b' }; },
    sortCfg() { return this.sort || this.boardCfg.sort || { by: 'created_at', dir: 'desc' }; },
    // Grupos macro + suas colunas de etapa. Sem coluna "Sem status": status é
    // obrigatório (enum com default), então toda tarefa cai numa etapa válida.
    groups() {
      return this.statusGroups.map((g) => ({
        id: g.id,
        label: g.label,
        columns: (g.stages || []).map((s) => ({
          id: s.id,
          label: s.label || s.id,
          color: s.color || '#6f6f6f',
        })),
      }));
    },
    // Grupos macro reais (sem o fallback sintético) — pro picker de adicionar etapa.
    realGroups() {
      return this.groups.filter((g) => g.id !== '__fallback');
    },
    allColumns() {
      return this.groups.reduce((acc, g) => acc.concat(g.columns), []);
    },
    columnIds() {
      const fbId = this.fallbackColumn.id;
      return this.allColumns.map((c) => c.id).filter((id) => id !== fbId);
    },
  },
  watch: {
    // refresh de dados NÃO reseta as janelas (não colapsa o scroll do usuário)
    tasks: { immediate: true, handler() { this.regroup(); } },
    config() { this.resetWindows(); this.syncLayout(); this.regroup(); },
    sort: { deep: true, handler() { this.resetWindows(); this.regroup(); } },
    filterKey() { this.resetWindows(); },
  },
  created() {
    this.syncLayout();
  },
  mounted() {
    this.io = new IntersectionObserver(this.onSentinel, { rootMargin: '200px' });
    this.$nextTick(this.observeSentinels);
  },
  updated() {
    this.observeSentinels();
  },
  methods: {
    // ── janela incremental por coluna ──
    windowOf(colId) { return this.windowByCol[colId] || WINDOW_STEP; },
    visibleOf(colId) { return (this.grouped[colId] || []).slice(0, this.windowOf(colId)); },
    hasMoreCol(colId) { return (this.grouped[colId] || []).length > this.windowOf(colId); },
    resetWindows() { this.windowByCol = {}; },
    // UM observer pra todas as colunas; a sentinela carrega o data-col
    observeSentinels() {
      if (!this.io) return;
      this.io.disconnect();
      this.$el.querySelectorAll('[data-col]').forEach((el) => this.io.observe(el));
    },
    onSentinel(entries) {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const colId = e.target.getAttribute('data-col');
        const total = (this.grouped[colId] || []).length;
        const cur = this.windowOf(colId);
        if (cur < total) this.windowByCol = { ...this.windowByCol, [colId]: cur + WINDOW_STEP };
      }
    },
    // ── layout local (arranjo de colunas arrastáveis) ──
    // Espelha `groups` (derivado do config) numa cópia mutável. O vuedraggable
    // reordena/move colunas dentro dessa cópia; onColChange persiste o resultado.
    syncLayout() {
      this.layout = this.groups.map((g) => ({
        id: g.id,
        label: g.label,
        columns: g.columns.map((c) => ({ id: c.id, label: c.label, color: c.color })),
      }));
    },
    headerStyle(col) {
      if (!this.colorColumns) return {};
      return { background: col.color + '24' };
    },
    columnStyle(col) {
      if (!this.colorColumns) return {};
      return { background: col.color + '14', borderColor: col.color + '30' };
    },
    regroup() {
      const key = this.groupByKey;
      const known = new Set(this.columnIds);
      const buckets = {};
      this.allColumns.forEach((c) => { buckets[c.id] = []; });
      (this.tasks || []).forEach((task) => {
        const v = task[key];
        const colId = known.has(v) ? v : this.fallbackColumn.id;
        if (!buckets[colId]) buckets[colId] = [];
        buckets[colId].push(task);
      });
      Object.keys(buckets).forEach((colId) => { buckets[colId] = this.sortColumn(buckets[colId]); });
      this.grouped = buckets;
    },
    sortColumn(list) {
      const { by, dir } = this.sortCfg;
      const factor = dir === 'asc' ? 1 : -1;
      return [...list].sort((a, b) => {
        const av = a[by], bv = b[by];
        const aNull = av === null || av === undefined || av === '';
        const bNull = bv === null || bv === undefined || bv === '';
        if (aNull && bNull) return 0;
        if (aNull) return 1; // null sempre por último
        if (bNull) return -1;
        if (av < bv) return -1 * factor;
        if (av > bv) return 1 * factor;
        return 0;
      });
    },
    async onChange(evt, targetColId) {
      if (!evt.added) return;
      const task = evt.added.element;
      const previousStatus = task[this.groupByKey];
      // o draggable mutou só a SLICE renderizada — atualiza o estado canônico
      // (grouped) na mão pra contagem/sentinela refletirem o conjunto completo.
      const known = new Set(this.columnIds);
      const fromCol = known.has(previousStatus) ? previousStatus : this.fallbackColumn.id;
      if (this.grouped[fromCol]) this.grouped[fromCol] = this.grouped[fromCol].filter((t) => t.id !== task.id);
      task[this.groupByKey] = targetColId;
      const target = (this.grouped[targetColId] || []).filter((t) => t.id !== task.id);
      target.push(task);
      this.grouped[targetColId] = this.sortColumn(target);
      try {
        const updated = await moveTask(task.id, targetColId);
        let warning = '';
        if (updated && typeof updated === 'object') {
          warning = updated.warning || '';
          Object.keys(updated).forEach((k) => {
            if (k !== 'warning') task[k] = updated[k];
          });
        }
        this.$emit('moved', { id: task.id, status: targetColId, warning });
      } catch (e) {
        this.revertMove(task, previousStatus, targetColId);
        this.$emit('error', e.message || 'Não foi possível mover a tarefa.');
      }
    },
    revertMove(task, previousStatus, targetColId) {
      this.grouped[targetColId] = this.grouped[targetColId].filter((t) => t.id !== task.id);
      task[this.groupByKey] = previousStatus;
      const known = new Set(this.columnIds);
      const originCol = known.has(previousStatus) ? previousStatus : this.fallbackColumn.id;
      if (!this.grouped[originCol]) this.grouped[originCol] = [];
      this.grouped[originCol].push(task);
      this.grouped[originCol] = this.sortColumn(this.grouped[originCol]);
    },

    // ── Arraste de COLUNAS (reordenar / mover de grupo macro) ─────────────────
    // O vuedraggable já mutou this.layout (source e/ou target). Uma passada de
    // persist por drag (coalescida no nextTick — cross-group dispara 2 eventos).
    onColChange() {
      if (this._colScheduled) return;
      this._colScheduled = true;
      this.$nextTick(() => { this._colScheduled = false; this.persistLayout(); });
    },
    persistLayout() {
      // grupo macro não pode ficar sem etapas (o backend rejeita) — reverte.
      const empty = this.layout.find((g) => g.id !== '__fallback' && !g.columns.length);
      if (empty) {
        this.$emit('error', 'Cada grupo macro precisa de ao menos uma etapa.');
        this.syncLayout();
        return;
      }
      const groups = this.layout.map((g) => ({
        id: g.id,
        label: g.label,
        stages: g.columns.map((c) => ({ origId: c.id, label: c.label, color: c.color })),
      }));
      this.persist(this.toPayload(groups));
    },

    // ── Edição direta de etapas (renomear / recolorir / adicionar) ────────────
    // Clona statusGroups reais (sem o fallback sintético) preservando o id
    // original de cada etapa para casar renames na migração de tarefas.
    cloneGroups() {
      return ((this.config.board && this.config.board.statusGroups) || []).map((g) => ({
        id: g.id,
        label: g.label,
        stages: (g.stages || []).map((s) => ({
          origId: s.id,
          label: s.label != null ? s.label : s.id,
          color: s.color || DEFAULT_COLOR,
        })),
      }));
    },
    toPayload(groups) {
      const statusGroups = groups.map((g) => ({
        id: g.id,
        label: (g.label || '').trim() || g.id,
        stages: g.stages.map((s) => {
          const label = (s.label || '').trim();
          return { id: label, label, color: s.color };
        }),
      }));
      const renames = [];
      for (const g of groups) {
        for (const s of g.stages) {
          const to = (s.label || '').trim();
          if (s.origId && to && s.origId !== to) renames.push({ from: s.origId, to });
        }
      }
      return { statusGroups, renames };
    },
    async persist(payload) {
      this.savingCfg = true;
      try {
        const updated = await saveStatus(payload);
        this.$emit('config-saved', updated);
      } catch (e) {
        this.$emit('error', e.message || 'Falha ao salvar a configuração.');
      } finally {
        this.savingCfg = false;
      }
    },

    // ── menu ⋮ da coluna (edição rápida: nome + cor) ──────────────────────────
    toggleMenu(col) {
      if (this.openMenu === col.id) { this.closeMenu(); return; }
      this.openMenu = col.id;
      this.menuLabel = col.label;
      this.$nextTick(() => {
        document.addEventListener('mousedown', this.onMenuDocClick, true);
        const ref = this.$refs['menuinput-' + col.id];
        const el = Array.isArray(ref) ? ref[0] : ref;
        if (el) { el.focus(); el.select(); }
      });
    },
    closeMenu() {
      this.openMenu = null;
      document.removeEventListener('mousedown', this.onMenuDocClick, true);
    },
    onMenuDocClick(e) {
      const wrap = this.$refs['menuwrap-' + this.openMenu];
      const el = Array.isArray(wrap) ? wrap[0] : wrap;
      if (el && el.contains(e.target)) return; // botão/menu tratam o próprio clique
      this.closeMenu();
    },
    commitMenuRename(col) {
      const to = (this.menuLabel || '').trim();
      if (!to || to === col.label) { this.closeMenu(); return; }
      // duplicidade: a etapa-alvo não pode colidir com outra existente
      const exists = ((this.config.board && this.config.board.statusGroups) || [])
        .some((g) => (g.stages || []).some((s) => s.id !== col.id && s.id === to));
      if (exists) { this.$emit('error', `Já existe uma etapa "${to}".`); return; }
      const groups = this.cloneGroups();
      for (const g of groups) {
        for (const s of g.stages) if (s.origId === col.id) s.label = to;
      }
      this.closeMenu();
      this.persist(this.toPayload(groups));
    },
    pickMenuColor(col, color) {
      this.closeMenu();
      if (col.color === color) return;
      const groups = this.cloneGroups();
      for (const g of groups) {
        for (const s of g.stages) if (s.origId === col.id) s.color = color;
      }
      this.persist(this.toPayload(groups));
    },

    addStage(grp) {
      const groups = this.cloneGroups();
      const target = groups.find((g) => g.id === grp.id);
      if (!target) return;
      // nome único: "Nova etapa", "Nova etapa 2", …
      const taken = new Set();
      groups.forEach((g) => g.stages.forEach((s) => taken.add((s.label || '').trim())));
      let label = 'Nova etapa';
      let n = 2;
      while (taken.has(label)) { label = `Nova etapa ${n++}`; }
      target.stages.push({ origId: null, label, color: DEFAULT_COLOR });
      this.persist(this.toPayload(groups));
    },
    // adicionar etapa via botão único: abre o menu pra escolher o grupo macro
    toggleAddMenu() {
      this.showAddMenu = !this.showAddMenu;
      if (this.showAddMenu) {
        this.$nextTick(() => document.addEventListener('mousedown', this.onAddMenuDocClick, true));
      } else {
        document.removeEventListener('mousedown', this.onAddMenuDocClick, true);
      }
    },
    onAddMenuDocClick(e) {
      const box = this.$refs.addStageBox;
      if (box && box.contains(e.target)) return; // cliques no botão/menu não fecham por aqui
      this.showAddMenu = false;
      document.removeEventListener('mousedown', this.onAddMenuDocClick, true);
    },
    addStageToGroup(grp) {
      this.showAddMenu = false;
      document.removeEventListener('mousedown', this.onAddMenuDocClick, true);
      this.addStage(grp);
    },
    // renomear grupo macro (label do grupo — não migra tarefas, não é status)
    startRenameGroup(grp) {
      this.editingGroup = grp.id;
      this.editGroupLabel = grp.label;
      this.$nextTick(() => {
        const ref = this.$refs['editg-' + grp.id];
        const el = Array.isArray(ref) ? ref[0] : ref;
        if (el) { el.focus(); el.select(); }
      });
    },
    cancelRenameGroup() {
      this.editingGroup = null;
      this.editGroupLabel = '';
    },
    commitRenameGroup(grp) {
      if (this.editingGroup !== grp.id) return;
      const to = (this.editGroupLabel || '').trim();
      this.editingGroup = null;
      if (!to || to === grp.label) return;
      const groups = this.cloneGroups();
      const g = groups.find((x) => x.id === grp.id);
      if (g) g.label = to;
      this.persist(this.toPayload(groups));
    },
  },
  beforeUnmount() {
    if (this.io) { this.io.disconnect(); this.io = null; }
    document.removeEventListener('mousedown', this.onMenuDocClick, true);
    document.removeEventListener('mousedown', this.onAddMenuDocClick, true);
  },
};
</script>

<style scoped>
.board-ghost {
  opacity: 0.4;
}
.board-ghost > * {
  border-style: dashed !important;
}
.board-drag {
  transform: rotate(1.5deg);
}
/* coluna sendo arrastada (ghost do reorder de colunas) */
.col-ghost {
  opacity: 0.4;
}
.col-ghost > * {
  border: 1px dashed #d9a01e !important;
  border-radius: 0.75rem;
}
.dd-enter-active, .dd-leave-active { transition: opacity .12s ease, transform .12s ease; }
.dd-enter-from, .dd-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
