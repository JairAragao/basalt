<template>
  <div class="h-full overflow-x-auto overflow-y-hidden">
    <div class="flex h-full items-start gap-5 p-4">
      <!-- Cada grupo macro (A fazer / Em andamento / Concluído) -->
      <div
        v-for="grp in groups"
        :key="grp.id"
        class="flex h-full flex-shrink-0 flex-col"
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

        <!-- colunas de etapa do grupo -->
        <div class="flex h-full items-start gap-3">
          <div
            v-for="col in grp.columns"
            :key="col.id"
            class="flex h-full w-[280px] flex-shrink-0 flex-col"
            :class="colorColumns ? 'rounded-xl border p-1.5' : ''"
            :style="columnStyle(col)"
          >
            <!-- header da coluna (tingível, editável inline) -->
            <div
              class="group/hdr mb-2 flex items-center gap-2 rounded-md px-2 py-2"
              :style="headerStyle(col)"
            >
              <!-- bolinha de cor: clica abre swatches (só etapas reais) -->
              <div class="relative flex-shrink-0">
                <button
                  type="button"
                  class="grid h-4 w-4 place-items-center rounded-full"
                  :class="grp.id !== '__fallback' ? 'hover:ring-2 hover:ring-ink-line' : 'cursor-default'"
                  :title="grp.id !== '__fallback' ? 'Mudar cor' : ''"
                  :disabled="grp.id === '__fallback' || savingCfg"
                  @click="toggleSwatch(col.id)"
                >
                  <span class="h-2 w-2 rounded-full" :style="{ background: col.color }"></span>
                </button>
                <transition name="dd">
                  <div
                    v-if="openSwatch === col.id"
                    :ref="'swatch-' + col.id"
                    class="absolute left-0 top-6 z-50 grid w-[156px] grid-cols-5 gap-1.5 rounded-lg border border-ink-line bg-ink-700 p-2 shadow-xl"
                  >
                    <button
                      v-for="p in palette"
                      :key="p.value"
                      type="button"
                      class="h-5 w-5 rounded-full hover:ring-2 hover:ring-ink-line"
                      :class="{ 'ring-2 ring-accent': col.color === p.value }"
                      :style="{ background: p.value }"
                      :title="p.name"
                      @click="recolor(col, p.value)"
                    ></button>
                  </div>
                </transition>
              </div>

              <!-- nome: clica pra renomear (só etapas reais) -->
              <input
                v-if="editingCol === col.id"
                :ref="'edit-' + col.id"
                v-model="editLabel"
                class="min-w-0 flex-1 rounded border border-accent bg-ink-900 px-1 py-0.5 text-[14px] font-medium text-txt focus:outline-none"
                @keydown.enter.prevent="commitRename(col)"
                @keydown.esc="cancelRename"
                @blur="commitRename(col)"
              />
              <button
                v-else
                type="button"
                class="min-w-0 flex-1 truncate text-left text-[14px] font-medium text-muted"
                :class="grp.id !== '__fallback' ? 'hover:text-txt' : 'cursor-default'"
                :disabled="grp.id === '__fallback' || savingCfg"
                :title="grp.id !== '__fallback' ? 'Renomear etapa' : ''"
                @click="startRename(col)"
              >{{ col.label }}</button>

              <span class="ml-auto rounded bg-ink-700 px-1.5 py-0.5 text-[11px] text-faint">{{ (grouped[col.id] || []).length }}</span>
            </div>

            <!-- cards -->
            <draggable
              :list="grouped[col.id]"
              :group="{ name: 'tasks' }"
              :animation="160"
              item-key="id"
              ghost-class="board-ghost"
              drag-class="board-drag"
              class="flex min-h-[60px] flex-1 flex-col gap-2 overflow-y-auto rounded-lg p-1"
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

            <button
              class="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-500 px-2 py-2 text-[12px] text-faint transition-colors hover:border-accent hover:bg-ink-800/50 hover:text-muted"
              @click="$emit('open', { status: col.id })"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M10 4v12M4 10h12" stroke-linecap="round" /></svg>
              Nova
            </button>
          </div>
        </div>
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

export default {
  name: 'Board',
  components: { draggable, TaskCard },
  props: {
    tasks: { type: Array, default: () => [] },
    config: { type: Object, required: true },
    colorColumns: { type: Boolean, default: false },
    sort: { type: Object, default: null },
  },
  data() {
    return {
      grouped: {},
      // edição direta de etapas no board
      palette: PALETTE,
      openSwatch: null, // col.id com popover de cor aberto
      editingCol: null, // col.id em renomeação inline
      editLabel: '',
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
    sortCfg() { return this.sort || this.boardCfg.sort || { by: 'prioridade_gute', dir: 'desc' }; },
    // Grupos macro + suas colunas de etapa; o fallback vira um grupo final.
    groups() {
      const out = this.statusGroups.map((g) => ({
        id: g.id,
        label: g.label,
        columns: (g.stages || []).map((s) => ({
          id: s.id,
          label: s.label || s.id,
          color: s.color || '#6f6f6f',
        })),
      }));
      const fb = this.fallbackColumn;
      out.push({
        id: '__fallback',
        label: ' ',
        columns: [{ id: fb.id, label: fb.label, color: fb.color || '#4b4b4b' }],
      });
      return out;
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
    tasks: { immediate: true, handler() { this.regroup(); } },
    config() { this.regroup(); },
    sort: { deep: true, handler() { this.regroup(); } },
  },
  methods: {
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
      task[this.groupByKey] = targetColId;
      this.grouped[targetColId] = this.sortColumn(this.grouped[targetColId]);
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
    // cor
    toggleSwatch(colId) {
      this.openSwatch = this.openSwatch === colId ? null : colId;
      if (this.openSwatch) {
        this.$nextTick(() => document.addEventListener('mousedown', this.onSwatchDocClick, true));
      } else {
        document.removeEventListener('mousedown', this.onSwatchDocClick, true);
      }
    },
    onSwatchDocClick(e) {
      const pop = this.$refs['swatch-' + this.openSwatch];
      const el = Array.isArray(pop) ? pop[0] : pop;
      if (el && el.contains(e.target)) return;
      // o botão de cor tem seu próprio toggle — fecha só o popover
      this.openSwatch = null;
      document.removeEventListener('mousedown', this.onSwatchDocClick, true);
    },
    recolor(col, color) {
      this.openSwatch = null;
      document.removeEventListener('mousedown', this.onSwatchDocClick, true);
      if (col.color === color) return;
      const groups = this.cloneGroups();
      for (const g of groups) {
        for (const s of g.stages) if (s.origId === col.id) s.color = color;
      }
      this.persist(this.toPayload(groups));
    },
    // rename inline
    startRename(col) {
      this.editingCol = col.id;
      this.editLabel = col.label;
      this.$nextTick(() => {
        const ref = this.$refs['edit-' + col.id];
        const el = Array.isArray(ref) ? ref[0] : ref;
        if (el) { el.focus(); el.select(); }
      });
    },
    cancelRename() {
      this.editingCol = null;
      this.editLabel = '';
    },
    commitRename(col) {
      if (this.editingCol !== col.id) return; // já tratado (blur após enter)
      const to = (this.editLabel || '').trim();
      this.editingCol = null;
      if (!to || to === col.label) return; // vazio ou sem mudança → ignora
      // duplicidade: a etapa-alvo não pode colidir com outra existente
      const exists = ((this.config.board && this.config.board.statusGroups) || [])
        .some((g) => (g.stages || []).some((s) => s.id !== col.id && s.id === to));
      if (exists) { this.$emit('error', `Já existe uma etapa "${to}".`); return; }
      const groups = this.cloneGroups();
      for (const g of groups) {
        for (const s of g.stages) if (s.origId === col.id) s.label = to;
      }
      this.persist(this.toPayload(groups));
    },
    // adicionar etapa
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
    document.removeEventListener('mousedown', this.onSwatchDocClick, true);
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
</style>
