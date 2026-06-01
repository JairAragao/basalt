<template>
  <div class="h-full overflow-x-auto overflow-y-hidden">
    <div class="flex h-full items-start gap-5 p-4">
      <!-- Cada grupo macro (A fazer / Em andamento / Concluído) -->
      <div
        v-for="grp in groups"
        :key="grp.id"
        class="flex h-full flex-shrink-0 flex-col"
      >
        <!-- rótulo macro do grupo (placeholder invisível mantém alinhamento do fallback) -->
        <div class="mb-2 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
          <span v-if="grp.id !== '__fallback'">{{ grp.label }}</span>
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
            <!-- header da coluna (tingível) -->
            <div
              class="mb-2 flex items-center gap-2 rounded-md px-1.5 py-1"
              :style="headerStyle(col)"
            >
              <span class="h-2 w-2 flex-shrink-0 rounded-full" :style="{ background: col.color }"></span>
              <span class="truncate text-[13px] font-medium text-muted">{{ col.label }}</span>
              <span class="ml-auto rounded bg-ink-700 px-1.5 py-0.5 text-[11px] text-faint">{{ (grouped[col.id] || []).length }}</span>
            </div>

            <!-- cards -->
            <draggable
              :list="grouped[col.id]"
              :group="{ name: 'tasks' }"
              :animation="160"
              ghost-class="board-ghost"
              drag-class="board-drag"
              class="flex min-h-[60px] flex-1 flex-col gap-2 overflow-y-auto rounded-lg p-1"
              @change="(evt) => onChange(evt, col.id)"
            >
              <TaskCard
                v-for="task in grouped[col.id]"
                :key="task.id"
                :task="task"
                :config="config"
                :tint="colorColumns ? col.color : null"
                @open="$emit('open', $event)"
                @delete="$emit('delete', $event)"
              />
            </draggable>

            <button
              class="mt-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-faint hover:bg-ink-700 hover:text-muted"
              @click="$emit('open', { status: col.id })"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M10 4v12M4 10h12" stroke-linecap="round" /></svg>
              Nova
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import draggable from 'vuedraggable';
import TaskCard from './TaskCard.vue';
import { moveTask } from '../api';

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
    return { grouped: {} };
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
      this.$set(task, this.groupByKey, targetColId);
      this.grouped[targetColId] = this.sortColumn(this.grouped[targetColId]);
      try {
        const updated = await moveTask(task.id, targetColId);
        let warning = '';
        if (updated && typeof updated === 'object') {
          warning = updated.warning || '';
          Object.keys(updated).forEach((k) => {
            if (k !== 'warning') this.$set(task, k, updated[k]);
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
      this.$set(task, this.groupByKey, previousStatus);
      const known = new Set(this.columnIds);
      const originCol = known.has(previousStatus) ? previousStatus : this.fallbackColumn.id;
      if (!this.grouped[originCol]) this.$set(this.grouped, originCol, []);
      this.grouped[originCol].push(task);
      this.grouped[originCol] = this.sortColumn(this.grouped[originCol]);
    },
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
