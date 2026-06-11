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
            v-for="task in visibleTasks"
            :key="task.id"
            class="cursor-pointer border-b border-ink-700 last:border-0 transition-colors hover:bg-ink-800"
            @click="$emit('open', task)"
          >
            <td v-for="col in columns" :key="col.key" class="px-3 py-2 align-middle">
              <!-- status como pill colorida (cor da etapa) -->
              <span
                v-if="col.key === statusKey"
                v-show="hasValue(task[col.key])"
                class="pill"
                :style="pillStyle(task[col.key])"
              >{{ task[col.key] }}</span>

              <!-- enum/multiselect: chips com a cor da opção (optionMeta › hash) -->
              <span v-else-if="isOptionCol(col.key) && hasValue(task[col.key])" class="flex flex-wrap gap-1">
                <span
                  v-for="opt in optionValues(col.key, task[col.key])"
                  :key="opt"
                  class="pill"
                  :style="optionPillStyle(col.key, opt)"
                >{{ opt }}</span>
              </span>

              <!-- demais células (datetime formatado bonito) -->
              <span v-else-if="hasValue(task[col.key])" class="text-txt">{{ cellValue(col.key, task) }}</span>
              <span v-else class="text-faint">—</span>
            </td>
          </tr>

          <!-- sentinela da janela incremental (carrega +100 ao aparecer) -->
          <tr v-if="hasMore">
            <td :colspan="columns.length" class="p-0">
              <div data-sentinel class="h-px"></div>
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

    <!-- contagem discreta do conjunto completo -->
    <div v-if="sortedTasks.length" class="mt-2 px-1 text-[11px] text-faint">
      Mostrando {{ visibleTasks.length }} de {{ sortedTasks.length }}
    </div>
  </div>
</template>

<script>
import { displayValue } from '../format';
import { colorFor } from '../palette';

const PAGE = 100; // linhas renderizadas por página da janela incremental

export default {
  name: 'TableView',
  props: {
    tasks: { type: Array, default: () => [] },
    config: { type: Object, required: true },
    sort: { type: Object, default: null },
    filterKey: { type: String, default: '' }, // muda quando os filtros da topbar mudam → reset
  },
  data() {
    return { limit: PAGE, io: null };
  },
  computed: {
    boardCfg() { return this.config.board || {}; },
    schema() { return this.config.schema || {}; },
    properties() { return this.schema.properties || {}; },
    statusKey() { return this.boardCfg.groupBy || 'status'; },
    // Colunas = todas as propriedades do schema (genérico, sem chave fixa).
    columns() {
      return Object.keys(this.properties).map((key) => ({
        key,
        label: this.properties[key].label || key,
      }));
    },
    statusColors() {
      const map = {};
      (this.boardCfg.columns || []).forEach((c) => { map[c.id] = c.color; });
      return map;
    },
    sortBy() {
      return (this.sort && this.sort.by)
        || (this.boardCfg.sort && this.boardCfg.sort.by)
        || (this.columns[0] && this.columns[0].key)
        || 'created_at';
    },
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
    visibleTasks() { return this.sortedTasks.slice(0, this.limit); },
    hasMore() { return this.sortedTasks.length > this.limit; },
  },
  watch: {
    // sort/filtro/vault resetam a janela (a contagem do rodapé é do conjunto completo)
    sort: { deep: true, handler() { this.limit = PAGE; } },
    filterKey() { this.limit = PAGE; },
    config() { this.limit = PAGE; },
  },
  mounted() {
    this.io = new IntersectionObserver(this.onSentinel, { rootMargin: '300px' });
    this.$nextTick(this.observeSentinel);
  },
  updated() {
    this.observeSentinel();
  },
  beforeUnmount() {
    if (this.io) { this.io.disconnect(); this.io = null; }
  },
  methods: {
    hasValue(v) { return v !== null && v !== undefined && v !== ''; },
    cellValue(key, task) { return displayValue(this.properties[key], task[key]); },
    isOptionCol(key) {
      const p = this.properties[key];
      return !!p && (p.type === 'enum' || p.type === 'multiselect');
    },
    optionValues(key, v) {
      const p = this.properties[key] || {};
      return p.type === 'multiselect'
        ? String(v).split(';').map((s) => s.trim()).filter(Boolean)
        : [String(v).trim()].filter(Boolean);
    },
    optionPillStyle(key, opt) {
      const p = this.properties[key] || {};
      const c = colorFor(opt, p.optionMeta);
      return { backgroundColor: c + '26', color: c };
    },
    pillStyle(value) {
      const color = this.statusColors[value] || '#6f6f6f';
      return { background: color + '22', color, border: '1px solid ' + color + '55' };
    },
    observeSentinel() {
      if (!this.io) return;
      this.io.disconnect();
      const el = this.$el && this.$el.querySelector && this.$el.querySelector('[data-sentinel]');
      if (el) this.io.observe(el);
    },
    onSentinel(entries) {
      for (const e of entries) {
        if (e.isIntersecting && this.hasMore) { this.limit += PAGE; return; }
      }
    },
    onSort(key) {
      // alterna dir se já está nesta coluna; senão começa em asc
      const dir = this.sortBy === key && this.sortDir === 'asc' ? 'desc' : 'asc';
      this.$emit('sort', { by: key, dir });
    },
  },
};
</script>
