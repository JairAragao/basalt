<template>
  <div class="cal" @mouseleave="$emit('hover', '')">
    <div class="mb-2 flex items-center gap-1">
      <button type="button" class="cal-nav" title="Mês anterior" @click="shift(-1)">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4"><path d="M12 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <div class="flex-1 text-center text-[13px] font-medium capitalize text-txt">{{ label }}</div>
      <button type="button" class="cal-nav" title="Próximo mês" @click="shift(1)">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4"><path d="M8 5l5 5-5 5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </div>

    <div class="grid grid-cols-7 gap-0.5">
      <div v-for="(w, i) in weekdays" :key="'w' + i" class="grid h-6 place-items-center text-[11px] text-faint">{{ w }}</div>
    </div>

    <div class="grid grid-cols-7 gap-0.5">
      <button
        v-for="cell in cells"
        :key="cell.ymd"
        type="button"
        class="cal-day"
        :class="cellClass(cell)"
        @click="$emit('pick', cell.ymd)"
        @mouseenter="$emit('hover', cell.ymd)"
      >{{ cell.date.getDate() }}</button>
    </div>
  </div>
</template>

<script>
import { MONTHS_PT, WEEKDAYS_PT, monthMatrix, parseYMD, todayYMD, cmpYMD, ymd } from '../date';

export default {
  name: 'CalendarGrid',
  props: {
    // mês inicial exibido: qualquer YMD/ISO dentro dele (default: hoje ou o 'from')
    initial: { type: String, default: '' },
    single: { type: String, default: '' }, // seleção única (YMD) — modo data
    from: { type: String, default: '' },    // início do intervalo (YMD)
    to: { type: String, default: '' },      // fim do intervalo (YMD)
    hover: { type: String, default: '' },   // dia sob o cursor (preview do intervalo)
  },
  emits: ['pick', 'hover'],
  data() {
    const base = parseYMD(this.initial) || parseYMD(this.single) || parseYMD(this.from) || new Date();
    return { view: { year: base.getFullYear(), month: base.getMonth() } };
  },
  computed: {
    weekdays() { return WEEKDAYS_PT; },
    label() { return `${MONTHS_PT[this.view.month]} ${this.view.year}`; },
    today() { return todayYMD(); },
    cells() {
      return monthMatrix(this.view.year, this.view.month).flat();
    },
    // extremos efetivos do intervalo considerando o preview do hover
    span() {
      let a = this.from;
      let b = this.to || (this.from && this.hover ? this.hover : '');
      if (a && b && cmpYMD(a, b) > 0) [a, b] = [b, a];
      return { a, b };
    },
  },
  watch: {
    // se o mês exibido não contém a nova seleção, pula pra ela
    single(v) { this.jumpTo(v); },
    from(v) { if (!this.to) this.jumpTo(v); },
  },
  methods: {
    shift(delta) {
      let m = this.view.month + delta;
      let y = this.view.year;
      while (m < 0) { m += 12; y--; }
      while (m > 11) { m -= 12; y++; }
      this.view = { year: y, month: m };
    },
    jumpTo(v) {
      const d = parseYMD(v);
      if (d) this.view = { year: d.getFullYear(), month: d.getMonth() };
    },
    cellClass(cell) {
      const c = [];
      if (!cell.inMonth) c.push('cal-day--out');
      if (cell.ymd === this.today) c.push('cal-day--today');
      // modo data única
      if (this.single && cell.ymd === this.single) c.push('cal-day--sel');
      // modo intervalo
      const { a, b } = this.span;
      if (a && b) {
        if (cell.ymd === a || cell.ymd === b) c.push('cal-day--sel');
        else if (cmpYMD(cell.ymd, a) > 0 && cmpYMD(cell.ymd, b) < 0) c.push('cal-day--in');
      } else if (a && cell.ymd === a) {
        c.push('cal-day--sel');
      }
      return c;
    },
    // exposto p/ o pai reposicionar o mês ao abrir
    focusMonth(v) { this.jumpTo(v || ymd(new Date())); },
  },
};
</script>

<style scoped>
.cal { width: 15rem; user-select: none; }
.cal-nav {
  display: inline-flex; align-items: center; justify-content: center;
  height: 1.75rem; width: 1.75rem; border-radius: 0.375rem;
  color: #9b9b9b; background: transparent; border: none; cursor: pointer;
  transition: background .12s, color .12s;
}
.cal-nav:hover { background: #333; color: #e9e9e7; }
.cal-day {
  height: 1.9rem; border-radius: 0.375rem; font-size: 12px; color: #e9e9e7;
  background: transparent; border: 1px solid transparent; cursor: pointer;
  transition: background .1s, color .1s;
}
.cal-day:hover { background: #333; }
.cal-day--out { color: #5a5a5a; }
.cal-day--today { border-color: #4a4a4a; }
.cal-day--in { background: rgba(232, 135, 58, 0.16); border-radius: 0; }
.cal-day--sel { background: #e8873a; color: #191919; font-weight: 600; }
.cal-day--sel:hover { background: #e5ab26; }
</style>
