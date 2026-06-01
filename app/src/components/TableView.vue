<template>
  <div class="h-full overflow-auto p-4">
    <div class="overflow-x-auto rounded-xl border border-ink-line bg-ink-850">
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="border-b border-ink-line text-left">
            <th
              v-for="col in columns"
              :key="col.key"
              class="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-[12px] font-medium text-muted hover:text-txt"
              @click="onSort(col.key)"
            >
              <span class="inline-flex items-center gap-1">
                {{ col.label }}
                <span v-if="sortBy === col.key" class="text-faint">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in sortedTasks"
            :key="task.id"
            class="cursor-pointer border-b border-ink-700 last:border-0 transition-colors hover:bg-ink-800"
            @click="$emit('open', task)"
          >
            <td v-for="col in columns" :key="col.key" class="px-3 py-2 align-middle">
              <!-- status como pill colorida -->
              <span
                v-if="col.key === statusKey"
                v-show="hasValue(task[col.key])"
                class="pill"
                :style="pillStyle(task[col.key])"
              >{{ task[col.key] }}</span>

              <!-- demais células -->
              <span v-else-if="hasValue(task[col.key])" class="text-txt">{{ task[col.key] }}</span>
              <span v-else class="text-faint">—</span>
            </td>
          </tr>

          <tr v-if="!sortedTasks.length">
            <td :colspan="columns.length" class="px-3 py-10 text-center text-[13px] text-faint">
              Nenhuma tarefa.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
const GUTE_KEY = 'prioridade_gute';

export default {
  name: 'TableView',
  props: {
    tasks: { type: Array, default: () => [] },
    config: { type: Object, required: true },
    sort: { type: Object, default: null },
  },
  computed: {
    boardCfg() { return this.config.board || {}; },
    schema() { return this.config.schema || {}; },
    properties() { return this.schema.properties || {}; },
    statusKey() { return this.boardCfg.groupBy || 'status'; },
    columns() {
      const cols = Object.keys(this.properties).map((key) => ({
        key,
        label: this.properties[key].label || key,
      }));
      const gutePropLabel = (this.properties[GUTE_KEY] && this.properties[GUTE_KEY].label) || 'Prioridade GUTE';
      if (!cols.some((c) => c.key === GUTE_KEY)) {
        cols.push({ key: GUTE_KEY, label: gutePropLabel });
      }
      return cols;
    },
    statusColors() {
      const map = {};
      (this.boardCfg.columns || []).forEach((c) => { map[c.id] = c.color; });
      return map;
    },
    sortBy() { return (this.sort && this.sort.by) || (this.boardCfg.sort && this.boardCfg.sort.by) || GUTE_KEY; },
    sortDir() { return (this.sort && this.sort.dir) || (this.boardCfg.sort && this.boardCfg.sort.dir) || 'desc'; },
    sortedTasks() {
      const by = this.sortBy;
      const factor = this.sortDir === 'asc' ? 1 : -1;
      return [...(this.tasks || [])].sort((a, b) => {
        const av = a[by], bv = b[by];
        const aNull = !this.hasValue(av);
        const bNull = !this.hasValue(bv);
        if (aNull && bNull) return 0;
        if (aNull) return 1; // null por último
        if (bNull) return -1;
        if (av < bv) return -1 * factor;
        if (av > bv) return 1 * factor;
        return 0;
      });
    },
  },
  methods: {
    hasValue(v) { return v !== null && v !== undefined && v !== ''; },
    pillStyle(value) {
      const color = this.statusColors[value] || '#6f6f6f';
      return { background: color + '22', color, border: '1px solid ' + color + '55' };
    },
    onSort(key) {
      // alterna dir se já está nesta coluna; senão começa em asc
      const dir = this.sortBy === key && this.sortDir === 'asc' ? 'desc' : 'asc';
      this.$emit('sort', { by: key, dir });
    },
  },
};
</script>
