<template>
  <div class="flex h-full flex-col rounded-lg border border-ink-500 bg-ink-850 p-4">
    <!-- cabeçalho: título + (opções inline no modo edição, via slot) -->
    <div class="mb-2 flex items-center gap-2">
      <div class="min-w-0 flex-1 truncate text-[13px] font-medium text-muted" :title="title">{{ title }}</div>
      <slot name="actions" />
    </div>

    <div class="min-h-0 flex-1">
      <div v-if="chart.type === 'kpi'" class="flex h-full flex-col justify-center">
        <div class="text-[26px] font-semibold leading-tight text-txt">{{ kpiLabel }}</div>
        <div class="mt-0.5 text-[11px] text-faint">{{ basisHint }}</div>
      </div>

      <template v-else-if="chart.type === 'bar'">
        <BarList v-if="chart.orientation !== 'vertical'" :rows="barRows" :color="defaultColor" :aria-label="title" />
        <div v-else class="flex h-full min-h-[140px] items-end gap-2 pt-2">
          <div v-for="r in barRows" :key="r.label" class="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" :title="`${r.label}: ${r.count}`">
            <span class="text-[11px] text-txt">{{ r.count }}</span>
            <span class="w-full rounded-t transition-[height] duration-200" :style="{ height: colHeight(r) + 'px', background: r.color || defaultColor }"></span>
            <span class="w-full truncate text-center text-[10px] text-faint">{{ r.label }}</span>
          </div>
          <div v-if="!barRows.length" class="w-full py-4 text-center text-[12px] text-faint">Sem dados no período.</div>
        </div>
      </template>

      <UplotChart v-else-if="chart.type === 'line'" :labels="data.labels || []" :series="lineSeries" :height="200" />

      <PieChart v-else-if="chart.type === 'pie'" :rows="pieRows" :aria-label="title" />
    </div>
  </div>
</template>

<script>
import BarList from './BarList.vue';
import UplotChart from './UplotChart.vue';
import PieChart from './PieChart.vue';

const BASIS_HINT = {
  all: 'todas',
  created: 'criadas no período',
  completed: 'finalizadas no período',
  open: 'em aberto (hoje)',
};

export default {
  name: 'ChartCard',
  components: { BarList, UplotChart, PieChart },
  props: {
    chart: { type: Object, required: true },   // def do dashboard.json
    data: { type: Object, default: () => ({}) }, // resultado de computeChart já colorido
    color: { type: String, default: '#d9a01e' }, // cor default da série (âmbar)
  },
  computed: {
    defaultColor() { return this.color; },
    title() { return this.chart.title || this.autoTitle; },
    autoTitle() {
      const m = this.chart.measure || {};
      const verb = m.agg === 'count' ? 'Contagem' : m.agg === 'sum' ? 'Soma' : m.agg === 'avg' ? 'Média' : 'Lead time';
      return verb;
    },
    basisHint() {
      if ((this.chart.measure || {}).agg === 'leadtime') return 'dias (criação → conclusão)';
      return BASIS_HINT[this.chart.basis] || '';
    },
    kpiLabel() {
      const v = this.data.value;
      if (v == null) return '—';
      if ((this.chart.measure || {}).agg === 'leadtime') return `${String(v).replace('.', ',')} d`;
      return String(v).replace('.', ',');
    },
    // BarList espera { label, count, color }
    barRows() {
      return (this.data.rows || []).map((r) => ({ label: r.label, count: r.value || 0, color: r.color }));
    },
    pieRows() {
      return (this.data.rows || []).map((r) => ({ key: r.key, label: r.label, value: r.value || 0, color: r.color }));
    },
    lineSeries() {
      return [{ label: this.autoTitle, points: this.data.points || [], color: this.color }];
    },
    maxBar() {
      return this.barRows.reduce((m, r) => Math.max(m, r.count || 0), 0);
    },
  },
  methods: {
    colHeight(r) {
      return this.maxBar ? Math.max(3, Math.round(((r.count || 0) / this.maxBar) * 120)) : 0;
    },
  },
};
</script>
