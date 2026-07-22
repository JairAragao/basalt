<template>
  <div v-if="total > 0" class="flex items-center gap-4">
    <svg :viewBox="`0 0 ${size} ${size}`" :width="size" :height="size" class="flex-shrink-0" :aria-label="ariaLabel">
      <g :transform="`translate(${size / 2}, ${size / 2})`">
        <circle :r="radius" fill="none" :stroke="trackColor" :stroke-width="thickness" />
        <circle
          v-for="seg in segments"
          :key="seg.key"
          :r="radius"
          fill="none"
          :stroke="seg.color"
          :stroke-width="thickness"
          :stroke-dasharray="`${seg.len} ${circumference - seg.len}`"
          :stroke-dashoffset="-seg.offset"
          transform="rotate(-90)"
          class="transition-all duration-200"
        >
          <title>{{ seg.label }}: {{ seg.value }} ({{ seg.pct }}%)</title>
        </circle>
      </g>
    </svg>
    <ul class="min-w-0 flex-1 space-y-1 text-[12px]">
      <li v-for="seg in segments" :key="seg.key" class="flex items-center gap-2">
        <span class="h-2.5 w-2.5 flex-shrink-0 rounded-full" :style="{ background: seg.color }"></span>
        <span class="min-w-0 flex-1 truncate text-muted" :title="seg.label">{{ seg.label }}</span>
        <span class="flex-shrink-0 font-mono text-txt">{{ seg.value }}</span>
        <span class="w-9 flex-shrink-0 text-right text-faint">{{ seg.pct }}%</span>
      </li>
    </ul>
  </div>
  <div v-else class="py-4 text-center text-[12px] text-faint">Sem dados no período.</div>
</template>

<script>
export default {
  name: 'PieChart',
  props: {
    rows: { type: Array, default: () => [] }, // [{ label, value, color }]
    size: { type: Number, default: 132 },
    thickness: { type: Number, default: 22 },
    ariaLabel: { type: String, default: 'Distribuição' },
  },
  computed: {
    radius() { return (this.size - this.thickness) / 2; },
    circumference() { return 2 * Math.PI * this.radius; },
    trackColor() { return '#2f2f2f'; },
    total() { return this.rows.reduce((s, r) => s + (Number(r.value) || 0), 0); },
    segments() {
      const c = this.circumference;
      let acc = 0;
      return this.rows
        .filter((r) => (Number(r.value) || 0) > 0)
        .map((r) => {
          const value = Number(r.value) || 0;
          const frac = value / this.total;
          const len = frac * c;
          const seg = {
            key: r.key || r.label,
            label: r.label,
            value,
            color: r.color || '#6f7787',
            len,
            offset: acc,
            pct: Math.round(frac * 100),
          };
          acc += len;
          return seg;
        });
    },
  },
};
</script>
