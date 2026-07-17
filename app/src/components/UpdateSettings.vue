<template>
  <div class="thin-scroll h-full space-y-4 overflow-y-auto p-1">
    <!-- versão + verificação -->
    <section class="rounded-lg border border-ink-500 bg-ink-850 p-3">
      <div class="flex items-center gap-2">
        <div>
          <div class="text-[13px] font-medium text-txt">Versão instalada</div>
          <div class="font-mono text-[12px] text-muted">v{{ version || '—' }}</div>
        </div>
        <div class="flex-1"></div>
        <button
          v-if="isElectron && state === 'downloaded'"
          class="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-ink-900 hover:brightness-110"
          @click="install"
        >Reiniciar para aplicar</button>
        <button
          v-else-if="isElectron"
          class="flex h-8 items-center gap-1.5 rounded-md border border-ink-500 px-3 text-[13px] text-txt hover:border-accent hover:bg-ink-800 disabled:opacity-50"
          :disabled="state === 'checking' || state === 'downloading'"
          @click="checkNow"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4" :class="{ 'animate-spin': state === 'checking' }"><path d="M16 10a6 6 0 1 1-1.8-4.3" stroke-linecap="round" /><path d="M15 3v3h-3" stroke-linecap="round" stroke-linejoin="round" /></svg>
          Verificar agora
        </button>
      </div>

      <div v-if="isElectron" class="mt-2 flex items-center gap-2 text-[12px]">
        <span class="h-2 w-2 flex-shrink-0 rounded-full" :style="{ background: statusColor }"></span>
        <span class="text-muted">{{ statusLabel }}</span>
      </div>
      <p v-else class="mt-2 text-[12px] text-faint">
        A atualização automática só funciona no app desktop (Electron). No navegador, baixe a versão nova manualmente pelas releases do GitHub.
      </p>
    </section>

    <!-- auto-verificação (só Electron) -->
    <section v-if="isElectron" class="rounded-lg border border-ink-500 bg-ink-850 p-3">
      <div class="mb-2 text-[13px] font-medium text-txt">Verificação automática</div>
      <div class="flex items-center gap-3">
        <label class="w-44 flex-shrink-0 text-[13px] text-muted">A cada</label>
        <Dropdown :value="intervalMs" :options="intervalOptions" class="w-56" @input="setInterval_" />
      </div>
      <p class="mt-1.5 pl-[11.75rem] text-[12px] leading-relaxed text-faint">
        {{ intervalMs === '0'
          ? 'Desligado — o Basalt só procura atualização quando você clicar em “Verificar agora”.'
          : 'O Basalt procura uma versão nova no GitHub nesse intervalo e avisa quando estiver pronta.' }}
      </p>
    </section>

    <!-- changelog -->
    <section class="rounded-lg border border-ink-500 bg-ink-850 p-3">
      <div class="mb-2 flex items-center gap-2">
        <span class="text-[13px] font-medium text-txt">Novidades das versões</span>
        <div class="flex-1"></div>
        <button class="icon-btn h-7 w-7" title="Recarregar" :disabled="loadingLog" @click="loadChangelog">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4" :class="{ 'animate-spin': loadingLog }"><path d="M16 10a6 6 0 1 1-1.8-4.3" stroke-linecap="round" /><path d="M15 3v3h-3" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>

      <div v-if="loadingLog && !versions.length" class="py-4 text-center text-[12px] text-faint">Carregando…</div>
      <div v-else-if="!versions.length" class="py-4 text-center text-[12px] text-faint">{{ logError || 'Sem changelog.' }}</div>

      <div v-else class="space-y-3">
        <div v-for="v in versions" :key="v.title" class="rounded-md border border-ink-500 bg-ink-800 p-3">
          <div class="mb-1.5 flex items-center gap-2">
            <span class="text-[13px] font-semibold text-txt">{{ v.tag }}</span>
            <span v-if="v.date" class="text-[11px] text-faint">{{ v.date }}</span>
            <span v-if="v.tag === ('v' + version)" class="pill border border-accent/40 bg-accent/10 text-[10px] text-accent">atual</span>
          </div>
          <template v-for="(blk, i) in v.blocks" :key="i">
            <div v-if="blk.type === 'head'" class="mt-2 text-[11px] font-medium uppercase tracking-wide text-faint">{{ blk.text }}</div>
            <ul v-else-if="blk.type === 'list'" class="mt-1 space-y-1">
              <li v-for="(it, j) in blk.items" :key="j" class="flex gap-1.5 text-[12px] leading-relaxed text-muted">
                <span class="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-faint"></span>
                <span>{{ it }}</span>
              </li>
            </ul>
            <p v-else class="mt-1 text-[12px] leading-relaxed text-muted">{{ blk.text }}</p>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
// Aba "Atualizações": status/checagem manual do auto-update (Electron), intervalo
// de auto-verificação (parametrizável, com desligar) e o changelog das versões
// (GET /changelog — CHANGELOG.md empacotado). Ações de update via window.electron.update.
import Dropdown from './Dropdown.vue';
import { getChangelog } from '../api';

const intervalKey = 'basalt.updateIntervalMs';
const INTERVALS = ['0', '1800000', '3600000', '10800000', '21600000', '86400000'];

const STATE_LABELS = {
  idle: 'Pronto para verificar.',
  checking: 'Verificando atualizações…',
  uptodate: 'Você está na versão mais recente.',
  available: 'Baixando atualização…',
  downloading: 'Baixando atualização…',
  downloaded: 'Atualização pronta para instalar.',
  error: 'Falha ao verificar atualização.',
};

export default {
  name: 'UpdateSettings',
  components: { Dropdown },
  props: {
    version: { type: String, default: '' },
  },
  data() {
    return {
      isElectron: !!(window.electron && window.electron.update && window.electron.update.isElectron),
      state: 'idle',
      percent: 0,
      intervalMs: this.loadInterval(),
      intervalOptions: [
        { value: '0', label: 'Desligado' },
        { value: '1800000', label: '30 minutos' },
        { value: '3600000', label: '1 hora' },
        { value: '10800000', label: '3 horas' },
        { value: '21600000', label: '6 horas' },
        { value: '86400000', label: '24 horas' },
      ],
      versions: [],
      loadingLog: false,
      logError: '',
    };
  },
  computed: {
    statusLabel() {
      if (this.state === 'downloading' && this.percent) return `Baixando atualização… ${this.percent}%`;
      return STATE_LABELS[this.state] || '';
    },
    statusColor() {
      if (this.state === 'downloaded' || this.state === 'available' || this.state === 'downloading') return '#d9a01e';
      if (this.state === 'uptodate') return '#4caf72';
      if (this.state === 'error') return '#e0566b';
      return '#6f6f6f';
    },
  },
  created() {
    if (this.isElectron) {
      this._off = window.electron.update.onStatus((s) => {
        if (!s || !s.state) return;
        this.state = s.state;
        if (typeof s.percent === 'number') this.percent = s.percent;
      });
    }
    this.loadChangelog();
  },
  beforeUnmount() { if (this._off) this._off(); },
  methods: {
    loadInterval() {
      try {
        const v = localStorage.getItem(intervalKey);
        return INTERVALS.includes(v) ? v : '10800000';
      } catch (e) { return '10800000'; }
    },
    setInterval_(v) {
      if (!INTERVALS.includes(v)) return;
      this.intervalMs = v;
      try { localStorage.setItem(intervalKey, v); } catch (e) { /* ignore */ }
      // aplica no main + avisa o App (que também re-agenda e checa)
      try { if (window.electron && window.electron.update) window.electron.update.setInterval(Number(v)); } catch (e) { /* noop */ }
      try { window.dispatchEvent(new CustomEvent('update-prefs-changed')); } catch (e) { /* ignore */ }
    },
    checkNow() {
      try { if (window.electron && window.electron.update) window.electron.update.check(); } catch (e) { /* noop */ }
    },
    install() {
      try { if (window.electron && window.electron.update) window.electron.update.install(); } catch (e) { /* noop */ }
    },
    async loadChangelog() {
      this.loadingLog = true;
      this.logError = '';
      try {
        const r = await getChangelog();
        this.versions = this.parseChangelog((r && r.markdown) || '');
      } catch (e) {
        this.logError = e.message || 'Falha ao carregar o changelog.';
      } finally {
        this.loadingLog = false;
      }
    },
    // parse leve do keep-a-changelog: cada "## [x] - data" vira uma versão com
    // blocos (head '###', list '-', ou parágrafo).
    parseChangelog(md) {
      const out = [];
      let cur = null;
      let list = null;
      const pushList = () => { if (list && list.items.length) cur.blocks.push(list); list = null; };
      for (const raw of String(md || '').split(/\r?\n/)) {
        const line = raw.replace(/\s+$/, '');
        const mv = /^##\s+\[?([^\]]+?)\]?\s*(?:-\s*(.+))?$/.exec(line);
        if (/^##\s+/.test(line) && mv) {
          if (cur) pushList();
          const ver = (mv[1] || '').trim();
          cur = { tag: /^\d/.test(ver) ? 'v' + ver : ver, date: (mv[2] || '').trim(), blocks: [] };
          out.push(cur);
          continue;
        }
        if (!cur) continue; // ignora o cabeçalho do arquivo
        if (/^###\s+/.test(line)) { pushList(); cur.blocks.push({ type: 'head', text: line.replace(/^###\s+/, '') }); continue; }
        const mi = /^[-*]\s+(.+)/.exec(line);
        if (mi) { if (!list) list = { type: 'list', items: [] }; list.items.push(mi[1].replace(/\*\*/g, '')); continue; }
        if (!line.trim()) { pushList(); continue; }
        pushList();
        cur.blocks.push({ type: 'p', text: line.replace(/\*\*/g, '') });
      }
      if (cur) pushList();
      return out.slice(0, 40);
    },
  },
};
</script>
