<template>
  <div class="fixed inset-0 z-[60] grid place-items-center bg-black/50" @mousedown.self="$emit('cancel')">
    <div class="flex max-h-[88vh] w-[520px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-ink-500 bg-ink-800 shadow-2xl">
      <header class="flex h-12 flex-shrink-0 items-center border-b border-ink-500 px-4">
        <span class="text-[14px] font-medium text-txt">{{ isNew ? 'Novo gráfico' : 'Editar gráfico' }}</span>
        <div class="flex-1"></div>
        <button class="icon-btn h-7 w-7" title="Fechar" @click="$emit('cancel')">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M13 7l-6 6M7 7l6 6" stroke-linecap="round" /></svg>
        </button>
      </header>

      <div class="thin-scroll flex-1 space-y-3 overflow-y-auto p-4">
        <div>
          <label class="lbl">Tipo de gráfico</label>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="t in TYPES"
              :key="t.id"
              type="button"
              class="flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] transition-colors"
              :class="draft.type === t.id ? 'border-accent bg-accent/10 text-txt' : 'border-ink-500 text-faint hover:text-muted'"
              @click="draft.type = t.id"
            >
              <span v-html="t.icon" class="text-muted"></span>
              {{ t.label }}
            </button>
          </div>
        </div>

        <div>
          <label class="lbl">Título <span class="text-faint">(opcional)</span></label>
          <input v-model="draft.title" class="field h-8 text-[13px]" :placeholder="autoTitle" />
        </div>

        <div>
          <label class="lbl">Medida</label>
          <div class="flex gap-2">
            <Dropdown class="flex-1" :value="draft.measure.agg" :options="aggOptions" @input="setAgg" />
            <Dropdown
              v-if="needsProp"
              class="flex-1"
              :value="draft.measure.prop"
              :options="numericOptions"
              placeholder="Propriedade"
              @input="(v) => (draft.measure.prop = v)"
            />
          </div>
          <p v-if="needsProp && !numericOptions.length" class="mt-1 text-[11px] text-amber-300">
            Nenhuma propriedade numérica (int/fórmula) no schema.
          </p>
        </div>

        <div v-if="draft.type !== 'line' && draft.measure.agg !== 'leadtime'">
          <label class="lbl">Base</label>
          <Dropdown :value="draft.basis" :options="basisOptions" @input="(v) => (draft.basis = v)" />
        </div>

        <div v-if="draft.type === 'bar' || draft.type === 'pie'">
          <label class="lbl">Agrupar por</label>
          <Dropdown :value="draft.dim" :options="dimOptions" placeholder="Propriedade" clearable @input="(v) => (draft.dim = v)" />
        </div>

        <template v-if="draft.type === 'line'">
          <div>
            <label class="lbl">Data (eixo do tempo)</label>
            <Dropdown :value="draft.dateProp" :options="dateOptions" @input="(v) => (draft.dateProp = v)" />
          </div>
          <div>
            <label class="lbl">Agrupamento temporal</label>
            <Dropdown :value="draft.bucket" :options="bucketOptions" @input="(v) => (draft.bucket = v)" />
          </div>
        </template>

        <template v-if="draft.type === 'bar' || draft.type === 'pie'">
          <div class="flex gap-2">
            <div class="flex-1">
              <label class="lbl">Ordenar por</label>
              <Dropdown :value="draft.sort" :options="sortOptions" @input="(v) => (draft.sort = v)" />
            </div>
            <div class="flex-1">
              <label class="lbl">Direção</label>
              <Dropdown :value="draft.dir" :options="dirOptions" @input="(v) => (draft.dir = v)" />
            </div>
          </div>
          <div class="flex gap-2">
            <div class="flex-1">
              <label class="lbl">Limite (top N)</label>
              <input v-model.number="draft.limit" type="number" min="1" class="field h-8 text-[13px]" placeholder="todos" />
            </div>
            <div v-if="draft.type === 'bar'" class="flex-1">
              <label class="lbl">Orientação</label>
              <Dropdown :value="draft.orientation" :options="orientOptions" @input="(v) => (draft.orientation = v)" />
            </div>
          </div>
        </template>

        <div>
          <label class="lbl">Largura ({{ draft.w }}/12 colunas)</label>
          <input v-model.number="draft.w" type="range" min="1" max="12" class="w-full accent-accent" />
        </div>
      </div>

      <footer class="flex flex-shrink-0 items-center gap-2 border-t border-ink-500 px-4 py-3">
        <div class="flex-1"></div>
        <button class="rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-ink-700" @click="$emit('cancel')">Cancelar</button>
        <button class="rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-ink-900 hover:brightness-110" @click="apply">
          {{ isNew ? 'Adicionar' : 'Aplicar' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script>
import Dropdown from './Dropdown.vue';

const TYPES = [
  { id: 'kpi', label: 'Número', icon: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 13V7M10 13V5M14 13v-3" stroke-linecap="round"/></svg>' },
  { id: 'bar', label: 'Barras', icon: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 6h9M4 10h6M4 14h11" stroke-linecap="round"/></svg>' },
  { id: 'line', label: 'Linha', icon: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 14l4-5 3 3 5-6" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'pie', label: 'Pizza', icon: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="10" cy="10" r="6"/><path d="M10 10V4M10 10l5 3" stroke-linecap="round"/></svg>' },
];

// defaults por tipo ao criar ou trocar de tipo
function baseDraft(type) {
  return {
    type,
    title: '',
    w: type === 'kpi' ? 3 : 6,
    measure: { agg: 'count', prop: null },
    basis: type === 'line' ? 'created' : 'all',
    dim: null,
    sort: 'value',
    dir: 'desc',
    limit: null,
    orientation: 'horizontal',
    dateProp: 'created_at',
    bucket: 'day',
  };
}

export default {
  name: 'ChartBuilder',
  components: { Dropdown },
  props: {
    chart: { type: Object, default: null }, // null = novo
    schema: { type: Object, default: () => ({}) },
  },
  emits: ['save', 'cancel'],
  data() {
    const d = this.chart ? { ...baseDraft(this.chart.type || 'bar'), ...this.chart, measure: { agg: 'count', prop: null, ...(this.chart.measure || {}) } } : baseDraft('bar');
    return { TYPES, draft: d };
  },
  computed: {
    isNew() { return !this.chart; },
    props() { return this.schema.properties || {}; },
    numericOptions() {
      return Object.keys(this.props)
        .filter((k) => ['int', 'formula'].includes(this.props[k].type))
        .map((k) => ({ value: k, label: this.props[k].label || k }));
    },
    dimOptions() {
      const out = Object.keys(this.props)
        .filter((k) => k !== 'status' && ['enum', 'multiselect', 'user', 'boolean'].includes(this.props[k].type))
        .map((k) => ({ value: k, label: this.props[k].label || k }));
      if (this.props.status) out.unshift({ value: 'status', label: this.props.status.label || 'Status' });
      return out;
    },
    dateOptions() {
      return Object.keys(this.props)
        .filter((k) => this.props[k].type === 'datetime')
        .map((k) => ({ value: k, label: this.props[k].label || k }));
    },
    needsProp() { return ['sum', 'avg'].includes(this.draft.measure.agg); },
    aggOptions() {
      const base = [
        { value: 'count', label: 'Contagem' },
        { value: 'sum', label: 'Soma de…' },
        { value: 'avg', label: 'Média de…' },
      ];
      if (this.draft.type === 'kpi') base.push({ value: 'leadtime', label: 'Lead time (dias)' });
      return base;
    },
    basisOptions() {
      return [
        { value: 'all', label: 'Todas as tarefas' },
        { value: 'created', label: 'Criadas no período' },
        { value: 'completed', label: 'Finalizadas no período' },
        { value: 'open', label: 'Em aberto (hoje)' },
      ];
    },
    bucketOptions() {
      return [
        { value: 'day', label: 'Por dia' },
        { value: 'week', label: 'Por semana' },
        { value: 'month', label: 'Por mês' },
      ];
    },
    sortOptions() {
      return [
        { value: 'value', label: 'Valor' },
        { value: 'label', label: 'Rótulo (A→Z)' },
        { value: 'sequence', label: 'Sequência das opções' },
      ];
    },
    dirOptions() {
      return [{ value: 'desc', label: 'Decrescente' }, { value: 'asc', label: 'Crescente' }];
    },
    orientOptions() {
      return [{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }];
    },
    autoTitle() {
      const m = this.draft.measure;
      const verb = m.agg === 'count' ? 'Contagem' : m.agg === 'sum' ? 'Soma' : m.agg === 'avg' ? 'Média' : 'Lead time';
      return verb;
    },
  },
  watch: {
    'draft.type'(nv, ov) {
      // troca de tipo preserva o que é compatível: título/medida/largura sempre;
      // dim/sort/dir/limite entre bar↔pie (antes eram descartados). 'leadtime'
      // só existe no kpi — saindo dele, volta pra contagem.
      const keep = { title: this.draft.title, w: this.draft.w, measure: { ...this.draft.measure } };
      if (nv !== 'kpi' && keep.measure.agg === 'leadtime') keep.measure = { agg: 'count', prop: null };
      const grouped = (t) => t === 'bar' || t === 'pie';
      if (grouped(nv) && grouped(ov)) {
        keep.dim = this.draft.dim;
        keep.sort = this.draft.sort;
        keep.dir = this.draft.dir;
        keep.limit = this.draft.limit;
        keep.basis = this.draft.basis;
      }
      this.draft = { ...baseDraft(nv), ...keep };
    },
  },
  methods: {
    setAgg(v) {
      this.draft.measure = { ...this.draft.measure, agg: v };
      if (!['sum', 'avg'].includes(v)) this.draft.measure.prop = null;
      else if (!this.draft.measure.prop && this.numericOptions.length) this.draft.measure.prop = this.numericOptions[0].value;
      // leadtime = criação→conclusão: com o seletor de base oculto, uma base
      // 'open' presa deixava o KPI eternamente em "—"
      if (v === 'leadtime') this.draft.basis = 'completed';
    },
    apply() {
      const out = { ...this.draft };
      if (!out.limit || out.limit < 1) out.limit = null;
      this.$emit('save', out);
    },
  },
};
</script>

<style scoped>
.lbl { @apply mb-1 block text-[12px] font-medium text-faint; }
</style>
