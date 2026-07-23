<template>
  <div class="thin-scroll h-full overflow-y-auto">
    <div class="mx-auto max-w-[1200px] p-5">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <h1 class="text-[15px] font-medium text-txt">Dashboard</h1>
        <div class="flex-1"></div>
        <Dropdown :value="rangeMode" :options="rangeOptions" class="w-44" @input="setRangeMode" />
        <DateRangePicker
          v-if="rangeMode === 'custom'"
          class="w-60"
          :from="customFrom"
          :to="customTo"
          @change="onCustomRange"
        />
        <template v-if="!editing">
          <button
            class="flex h-8 items-center gap-1.5 rounded-md border border-ink-500 px-3 text-[13px] text-muted transition-colors hover:text-txt"
            @click="enterEdit"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><path d="M4 13.5V16h2.5l7-7L11 6.5l-7 7ZM12.5 5l1.2-1.2a1.2 1.2 0 0 1 1.7 0l.8.8a1.2 1.2 0 0 1 0 1.7L15 7.5 12.5 5Z" stroke-linejoin="round"/></svg>
            Editar
          </button>
        </template>
        <template v-else>
          <button class="flex h-8 items-center gap-1.5 rounded-md border border-ink-500 px-3 text-[13px] text-muted hover:text-txt" @click="openBuilder(null)">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4"><path d="M10 4v12M4 10h12" stroke-linecap="round"/></svg>
            Gráfico
          </button>
          <button class="h-8 rounded-md px-3 text-[13px] text-muted hover:bg-ink-700" :disabled="saving" @click="cancelEdit">Cancelar</button>
          <button class="flex h-8 items-center rounded-md bg-accent px-3 text-[13px] font-medium text-ink-900 hover:brightness-110 disabled:opacity-50" :disabled="saving" @click="applyEdit">
            {{ saving ? 'Salvando…' : 'Salvar' }}
          </button>
        </template>
      </div>

      <div v-if="editing" class="mb-3 flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-[12px] text-muted">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 flex-shrink-0 text-accent"><path d="M10 6.5v4M10 13.5h.01" stroke-linecap="round"/><circle cx="10" cy="10" r="7"/></svg>
        Modo edição — arraste pela alça p/ reordenar, puxe a borda direita p/ redimensionar. Salve para versionar no git.
      </div>

      <div v-if="!doneConfigured && charts.length" class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 p-3 text-[12px] text-muted">
        <span>Sem grupo de conclusão definido — “finalizadas”, “em aberto” e lead time ficam sem dado. Ajuste em Configurações &gt; Status.</span>
        <button class="rounded-md bg-accent px-2.5 py-1 font-medium text-ink-900 hover:brightness-110" @click="$emit('open-settings')">Abrir</button>
      </div>

      <div v-if="loadFailed" class="grid place-items-center rounded-lg border border-red-500/40 bg-red-500/10 py-16 text-center">
        <div class="max-w-sm">
          <div class="text-[14px] font-medium text-red-300">Não foi possível carregar o dashboard.</div>
          <div class="mt-1 text-[12px] text-faint">O servidor pode estar fora. Tente de novo — nada foi alterado.</div>
          <button class="mt-4 rounded-md border border-ink-500 px-3.5 py-1.5 text-[13px] text-muted hover:text-txt" @click="loadDashboard">Tentar de novo</button>
        </div>
      </div>

      <!-- vazio: onboarding -->
      <div v-else-if="!charts.length" class="grid place-items-center rounded-lg border border-ink-500 bg-ink-850 py-16 text-center">
        <div class="max-w-sm">
          <div class="text-[14px] font-medium text-muted">Nenhum gráfico ainda.</div>
          <div class="mt-1 text-[12px] text-faint">Monte um dashboard com os gráficos que quiser — fica salvo no vault e versionado no git.</div>
          <div class="mt-4 flex justify-center gap-2">
            <button class="rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-ink-900 hover:brightness-110" @click="enterEditAndAdd">Criar gráfico</button>
            <button class="rounded-md border border-ink-500 px-3.5 py-1.5 text-[13px] text-muted hover:text-txt" @click="useDefaultTemplate">Usar modelo padrão</button>
          </div>
        </div>
      </div>

      <!-- grade de gráficos (draggable sempre montado; desabilitado fora da edição) -->
      <draggable
        v-else
        v-model="charts"
        tag="div"
        class="dash-grid"
        item-key="id"
        handle=".chart-drag"
        :disabled="!editing"
        :animation="150"
        ghost-class="chart-ghost"
      >
        <template #item="{ element: c }">
          <div class="dash-cell" :style="cellStyle(c)">
            <ChartCard :chart="c" :data="renderOf(c)" :color="accentColor">
              <template v-if="editing" #actions>
                <span class="chart-drag cursor-grab text-faint hover:text-muted" title="Arraste para reordenar">
                  <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><circle cx="7" cy="5" r="1.3"/><circle cx="7" cy="10" r="1.3"/><circle cx="7" cy="15" r="1.3"/><circle cx="13" cy="5" r="1.3"/><circle cx="13" cy="10" r="1.3"/><circle cx="13" cy="15" r="1.3"/></svg>
                </span>
                <button class="icon-btn h-6 w-6" title="Editar" @click="openBuilder(c)">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5"><path d="M4 13.5V16h2.5l7-7L11 6.5l-7 7ZM12.5 5l1.2-1.2a1.2 1.2 0 0 1 1.7 0l.8.8a1.2 1.2 0 0 1 0 1.7L15 7.5 12.5 5Z" stroke-linejoin="round"/></svg>
                </button>
                <button class="icon-btn h-6 w-6 hover:!text-red-300" title="Remover" @click="removeChart(c)">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round"/></svg>
                </button>
              </template>
            </ChartCard>
            <!-- alça de redimensionamento (borda direita) -->
            <div
              v-if="editing"
              class="chart-resize"
              title="Arraste para redimensionar"
              @mousedown.prevent="startResize(c, $event)"
            ></div>
          </div>
        </template>
      </draggable>
    </div>

    <ChartBuilder
      v-if="builderOpen"
      :chart="builderChart"
      :schema="schema"
      @save="onBuilderSave"
      @cancel="builderOpen = false"
    />
  </div>
</template>

<script>
import Dropdown from '../components/Dropdown.vue';
import DateRangePicker from '../components/DateRangePicker.vue';
import ChartCard from '../components/ChartCard.vue';
import ChartBuilder from '../components/ChartBuilder.vue';
import draggable from 'vuedraggable';
import { computeChart, dayKey } from '../reports';
import { getDashboard, saveDashboard } from '../api';
import { PALETTE, DEFAULT_COLOR, colorFor } from '../palette';

const rangeKey = 'basalt.dashRange';
const rangeModes = ['7', '30', '90', '365', 'all', 'custom'];
const accentColor = PALETTE.find((p) => p.name === 'Âmbar').value;

// id local com componente temporal — contador puro colidia com ids já salvos
// após reload (remover/editar atingia o gráfico errado).
let _seq = 0;
function localId() { _seq += 1; return `c_${Date.now().toString(36)}_${_seq}`; }

export default {
  name: 'DashboardView',
  components: { Dropdown, DateRangePicker, ChartCard, ChartBuilder, draggable },
  props: {
    config: { type: Object, required: true },
    tasks: { type: Array, default: () => [] },
    users: { type: Array, default: () => [] },
    vaultPath: { type: String, default: '' },
  },
  emits: ['open-settings'],
  data() {
    return {
      accentColor,
      charts: [],
      savedSnapshot: '[]', // JSON da última versão salva (p/ cancelar)
      editing: false,
      saving: false,
      loadFailed: false,
      builderOpen: false,
      builderChart: null,
      rangeMode: '30',
      customFrom: '',
      customTo: '',
      rangeOptions: [
        { value: '7', label: 'Últimos 7 dias' },
        { value: '30', label: 'Últimos 30 dias' },
        { value: '90', label: 'Últimos 90 dias' },
        { value: '365', label: 'Últimos 365 dias' },
        { value: 'all', label: 'Tudo' },
        { value: 'custom', label: 'Personalizado' },
      ],
      _resize: null,
    };
  },
  computed: {
    schema() { return this.config.schema || {}; },
    doneStageIds() { return this.config.doneStageIds || []; },
    doneConfigured() { return !!(this.config.board && this.config.board.doneGroupId); },
    groupByKey() { return (this.config.board && this.config.board.groupBy) || 'status'; },
    stageColorMap() {
      const map = {};
      const groups = (this.config.board && this.config.board.statusGroups) || [];
      groups.forEach((g) => (g.stages || []).forEach((s) => { if (s && s.id) map[s.id] = s.color || DEFAULT_COLOR; }));
      return map;
    },
    range() {
      const today = dayKey(new Date());
      if (this.rangeMode === 'custom') {
        let from = this.customFrom || today;
        let to = this.customTo || today;
        if (from > to) [from, to] = [to, from];
        return { from, to };
      }
      if (this.rangeMode === 'all') {
        let min = today;
        for (const t of this.tasks) {
          const k = dayKey(t && t.created_at);
          if (k && k < min) min = k;
        }
        return { from: min, to: today };
      }
      const days = parseInt(this.rangeMode, 10) || 30;
      const d = new Date();
      d.setDate(d.getDate() - (days - 1));
      return { from: dayKey(d), to: today };
    },
    ctx() {
      return { tasks: this.tasks, schema: this.schema, doneStageIds: this.doneStageIds, range: this.range };
    },
  },
  watch: {
    // troca de VAULT descarta edição (senão "Salvar" gravava os gráficos do
    // vault antigo por cima do novo). Mudança de config SEM troca de vault
    // (auto-pull, rename de opção) NÃO pode matar a edição em andamento.
    vaultPath() {
      this.editing = false;
      this.builderOpen = false;
      this.loadDashboard();
    },
    config() {
      if (!this.editing) this.loadDashboard();
    },
  },
  created() {
    this.loadPrefs();
    this.loadDashboard();
  },
  methods: {
    async loadDashboard() {
      try {
        const r = await getDashboard();
        this.charts = ((r && r.charts) || []).map((c) => ({ ...c, id: c.id || localId() }));
        this.loadFailed = false;
        this.savedSnapshot = JSON.stringify(this.charts);
      } catch (e) {
        // GET falhou (server fora) — NÃO cai no onboarding vazio, senão "Salvar"
        // gravaria [] por cima do dashboard real. Bloqueia edição e mostra erro.
        this.loadFailed = true;
        this.editing = false;
      }
    },
    // sequência de opções p/ ordenação 'sequence' de um dim
    seqFor(dim) {
      if (!dim) return null;
      if (dim === this.groupByKey || dim === 'status') return Object.keys(this.stageColorMap);
      const prop = (this.schema.properties || {})[dim] || {};
      return Array.isArray(prop.options) ? prop.options : null;
    },
    // resultado colorido de um gráfico (memo leve: recomputa por render — dataset
    // pequeno, custo desprezível)
    renderOf(c) {
      const seqFor = c.dim ? { [c.dim]: this.seqFor(c.dim) } : {};
      const res = computeChart(c, { ...this.ctx, seqFor });
      if ((c.type === 'bar' || c.type === 'pie') && Array.isArray(res.rows)) {
        res.rows = res.rows.map((r) => ({
          ...r,
          label: this.labelForRow(c, r.key, r.label),
          color: this.colorForRow(c, r.key),
        }));
      }
      return res;
    },
    // id de usuário → nome do roster; boolean → Sim/Não (senão sai id/true cru)
    labelForRow(c, key, fallback) {
      const prop = (this.schema.properties || {})[c.dim] || {};
      if (prop.type === 'user') {
        const u = this.users.find((x) => x.id === key);
        if (u) return u.nome || u.id;
      }
      if (prop.type === 'boolean') {
        if (key === 'true') return 'Sim';
        if (key === 'false') return 'Não';
      }
      return fallback;
    },
    colorForRow(c, key) {
      if (key === '(sem valor)' || key === '(removido)' || key === '(total)') return DEFAULT_COLOR;
      const dim = c.dim;
      if (dim === this.groupByKey || dim === 'status') return this.stageColorMap[key] || DEFAULT_COLOR;
      const prop = (this.schema.properties || {})[dim] || {};
      return colorFor(key, prop.optionMeta);
    },
    cellStyle(c) {
      // altura por conteúdo (align-items:start na grade) — nada de row-span fixo
      // que cortava barras/legendas grandes. minHeight só p/ dar respiro visual.
      const minH = c.type === 'kpi' ? 92 : c.type === 'line' ? 240 : 160;
      return { gridColumn: `span ${Math.min(12, Math.max(1, c.w || 6))}`, minHeight: minH + 'px' };
    },
    // ── edição ──
    enterEdit() { if (this.loadFailed) return; this.editing = true; },
    enterEditAndAdd() { this.editing = true; this.openBuilder(null); },
    cancelEdit() {
      this.charts = JSON.parse(this.savedSnapshot);
      this.editing = false;
      this.builderOpen = false;
    },
    async applyEdit() {
      this.saving = true;
      try {
        const r = await saveDashboard(this.charts.map((c) => ({ ...c })));
        this.charts = ((r && r.charts) || []).map((c) => ({ ...c, id: c.id || localId() }));
        this.savedSnapshot = JSON.stringify(this.charts);
        this.editing = false;
      } catch (e) {
        // mantém no modo edição p/ o usuário reagir; toast global não está aqui
        this.charts = this.charts.slice(); // no-op p/ manter reatividade
        alert(e.message || 'Falha ao salvar o dashboard.');
      } finally {
        this.saving = false;
      }
    },
    // ── builder ──
    openBuilder(chart) {
      this.builderChart = chart ? { ...chart } : null;
      this.builderOpen = true;
    },
    onBuilderSave(def) {
      if (this.builderChart && this.builderChart.id) {
        const i = this.charts.findIndex((c) => c.id === this.builderChart.id);
        if (i !== -1) this.charts.splice(i, 1, { ...def, id: this.builderChart.id });
      } else {
        this.charts.push({ ...def, id: localId() });
      }
      this.builderOpen = false;
    },
    removeChart(c) {
      this.charts = this.charts.filter((x) => x.id !== c.id);
    },
    // ── redimensionamento (arrastar borda → muda a coluna-span) ──
    startResize(c, ev) {
      const grid = ev.target.closest('.dash-grid');
      if (!grid) return;
      const colW = grid.clientWidth / 12;
      this._resize = { id: c.id, startX: ev.clientX, startW: c.w || 6, colW };
      window.addEventListener('mousemove', this.onResizeMove);
      window.addEventListener('mouseup', this.stopResize);
    },
    onResizeMove(ev) {
      const r = this._resize;
      if (!r) return;
      const deltaCols = Math.round((ev.clientX - r.startX) / r.colW);
      const w = Math.min(12, Math.max(1, r.startW + deltaCols));
      const c = this.charts.find((x) => x.id === r.id);
      if (c && c.w !== w) c.w = w;
    },
    stopResize() {
      this._resize = null;
      window.removeEventListener('mousemove', this.onResizeMove);
      window.removeEventListener('mouseup', this.stopResize);
    },
    // ── modelo padrão (semeia um dashboard clássico) ──
    useDefaultTemplate() {
      const has = (k) => !!(this.schema.properties || {})[k];
      const t = [];
      t.push({ id: localId(), type: 'kpi', title: 'Criadas', w: 3, measure: { agg: 'count', prop: null }, basis: 'created' });
      t.push({ id: localId(), type: 'kpi', title: 'Finalizadas', w: 3, measure: { agg: 'count', prop: null }, basis: 'completed' });
      t.push({ id: localId(), type: 'kpi', title: 'Em aberto', w: 3, measure: { agg: 'count', prop: null }, basis: 'open' });
      t.push({ id: localId(), type: 'kpi', title: 'Lead time médio', w: 3, measure: { agg: 'leadtime', prop: null }, basis: 'all' });
      t.push({ id: localId(), type: 'line', title: 'Criadas por dia', w: 12, measure: { agg: 'count', prop: null }, dateProp: 'created_at', bucket: 'day', basis: 'created' });
      if (has('status')) {
        t.push({ id: localId(), type: 'bar', title: 'Por status', w: 6, measure: { agg: 'count', prop: null }, basis: 'all', dim: 'status', sort: 'sequence', dir: 'desc', orientation: 'horizontal', limit: null });
        t.push({ id: localId(), type: 'pie', title: 'Distribuição por status', w: 6, measure: { agg: 'count', prop: null }, basis: 'all', dim: 'status', sort: 'value', dir: 'desc', limit: null });
      }
      this.charts = t;
      this.editing = true;
    },
    // ── prefs de período (localStorage) ──
    loadPrefs() {
      try {
        const raw = JSON.parse(localStorage.getItem(rangeKey) || 'null');
        if (raw && rangeModes.includes(raw.mode)) {
          this.rangeMode = raw.mode;
          if (typeof raw.from === 'string') this.customFrom = raw.from;
          if (typeof raw.to === 'string') this.customTo = raw.to;
        }
      } catch (e) { /* default */ }
    },
    setRangeMode(v) {
      if (!rangeModes.includes(v)) return;
      this.rangeMode = v;
      if (v === 'custom' && !this.customFrom && !this.customTo) {
        const d = new Date();
        d.setDate(d.getDate() - 29);
        this.customFrom = dayKey(d);
        this.customTo = dayKey(new Date());
      }
      this.persistRange();
    },
    onCustomRange(r) {
      this.customFrom = (r && r.from) || '';
      this.customTo = (r && r.to) || '';
      this.persistRange();
    },
    persistRange() {
      try { localStorage.setItem(rangeKey, JSON.stringify({ mode: this.rangeMode, from: this.customFrom, to: this.customTo })); } catch (e) { /* ignore */ }
    },
  },
  beforeUnmount() {
    this.stopResize();
  },
};
</script>

<style scoped>
.dash-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-auto-rows: auto;
  align-items: start; /* cada célula cresce só o que o conteúdo pedir (sem esticar) */
  gap: 12px;
}
.dash-cell {
  position: relative;
  min-width: 0;
}
.dash-cell > :deep(.rounded-lg) { height: 100%; }
.chart-ghost { opacity: 0.4; }
.chart-resize {
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 100%;
  cursor: ew-resize;
  border-radius: 0 0.5rem 0.5rem 0;
}
.chart-resize:hover { background: linear-gradient(to right, transparent, rgba(232, 135, 58, 0.35)); }
</style>
