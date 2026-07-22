<template>
  <div class="thin-scroll h-full space-y-4 overflow-y-auto p-1">
    <!-- preferências (escopo de app — localStorage basalt.*) -->
    <section class="rounded-lg border border-ink-500 bg-ink-850 p-3">
      <div class="mb-2 text-[13px] font-medium text-txt">Auto-pull</div>
      <div class="flex items-center gap-3">
        <label class="w-44 flex-shrink-0 text-[13px] text-muted">Intervalo</label>
        <Dropdown :value="intervalMs" :options="intervalOptions" class="w-56" @input="setInterval_" />
      </div>
      <p class="mt-1.5 pl-[11.75rem] text-[12px] leading-relaxed text-faint">
        {{ intervalMs === '0' ? 'O Basalt só sincroniza quando você clicar no botão de sync.' : 'O Basalt puxa mudanças do remoto automaticamente nesse intervalo.' }}
      </p>

      <div class="mt-3 flex items-center gap-3">
        <label class="w-44 flex-shrink-0 text-[13px] text-muted">Quando houver conflito</label>
        <Dropdown :value="strategy" :options="strategyOptions" class="w-56" @input="setStrategy" />
      </div>
      <p class="mt-1.5 pl-[11.75rem] text-[12px] leading-relaxed text-faint">{{ strategyHint }}</p>

      <div class="mt-3 flex items-center gap-3 border-t border-ink-500/60 pt-3">
        <span class="w-44 flex-shrink-0 text-[13px] text-muted">Último pull</span>
        <span class="text-[13px] text-txt">{{ lastPullLabel }}</span>
      </div>
    </section>

    <!-- recuperação: commits não enviados + mudanças guardadas por conflito -->
    <section v-if="recovery && (recovery.ahead > 0 || recovery.stashCount > 0)" class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <div class="mb-1 text-[13px] font-medium text-amber-200">Sincronização precisa de atenção</div>

      <div v-if="recovery.ahead > 0" class="mt-2 flex items-center gap-3">
        <span class="min-w-0 flex-1 text-[12px] leading-relaxed text-muted">
          {{ recovery.ahead }} {{ recovery.ahead === 1 ? 'mudança sua ainda não foi enviada' : 'mudanças suas ainda não foram enviadas' }} ao servidor (elas estão salvas aqui).
        </span>
        <button class="flex-shrink-0 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-ink-900 hover:brightness-110 disabled:opacity-50" :disabled="busy" @click="pushNow">
          {{ busy ? '…' : 'Enviar agora' }}
        </button>
      </div>

      <div v-if="recovery.stashCount > 0" class="mt-3 flex items-center gap-3 border-t border-amber-500/20 pt-3">
        <span class="min-w-0 flex-1 text-[12px] leading-relaxed text-muted">
          {{ recovery.stashCount }} {{ recovery.stashCount === 1 ? 'mudança foi guardada' : 'mudanças foram guardadas' }} por um conflito de sincronização. Nada foi perdido — recupere para trazê-las de volta.
        </span>
        <button class="flex-shrink-0 rounded-md border border-amber-400/50 px-3 py-1.5 text-[12px] font-medium text-amber-200 hover:bg-amber-500/15 disabled:opacity-50" :disabled="busy" @click="recover">
          {{ busy ? '…' : 'Recuperar' }}
        </button>
      </div>

      <p v-if="recoveryMsg" class="mt-2 text-[12px]" :class="recoveryOk ? 'text-green-300' : 'text-red-300'">{{ recoveryMsg }}</p>
    </section>

    <!-- saúde do git (GET /health/git) -->
    <section class="rounded-lg border border-ink-500 bg-ink-850 p-3">
      <div class="mb-2 flex items-center gap-2">
        <span class="text-[13px] font-medium text-txt">Saúde do git</span>
        <span
          v-if="health"
          class="pill border"
          :class="health.ok ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'"
        >{{ health.ok ? 'tudo OK' : 'atenção' }}</span>
        <div class="flex-1"></div>
        <button class="icon-btn h-7 w-7" title="Atualizar" :disabled="loading" @click="refresh">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4" :class="{ 'animate-spin': loading }">
            <path d="M16 10a6 6 0 1 1-1.8-4.3" stroke-linecap="round" />
            <path d="M15 3v3h-3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <div v-if="health" class="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-faint">
        <span>branch: <span class="text-muted">{{ health.branch || '—' }}</span></span>
        <span>user: <span class="text-muted">{{ health.user ? (health.user.name + ' <' + health.user.email + '>') : '— não configurado' }}</span></span>
        <span>remote: <span class="text-muted">{{ health.remoteUrl || '— nenhum' }}</span></span>
      </div>

      <ul v-if="checks.length" class="space-y-1.5">
        <li
          v-for="c in checks"
          :key="c.id"
          class="flex items-start gap-2.5 rounded-md border p-2"
          :class="c.ok ? 'border-ink-500 bg-ink-800' : 'border-red-500/30 bg-red-500/5'"
        >
          <span class="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full" :class="c.ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'">
            <svg v-if="c.ok" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" class="h-3 w-3"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <svg v-else viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="h-3 w-3"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-[12px] text-txt">{{ c.label }}</div>
            <div class="truncate text-[11px] text-faint" :title="c.detail">{{ c.detail }}</div>
          </div>
        </li>
      </ul>
      <div v-else-if="!loading" class="py-3 text-center text-[12px] text-faint">{{ error || 'Sem dados do git.' }}</div>
    </section>
  </div>
</template>

<script>
// Aba "Sync" das Configurações: intervalo do auto-pull + estratégia em conflito
// (prefs de APP em localStorage basalt.*) + painel do GET /health/git.
// Salvar dispara `sync-prefs-changed` (window) — o App re-agenda o auto-pull ao vivo.
import Dropdown from './Dropdown.vue';
import { getHealthGit, getSyncRecovery, syncPushNow, syncRecover } from '../api';

const intervalKey = 'basalt.pullIntervalMs';
const strategyKey = 'basalt.pullStrategy';

const STRATEGY_HINTS = {
  rebase: 'O remoto vence: rebase automático das suas mudanças por cima dele, com aviso quando não der.',
  safe: 'Só aplica quando dá fast-forward; divergência não toca seus arquivos e te avisa.',
  ask: 'Em divergência o Basalt abre um modal perguntando o que fazer.',
};

export default {
  name: 'SyncSettings',
  components: { Dropdown },
  props: {
    lastPullAt: { type: Number, default: null }, // timestamp do último pull OK (vem do App)
  },
  data() {
    return {
      intervalMs: this.loadInterval(),
      strategy: this.loadStrategy(),
      health: null,
      loading: false,
      error: '',
      recovery: null,
      busy: false,
      recoveryMsg: '',
      recoveryOk: false,
      intervalOptions: [
        { value: '0', label: 'Desligado' },
        { value: '30000', label: '30 segundos' },
        { value: '60000', label: '1 minuto' },
        { value: '300000', label: '5 minutos' },
        { value: '900000', label: '15 minutos' },
      ],
      strategyOptions: [
        { value: 'rebase', label: 'Remoto vence (rebase) + avisar' },
        { value: 'safe', label: 'Só fast-forward (seguro)' },
        { value: 'ask', label: 'Perguntar' },
      ],
    };
  },
  computed: {
    checks() { return (this.health && Array.isArray(this.health.checks)) ? this.health.checks : []; },
    strategyHint() { return STRATEGY_HINTS[this.strategy] || ''; },
    lastPullLabel() {
      if (!this.lastPullAt) return '—';
      const d = new Date(this.lastPullAt);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
  },
  created() {
    this.refresh();
    this.refreshRecovery();
  },
  methods: {
    async refreshRecovery() {
      try { this.recovery = await getSyncRecovery(); } catch (e) { this.recovery = null; }
    },
    async pushNow() {
      this.busy = true; this.recoveryMsg = '';
      try {
        const r = await syncPushNow();
        this.recovery = { ahead: r.ahead, hasUpstream: r.hasUpstream, stashCount: r.stashCount };
        this.recoveryOk = r.ok !== false;
        this.recoveryMsg = this.recoveryOk ? 'Enviado.' : (r.error || 'Falha ao enviar.');
      } catch (e) { this.recoveryOk = false; this.recoveryMsg = e.message || 'Falha ao enviar.'; }
      finally { this.busy = false; }
    },
    async recover() {
      this.busy = true; this.recoveryMsg = '';
      try {
        const r = await syncRecover();
        this.recovery = { ahead: r.ahead, hasUpstream: r.hasUpstream, stashCount: r.stashCount };
        this.recoveryOk = r.ok !== false;
        this.recoveryMsg = this.recoveryOk ? 'Mudanças recuperadas.' : (r.error || 'Não deu pra recuperar automaticamente.');
      } catch (e) { this.recoveryOk = false; this.recoveryMsg = e.message || 'Falha na recuperação.'; }
      finally { this.busy = false; }
    },
    loadInterval() {
      try {
        const v = localStorage.getItem(intervalKey);
        return ['0', '30000', '60000', '300000', '900000'].includes(v) ? v : '60000';
      } catch (e) { return '60000'; }
    },
    loadStrategy() {
      try {
        const v = localStorage.getItem(strategyKey);
        return ['rebase', 'safe', 'ask'].includes(v) ? v : 'rebase';
      } catch (e) { return 'rebase'; }
    },
    setInterval_(v) {
      if (!v) return;
      this.intervalMs = v;
      try { localStorage.setItem(intervalKey, v); } catch (e) { /* ignore */ }
      this.emitChanged();
    },
    setStrategy(v) {
      if (!v) return;
      this.strategy = v;
      try { localStorage.setItem(strategyKey, v); } catch (e) { /* ignore */ }
      this.emitChanged();
    },
    emitChanged() {
      try { window.dispatchEvent(new CustomEvent('sync-prefs-changed')); } catch (e) { /* ignore */ }
    },
    async refresh() {
      this.loading = true;
      this.error = '';
      try {
        this.health = await getHealthGit();
      } catch (e) {
        this.health = null;
        this.error = e.message || 'Falha ao consultar o git.';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>
