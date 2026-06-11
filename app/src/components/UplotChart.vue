<template>
  <div ref="wrap" class="uplot-wrap w-full"></div>
</template>

<script>
// Wrapper fino do uPlot. Importado SÓ pelo chunk lazy do DashboardView —
// uPlot (+CSS) fica fora do bundle inicial.
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

// tons do tema dark — espelham tailwind.config.js (ink-500 / muted / txt)
const gridColor = '#2f2f2f';
const axisColor = '#9b9b9b';

export default {
  name: 'UplotChart',
  props: {
    labels: { type: Array, default: () => [] },  // chaves de bucket 'YYYY-MM-DD'
    series: { type: Array, default: () => [] },  // [{ label, points, color }]
    height: { type: Number, default: 260 },
  },
  data() {
    return { chart: null, resizeObs: null };
  },
  computed: {
    plotData() {
      // uPlot espera x em epoch SEGUNDOS; chave de dia → meia-noite local
      const xs = this.labels.map((k) => {
        const [y, m, d] = String(k).split('-').map(Number);
        return new Date(y, m - 1, d).getTime() / 1000;
      });
      return [xs, ...this.series.map((s) => s.points || [])];
    },
  },
  watch: {
    plotData() {
      // nº de séries é fixo (criadas × finalizadas) → setData basta
      if (this.chart) this.chart.setData(this.plotData);
    },
  },
  mounted() {
    this.build();
    this.resizeObs = new ResizeObserver(() => {
      const el = this.$refs.wrap;
      if (this.chart && el && el.clientWidth) {
        this.chart.setSize({ width: el.clientWidth, height: this.height });
      }
    });
    this.resizeObs.observe(this.$refs.wrap);
  },
  beforeUnmount() {
    if (this.resizeObs) { this.resizeObs.disconnect(); this.resizeObs = null; }
    if (this.chart) { this.chart.destroy(); this.chart = null; }
  },
  methods: {
    build() {
      const el = this.$refs.wrap;
      if (!el) return;
      const axis = {
        stroke: axisColor,
        grid: { stroke: gridColor, width: 1 },
        ticks: { stroke: gridColor, width: 1 },
      };
      const opts = {
        width: el.clientWidth || 600,
        height: this.height,
        legend: { live: false },
        cursor: { points: { size: 6 } },
        scales: { x: { time: true } },
        axes: [{ ...axis }, { ...axis }],
        series: [
          {},
          ...this.series.map((s) => ({
            label: s.label,
            stroke: s.color,
            width: 2,
            // pontos visíveis só em série curta (em range longo viram ruído)
            points: { show: this.labels.length <= 45, size: 5, fill: s.color },
          })),
        ],
      };
      this.chart = new uPlot(opts, this.plotData, el);
    },
  },
};
</script>

<style scoped>
/* overrides do tema dark na legenda/cursor gerados pelo uPlot */
.uplot-wrap :deep(.u-legend) { color: #9b9b9b; font-size: 12px; }
.uplot-wrap :deep(.u-legend .u-marker) { border-radius: 9999px; }
.uplot-wrap :deep(.uplot) { font-family: inherit; }
</style>
