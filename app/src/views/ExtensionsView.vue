<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- cabeçalho + barra de instalação -->
    <div class="flex-shrink-0 border-b border-ink-500 bg-ink-850 px-6 py-4">
      <div class="flex items-center gap-2">
        <h1 class="text-[15px] font-semibold text-txt">Extensões</h1>
        <span class="pill border border-ink-500 bg-ink-700 text-faint">{{ plugins.length }}</span>
        <div class="flex-1"></div>
        <button class="icon-btn h-8 w-8" title="Recarregar" :disabled="loading" @click="load">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4" :class="{ 'animate-spin': loading }"><path d="M16 10a6 6 0 1 1-1.8-4.3" stroke-linecap="round" /><path d="M15 3v3h-3" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>

      <div class="mt-3 flex items-end gap-2">
        <label class="flex-1">
          <span class="mb-1 block text-[11px] uppercase tracking-wide text-faint">Repositório GitHub</span>
          <input
            v-model="repoInput"
            class="field w-full"
            placeholder="owner/repo  ou  https://github.com/owner/repo"
            @keydown.enter.prevent="install"
          />
        </label>
        <label class="w-40">
          <span class="mb-1 block text-[11px] uppercase tracking-wide text-faint">Branch/tag (opcional)</span>
          <input v-model="refInput" class="field w-full" placeholder="main" @keydown.enter.prevent="install" />
        </label>
        <button
          class="flex h-[34px] items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-ink-900 hover:brightness-110 disabled:opacity-50"
          :disabled="installing || !repoInput.trim()"
          @click="install"
        >
          <svg v-if="!installing" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4"><path d="M10 4v9M6 9l4 4 4-4M4 16h12" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <svg v-else viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4 animate-spin"><path d="M16 10a6 6 0 1 1-1.8-4.3" stroke-linecap="round" /></svg>
          {{ installing ? 'Instalando…' : 'Instalar' }}
        </button>
      </div>
      <p v-if="installError" class="mt-2 text-[12px] text-red-300">{{ installError }}</p>
      <p class="mt-2 text-[11px] leading-relaxed text-faint">
        Plugins são código de terceiros baixado do GitHub e rodam na sua máquina. Instale só de fontes confiáveis.
        Instalação por-vault (em <code class="text-muted">plugins/</code>); o <code class="text-muted">.env</code> fica local (não vai no push).
      </p>
    </div>

    <!-- lista -->
    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="loading && !plugins.length" class="grid h-40 place-items-center text-[13px] text-muted">Carregando…</div>

      <div v-else-if="!plugins.length" class="mx-auto mt-10 max-w-md rounded-xl border border-dashed border-ink-500 p-8 text-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" class="mx-auto h-10 w-10 text-faint"><path d="M9 3h6v3a2 2 0 0 0 4 0h2v6h-3a2 2 0 0 0 0 4h3v6H4V4a1 1 0 0 1 1-1h4v0" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <div class="mt-3 text-[14px] font-medium text-muted">Nenhuma extensão instalada</div>
        <div class="mt-1 text-[12px] text-faint">Cole o repositório de um plugin acima para instalar.</div>
      </div>

      <div v-else class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div
          v-for="p in plugins"
          :key="p.name"
          class="flex flex-col rounded-xl border border-ink-500 bg-ink-850 p-4"
        >
          <div class="flex items-start gap-3">
            <div class="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-500 bg-ink-800">
              <img v-if="p.hasIcon" :src="iconUrl(p.name)" alt="" class="h-full w-full object-cover" />
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" class="h-6 w-6 text-faint"><path d="M9 3h6v3a2 2 0 0 0 4 0h2v6h-3a2 2 0 0 0 0 4h3v6H4V4a1 1 0 0 1 1-1h4v0" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-[14px] font-semibold text-txt">{{ p.title }}</span>
                <span v-if="p.version" class="pill border border-ink-500 bg-ink-700 text-[10px] text-faint">v{{ p.version }}</span>
              </div>
              <p class="mt-0.5 line-clamp-2 text-[12px] text-muted">{{ p.description || 'Sem descrição.' }}</p>
            </div>
          </div>

          <div class="mt-2 flex items-center gap-2">
            <span
              v-if="p.env.length"
              class="pill text-[10px]"
              :class="p.configured ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border border-amber-500/40 bg-amber-500/10 text-amber-300'"
            >{{ p.configured ? 'configurado' : 'precisa configurar' }}</span>
            <button v-if="p.readme" class="text-[11px] text-faint hover:text-muted" @click="toggleReadme(p.name)">
              {{ openReadme === p.name ? 'ocultar README' : 'ver README' }}
            </button>
          </div>

          <pre v-if="openReadme === p.name" class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-ink-500 bg-ink-900 p-3 text-[11.5px] leading-relaxed text-muted">{{ p.readme }}</pre>

          <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-500/60 pt-3">
            <template v-for="cmd in (p.commands.length ? p.commands : [{ id: '', label: 'Rodar' }])" :key="cmd.id || 'run'">
              <button
                class="flex h-8 items-center gap-1.5 rounded-md border border-ink-500 px-2.5 text-[12.5px] text-txt transition-colors hover:border-accent hover:bg-ink-800 disabled:opacity-40"
                :disabled="p.env.length && !p.configured"
                :title="p.env.length && !p.configured ? 'Configure as variáveis primeiro' : 'Executar'"
                @click="askRun(p, cmd)"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5 text-accent"><path d="M6 4l10 6-10 6z" /></svg>
                {{ cmd.label }}
              </button>
            </template>
            <div class="flex-1"></div>
            <button v-if="p.env.length" class="icon-btn h-8 w-8" title="Configurar" @click="openConfig(p)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <button class="icon-btn h-8 w-8 hover:!text-red-300" title="Remover" @click="confirmRemove = p">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M5 6h10M8 6V4h4v2M6 6l1 10h6l1-10" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- modal: configurar env -->
    <div v-if="cfg.open" class="fixed inset-0 z-50 grid place-items-center bg-black/50" @click.self="cfg.open = false">
      <div class="w-[460px] max-w-[92vw] rounded-xl border border-ink-500 bg-ink-800 p-5 shadow-2xl">
        <div class="text-[14px] font-semibold text-txt">Configurar — {{ cfg.plugin.title }}</div>
        <div class="mt-3 space-y-3">
          <label v-for="f in cfg.plugin.env" :key="f.key" class="block">
            <span class="mb-1 flex items-center gap-1.5 text-[12px] text-muted">
              {{ f.label }}
              <span v-if="f.required" class="text-red-300">*</span>
              <code class="text-[10px] text-faint">{{ f.key }}</code>
            </span>
            <input
              v-model="cfg.values[f.key]"
              :type="f.secret ? 'password' : 'text'"
              class="field w-full"
              :placeholder="f.placeholder || ''"
              autocomplete="off"
            />
          </label>
          <div v-if="!cfg.plugin.env.length" class="text-[12px] text-faint">Este plugin não declara variáveis.</div>
        </div>
        <p v-if="cfg.error" class="mt-2 text-[12px] text-red-300">{{ cfg.error }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button class="rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-ink-700" @click="cfg.open = false">Cancelar</button>
          <button class="rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-ink-900 hover:brightness-110 disabled:opacity-50" :disabled="cfg.saving" @click="saveConfig">
            {{ cfg.saving ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- modal: confirmar execução (código de terceiros) -->
    <div v-if="pendingRun" class="fixed inset-0 z-50 grid place-items-center bg-black/50" @click.self="pendingRun = null">
      <div class="w-[400px] rounded-xl border border-ink-500 bg-ink-800 p-5 shadow-2xl">
        <div class="text-[14px] font-semibold text-txt">Executar extensão</div>
        <p class="mt-2 text-[13px] leading-relaxed text-muted">
          Vai rodar <strong class="text-txt">{{ pendingRun.plugin.title }}</strong> na sua máquina (código de terceiros, acesso total ao seu ambiente). Continuar?
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button class="rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-ink-700" @click="pendingRun = null">Cancelar</button>
          <button class="rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-ink-900 hover:brightness-110" @click="doRun">Executar</button>
        </div>
      </div>
    </div>

    <!-- modal: log de execução -->
    <div v-if="run.open" class="fixed inset-0 z-50 grid place-items-center bg-black/50" @click.self="closeRun">
      <div class="flex h-[70vh] w-[720px] max-w-[94vw] flex-col rounded-xl border border-ink-500 bg-ink-850 shadow-2xl">
        <div class="flex items-center gap-2 border-b border-ink-500 px-4 py-3">
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 text-accent"><path d="M6 4l10 6-10 6z" /></svg>
          <span class="text-[13px] font-medium text-txt">{{ run.title }}</span>
          <span v-if="run.running" class="pill border border-accent/40 bg-accent/10 text-[10px] text-accent">rodando…</span>
          <span v-else class="pill text-[10px]" :class="run.code === 0 ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border border-red-500/40 bg-red-500/10 text-red-300'">
            saiu ({{ run.code }})
          </span>
          <div class="flex-1"></div>
          <button class="icon-btn h-7 w-7" title="Fechar" @click="closeRun">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
          </button>
        </div>
        <pre ref="logBox" class="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[12px] leading-relaxed text-muted">{{ run.log || '…' }}</pre>
      </div>
    </div>

    <!-- confirmar remoção -->
    <div v-if="confirmRemove" class="fixed inset-0 z-50 grid place-items-center bg-black/50" @click.self="confirmRemove = null">
      <div class="w-[380px] rounded-xl border border-ink-500 bg-ink-800 p-5 shadow-2xl">
        <div class="text-[14px] font-semibold text-txt">Remover extensão</div>
        <p class="mt-2 text-[13px] text-muted">Remover <strong class="text-txt">{{ confirmRemove.title }}</strong>? Os arquivos do plugin saem do vault.</p>
        <div class="mt-4 flex justify-end gap-2">
          <button class="rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-ink-700" @click="confirmRemove = null">Cancelar</button>
          <button class="rounded-md bg-red-600 px-3.5 py-1.5 text-[13px] font-medium text-white hover:brightness-110" @click="doRemove">Remover</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  listPlugins, installPlugin, removePlugin,
  getPluginEnv, savePluginEnv, runPlugin, pluginRunUrl, pluginIconUrl,
} from '../api';

export default {
  name: 'ExtensionsView',
  emits: ['error', 'notify'],
  data() {
    return {
      plugins: [],
      loading: false,
      installing: false,
      repoInput: '',
      refInput: '',
      installError: '',
      openReadme: null,
      cfg: { open: false, plugin: null, values: {}, saving: false, error: '' },
      pendingRun: null, // { plugin, cmd }
      run: { open: false, title: '', log: '', running: false, code: null, es: null },
      confirmRemove: null,
    };
  },
  created() { this.load(); },
  methods: {
    iconUrl(name) { return pluginIconUrl(name); },
    async load() {
      this.loading = true;
      try {
        const r = await listPlugins();
        this.plugins = (r && r.plugins) || [];
      } catch (e) { this.$emit('error', e.message || 'Falha ao listar extensões.'); }
      finally { this.loading = false; }
    },
    async install() {
      const repo = this.repoInput.trim();
      if (!repo || this.installing) return;
      this.installing = true;
      this.installError = '';
      try {
        const r = await installPlugin(repo, this.refInput.trim() || undefined);
        this.plugins = (r && r.plugins) || this.plugins;
        this.repoInput = '';
        this.refInput = '';
        this.$emit('notify', `Extensão "${r.name}" instalada.`);
        if (r.depsWarning) this.$emit('error', `Dependências: ${r.depsWarning}`);
        if (r.warning) this.$emit('error', r.warning);
      } catch (e) { this.installError = e.message || 'Falha ao instalar.'; }
      finally { this.installing = false; }
    },
    toggleReadme(name) { this.openReadme = this.openReadme === name ? null : name; },
    async openConfig(p) {
      this.cfg = { open: true, plugin: p, values: {}, saving: false, error: '' };
      try {
        const r = await getPluginEnv(p.name);
        const vals = (r && r.values) || {};
        const seed = {};
        p.env.forEach((f) => { seed[f.key] = vals[f.key] != null ? vals[f.key] : ''; });
        this.cfg.values = seed;
      } catch (e) { this.cfg.error = e.message || 'Falha ao ler configuração.'; }
    },
    async saveConfig() {
      this.cfg.saving = true;
      this.cfg.error = '';
      try {
        await savePluginEnv(this.cfg.plugin.name, this.cfg.values);
        this.cfg.open = false;
        this.$emit('notify', 'Configuração salva.');
        await this.load();
      } catch (e) { this.cfg.error = e.message || 'Falha ao salvar.'; }
      finally { this.cfg.saving = false; }
    },
    askRun(p, cmd) { this.pendingRun = { plugin: p, cmd }; },
    async doRun() {
      const { plugin, cmd } = this.pendingRun;
      this.pendingRun = null;
      this.closeRun(); // fecha stream anterior se houver
      try {
        const { runId } = await runPlugin(plugin.name, cmd.id || undefined);
        this.run = { open: true, title: `${plugin.title} — ${cmd.label}`, log: '', running: true, code: null, es: null };
        const es = new EventSource(pluginRunUrl(plugin.name, runId));
        this.run.es = es;
        es.addEventListener('log', (e) => {
          try { this.run.log += JSON.parse(e.data); } catch (_) { /* noop */ }
          this.$nextTick(this.scrollLog);
        });
        es.addEventListener('done', (e) => {
          try { this.run.code = JSON.parse(e.data).code; } catch (_) { this.run.code = null; }
          this.run.running = false;
          es.close();
        });
        es.onerror = () => { this.run.running = false; try { es.close(); } catch (_) { /* noop */ } };
      } catch (e) { this.$emit('error', e.message || 'Falha ao executar.'); }
    },
    scrollLog() { const el = this.$refs.logBox; if (el) el.scrollTop = el.scrollHeight; },
    closeRun() {
      if (this.run.es) { try { this.run.es.close(); } catch (_) { /* noop */ } }
      this.run = { open: false, title: '', log: '', running: false, code: null, es: null };
    },
    async doRemove() {
      const p = this.confirmRemove;
      this.confirmRemove = null;
      try {
        const r = await removePlugin(p.name);
        this.plugins = (r && r.plugins) || this.plugins.filter((x) => x.name !== p.name);
        this.$emit('notify', 'Extensão removida.');
      } catch (e) { this.$emit('error', e.message || 'Falha ao remover.'); }
    },
  },
  beforeUnmount() { this.closeRun(); },
};
</script>
