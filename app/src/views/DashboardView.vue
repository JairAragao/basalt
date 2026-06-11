<template>
  <div class="thin-scroll h-full overflow-y-auto">
    <div class="mx-auto max-w-[1100px] p-5">
      <!-- controles: período + prop enum -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <h1 class="text-[15px] font-medium text-txt">Dashboard</h1>
        <div class="flex-1"></div>
        <Dropdown :value="rangeMode" :options="rangeOptions" class="w-44" @input="setRangeMode" />
        <template v-if="rangeMode === 'custom'">
          <!-- exceção documentada no design: input date nativo com color-scheme dark -->
          <input v-model="customFrom" type="date" class="field date-dark w-36" aria-label="Data inicial" @change="persistRange" />
          <span class="text-[12px] text-faint">até</span>
          <input v-model="customTo" type="date" class="field date-dark w-36" aria-label="Data final" @change="persistRange" />
        </template>
        <Dropdown
          v-if="enumOptions.length"
          :value="enumKeyValid"
          :options="enumOptions"
          placeholder="Agrupar por"
          clearable
          class="w-44"
          @input="setEnumKey"
        />
      </div>

      <!-- CTA: vault sem semântica de conclusão -->
      <div v-if="!doneConfigured" class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 p-4">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-5 w-5 flex-shrink-0 text-accent"><circle cx="10" cy="10" r="7" /><path d="M10 6.5v4M10 13.5h.01" stroke-linecap="round" /></svg>
        <div class="min-w-0 flex-1 text-[13px] text-muted">
          Este vault não tem grupo de conclusão definido — finalizadas e lead time ficam sem dado.
          Marque o grupo de conclusão em <strong class="text-txt">Configurações &gt; Status</strong>.
        </div>
        <button
          type="button"
          class="flex h-8 flex-shrink-0 items-center rounded-md bg-accent px-3 text-[13px] font-medium text-white hover:brightness-110"
          @click="$emit('open-settings')"
        >Abrir configurações</button>
      </div>

      <!-- vault sem nenhuma tarefa -->
      <div v-if="!tasks.length" class="grid place-items-center rounded-lg border border-ink-500 bg-ink-850 py-16 text-center">
        <div>
          <div class="text-[14px] font-medium text-muted">Nenhuma tarefa neste vault ainda.</div>
          <div class="mt-1 text-[12px] text-faint">Crie tarefas na view Tarefas — os relatórios aparecem aqui.</div>
        </div>
      </div>

      <template v-else>
        <!-- cards de número -->
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="num-card">
            <div class="num-label">Criadas</div>
            <div class="num-value">{{ report.counts.created }}</div>
            <div class="num-hint">no período</div>
          </div>
          <div class="num-card">
            <div class="num-label">Finalizadas</div>
            <div class="num-value">{{ completedLabel }}</div>
            <div v-if="report.counts.completedNoDate > 0" class="num-hint text-accent" :title="'Tarefas concluídas antes do carimbo automático existir — fora do gráfico.'">
              +{{ report.counts.completedNoDate }} concluída(s) sem data
            </div>
            <div v-else class="num-hint">no período</div>
          </div>
          <div class="num-card">
            <div class="num-label">Abertas</div>
            <div class="num-value">{{ doneConfigured ? report.counts.open : '—' }}</div>
            <div class="num-hint">hoje</div>
          </div>
          <div class="num-card">
            <div class="num-label">Lead time médio</div>
            <div class="num-value">{{ leadTimeLabel }}</div>
            <div class="num-hint">criação → conclusão</div>
          </div>
        </div>

        <!-- linha: criadas × finalizadas -->
        <div class="mt-4 rounded-lg border border-ink-500 bg-ink-850 p-4">
          <div class="mb-2 text-[13px] font-medium text-muted">Criadas × Finalizadas <span class="text-faint">({{ bucket === 'week' ? 'por semana' : 'por dia' }})</span></div>
          <UplotChart :labels="report.series.labels" :series="chartSeries" />
        </div>

        <!-- barras: por usuário + por enum -->
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <div class="rounded-lg border border-ink-500 bg-ink-850 p-4">
            <div class="mb-3 text-[13px] font-medium text-muted">Criadas por usuário</div>
            <BarList :rows="byUserCreated" :color="colorCreated" aria-label="Tarefas criadas por usuário" />
          </div>
          <div class="rounded-lg border border-ink-500 bg-ink-850 p-4">
            <div class="mb-3 text-[13px] font-medium text-muted">Finalizadas por usuário</div>
            <BarList :rows="byUserCompleted" :color="colorCompleted" aria-label="Tarefas finalizadas por usuário" />
          </div>
          <div v-if="report.byEnum" class="rounded-lg border border-ink-500 bg-ink-850 p-4 md:col-span-2">
            <div class="mb-3 text-[13px] font-medium text-muted">Criadas por {{ report.byEnum.label }}</div>
            <BarList :rows="enumRows" :color="colorEnum" :aria-label="'Tarefas criadas por ' + report.byEnum.label" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
import Dropdown from '../components/Dropdown.vue';
import UplotChart from '../components/UplotChart.vue';
import BarList from '../components/BarList.vue';
import { buildReport, dayKey } from '../reports';
import { PALETTE } from '../palette';

const rangeKey = 'basalt.dashRange';
const enumPrefKey = 'basalt.dashEnumKey';
const rangeModes = ['7', '30', '90', '365', 'all', 'custom'];

// cores das séries vêm da paleta do projeto (palette.js) — sem hex inventado
const colorCreated = PALETTE.find((p) => p.name === 'Âmbar').value;   // accent #d9a01e
const colorCompleted = PALETTE.find((p) => p.name === 'Verde').value; // #4caf72
const colorEnum = PALETTE.find((p) => p.name === 'Azul').value;

export default {
  name: 'DashboardView',
  components: { Dropdown, UplotChart, BarList },
  props: {
    // dados vindos do App (GET /config + /tasks + /users já carregados e
    // atualizados pelo auto-pull — evita fetch duplicado e drift)
    config: { type: Object, required: true },
    tasks: { type: Array, default: () => [] },
    users: { type: Array, default: () => [] },
  },
  emits: ['open-settings'],
  data() {
    return {
      colorCreated,
      colorCompleted,
      colorEnum,
      rangeMode: '30',
      customFrom: '',
      customTo: '',
      enumKey: null,
      rangeOptions: [
        { value: '7', label: 'Últimos 7 dias' },
        { value: '30', label: 'Últimos 30 dias' },
        { value: '90', label: 'Últimos 90 dias' },
        { value: '365', label: 'Últimos 365 dias' },
        { value: 'all', label: 'Tudo' },
        { value: 'custom', label: 'Personalizado' },
      ],
    };
  },
  computed: {
    schema() { return this.config.schema || {}; },
    doneStageIds() { return this.config.doneStageIds || []; },
    doneConfigured() { return !!(this.config.board && this.config.board.doneGroupId); },
    // props enum do schema (seletor "agrupar por"; some se não houver nenhuma)
    enumOptions() {
      const props = this.schema.properties || {};
      return Object.keys(props)
        .filter((k) => props[k] && props[k].type === 'enum')
        .map((k) => ({ value: k, label: props[k].label || k }));
    },
    // pref salva pode apontar pra prop que não existe mais → ignora
    enumKeyValid() {
      return this.enumOptions.some((o) => o.value === this.enumKey) ? this.enumKey : null;
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
    bucket() {
      // chaves 'YYYY-MM-DD' parseiam como UTC dos 2 lados → diff exata em dias
      const spanDays = (new Date(this.range.to) - new Date(this.range.from)) / 86400000 + 1;
      return spanDays > 31 ? 'week' : 'day';
    },
    report() {
      return buildReport({
        tasks: this.tasks,
        schema: this.schema,
        doneStageIds: this.doneStageIds,
        users: this.users,
        range: this.range,
        bucket: this.bucket,
        enumKey: this.enumKeyValid,
      });
    },
    chartSeries() {
      return [
        { label: 'Criadas', points: this.report.series.created, color: colorCreated },
        { label: 'Finalizadas', points: this.report.series.completed, color: colorCompleted },
      ];
    },
    byUserCreated() {
      return this.report.byUser.filter((u) => u.created > 0).map((u) => ({ label: u.name, count: u.created }));
    },
    byUserCompleted() {
      return this.report.byUser.filter((u) => u.completed > 0).map((u) => ({ label: u.name, count: u.completed }));
    },
    enumRows() {
      return this.report.byEnum ? this.report.byEnum.rows.map((r) => ({ label: r.option, count: r.count })) : [];
    },
    leadTimeLabel() {
      const v = this.report.counts.leadTimeAvgDays;
      return v == null ? '—' : `${String(v).replace('.', ',')} d`;
    },
    // sem done configurado o número só engana — exibe contagem se houver
    // carimbo legado preservado, senão "—"
    completedLabel() {
      if (this.doneConfigured || this.report.counts.completed > 0) return this.report.counts.completed;
      return '—';
    },
  },
  created() {
    this.loadPrefs();
  },
  methods: {
    loadPrefs() {
      try {
        const raw = JSON.parse(localStorage.getItem(rangeKey) || 'null');
        if (raw && rangeModes.includes(raw.mode)) {
          this.rangeMode = raw.mode;
          if (typeof raw.from === 'string') this.customFrom = raw.from;
          if (typeof raw.to === 'string') this.customTo = raw.to;
        }
      } catch (e) { /* pref corrompida → default */ }
      try {
        const k = localStorage.getItem(enumPrefKey);
        if (k) this.enumKey = k;
      } catch (e) { /* ignore */ }
    },
    setRangeMode(v) {
      if (!rangeModes.includes(v)) return;
      this.rangeMode = v;
      if (v === 'custom' && !this.customFrom && !this.customTo) {
        // ponto de partida amigável: últimos 30 dias
        const d = new Date();
        d.setDate(d.getDate() - 29);
        this.customFrom = dayKey(d);
        this.customTo = dayKey(new Date());
      }
      this.persistRange();
    },
    persistRange() {
      try {
        localStorage.setItem(rangeKey, JSON.stringify({
          mode: this.rangeMode,
          from: this.customFrom,
          to: this.customTo,
        }));
      } catch (e) { /* ignore */ }
    },
    setEnumKey(v) {
      this.enumKey = v || null;
      try {
        if (this.enumKey) localStorage.setItem(enumPrefKey, this.enumKey);
        else localStorage.removeItem(enumPrefKey);
      } catch (e) { /* ignore */ }
    },
  },
};
</script>

<style scoped>
/* exceção documentada (design D2.2): date nativo do Chromium/Electron em dark */
.date-dark { color-scheme: dark; }

.num-card {
  @apply rounded-lg border border-ink-500 bg-ink-850 p-4;
}
.num-label {
  @apply text-[12px] font-medium uppercase tracking-wide text-faint;
}
.num-value {
  @apply mt-1 text-[26px] font-semibold leading-tight text-txt;
}
.num-hint {
  @apply mt-0.5 text-[11px] text-faint;
}
</style>
