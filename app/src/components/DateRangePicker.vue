<template>
  <div class="relative" ref="root">
    <div class="field flex cursor-pointer items-center gap-1.5 !py-0 !pl-0 !pr-2" :class="{ 'border-accent': open }" :style="widthStyle">
      <button type="button" class="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2.5 text-left text-[12px]" @click="toggle">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5 flex-shrink-0 text-faint"><rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M3 8h14M7 3v3M13 3v3" stroke-linecap="round" /></svg>
        <span class="truncate" :class="{ 'text-faint': !hasValue }">{{ triggerLabel }}</span>
      </button>
      <button
        v-if="hasValue"
        type="button"
        class="grid h-4 w-4 flex-shrink-0 place-items-center text-faint transition-colors hover:text-txt"
        aria-label="Limpar"
        @click.stop="clear"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
      </button>
      <svg viewBox="0 0 20 20" class="h-4 w-4 flex-shrink-0 text-faint" fill="none" stroke="currentColor" stroke-width="1.5" @click="toggle"><path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </div>

    <transition name="dd">
      <div v-if="open" class="absolute right-0 z-50 mt-1 rounded-lg border border-ink-line bg-ink-700 p-3 shadow-xl">
        <div class="mb-1.5 px-0.5 text-[11px] text-faint">
          {{ anchor ? 'Clique na data final (ou na mesma para um dia só)' : 'Clique na data inicial' }}
        </div>
        <CalendarGrid
          :from="draft.from"
          :to="draft.to"
          :hover="hoverYmd"
          :initial="draft.from || draft.to"
          @pick="onPick"
          @hover="(v) => (hoverYmd = v)"
        />
        <div class="mt-2 flex items-center justify-between border-t border-ink-500 pt-2">
          <button type="button" class="rounded-md px-2 py-1 text-[12px] text-faint transition-colors hover:text-txt" @click="clear">Limpar</button>
          <div class="text-[11px] text-muted">{{ triggerLabel }}</div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
import CalendarGrid from './CalendarGrid.vue';
import { fmtBR, cmpYMD } from '../date';

export default {
  name: 'DateRangePicker',
  components: { CalendarGrid },
  props: {
    from: { type: String, default: '' }, // YYYY-MM-DD
    to: { type: String, default: '' },   // YYYY-MM-DD
    width: { type: String, default: '' }, // ex.: '16rem' (default: fluido)
  },
  emits: ['change'],
  data() {
    return {
      open: false,
      draft: { from: this.from || '', to: this.to || '' },
      anchor: null,   // 1º clique aguardando o fim
      hoverYmd: '',
    };
  },
  computed: {
    hasValue() { return !!(this.draft.from || this.draft.to); },
    widthStyle() { return this.width ? { width: this.width } : {}; },
    triggerLabel() {
      const a = fmtBR(this.draft.from);
      const b = fmtBR(this.draft.to);
      if (a && b) return `${a} – ${b}`;
      if (a) return `${a} – …`;
      return 'Qualquer data';
    },
  },
  watch: {
    from(v) { if (!this.open) this.draft.from = v || ''; },
    to(v) { if (!this.open) this.draft.to = v || ''; },
  },
  methods: {
    toggle() { this.open ? this.close() : this.openMenu(); },
    openMenu() {
      this.draft = { from: this.from || '', to: this.to || '' };
      this.anchor = null;
      this.hoverYmd = '';
      this.open = true;
      this.$nextTick(() => {
        document.addEventListener('mousedown', this.onDoc);
        document.addEventListener('keydown', this.onEsc);
      });
    },
    onPick(v) {
      if (!this.anchor) {
        // 1º clique: início; zera o fim e aguarda 2º clique
        this.draft = { from: v, to: '' };
        this.anchor = v;
        return;
      }
      // 2º clique: fecha o intervalo (ordena; mesmo dia = 1 dia só)
      let a = this.anchor;
      let b = v;
      if (cmpYMD(a, b) > 0) [a, b] = [b, a];
      this.draft = { from: a, to: b };
      this.anchor = null;
      this.hoverYmd = '';
      this.emitChange();
      this.close();
    },
    emitChange() {
      this.$emit('change', { from: this.draft.from || '', to: this.draft.to || '' });
    },
    clear() {
      this.draft = { from: '', to: '' };
      this.anchor = null;
      this.hoverYmd = '';
      this.$emit('change', { from: '', to: '' });
      this.close();
    },
    onDoc(e) { if (this.$refs.root && !this.$refs.root.contains(e.target)) this.commitAndClose(); },
    onEsc(e) { if (e.key === 'Escape') this.commitAndClose(); },
    // fechar por fora/Esc: se só o início foi escolhido, aplica como dia único
    commitAndClose() {
      if (this.anchor && this.draft.from && !this.draft.to) {
        this.draft.to = this.draft.from;
        this.emitChange();
      }
      this.close();
    },
    close() {
      this.open = false;
      this.anchor = null;
      document.removeEventListener('mousedown', this.onDoc);
      document.removeEventListener('keydown', this.onEsc);
    },
  },
  beforeUnmount() {
    document.removeEventListener('mousedown', this.onDoc);
    document.removeEventListener('keydown', this.onEsc);
  },
};
</script>

<style scoped>
.dd-enter-active, .dd-leave-active { transition: opacity .12s ease, transform .12s ease; }
.dd-enter-from, .dd-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
