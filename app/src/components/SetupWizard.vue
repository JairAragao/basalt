<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
    <div class="flex max-h-[88vh] w-[560px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-ink-500 bg-ink-800 shadow-2xl">
      <!-- header -->
      <header class="flex flex-shrink-0 items-start gap-3 border-b border-ink-500 px-5 py-4">
        <span class="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5"><path d="M10 7v4M10 14h.01M8.6 3.7L2.5 14a1.6 1.6 0 0 0 1.4 2.4h12.2A1.6 1.6 0 0 0 17.5 14L11.4 3.7a1.6 1.6 0 0 0-2.8 0Z" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-[15px] font-medium text-txt">{{ vaultDone ? 'Configuração do Git incompleta' : 'Defina o vault do Basalt' }}</div>
          <div class="mt-0.5 text-[12px] leading-relaxed text-muted">
            <template v-if="!vaultDone">
              O Basalt guarda as tarefas em uma pasta (o “vault”) que contém
              <code class="font-mono text-amber-200">config/</code> + <code class="font-mono text-amber-200">tasks/</code> e um repositório git próprio.
              Informe o caminho da pasta para começar.
            </template>
            <template v-else>
              O Basalt grava as tarefas como commits no repositório do vault.
              Resolva os itens abaixo para que histórico e sincronização funcionem.
            </template>
          </div>
        </div>
      </header>

      <!-- corpo rolável -->
      <div class="flex-1 overflow-y-auto px-5 py-3">
        <!-- ETAPA VAULT -->
        <section>
          <div class="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-faint">
            <span class="grid h-4 w-4 place-items-center rounded-full bg-ink-600 text-[10px] text-muted">1</span>
            Vault
          </div>

          <!-- status do vault atual -->
          <div class="mb-3 rounded-lg border p-3"
            :class="vaultDone ? 'border-green-500/30 bg-green-500/5' : 'border-ink-500 bg-ink-850'">
            <div class="flex items-start gap-3">
              <span
                class="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full"
                :class="vaultDone ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'"
              >
                <svg v-if="vaultDone" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" class="h-3.5 w-3.5"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <svg v-else viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5"><path d="M10 6v5M10 14h.01" stroke-linecap="round" /></svg>
              </span>
              <div class="min-w-0 flex-1">
                <div class="text-[13px] text-txt">
                  {{ vaultDone ? 'Vault configurado' : (vault && vault.path ? 'Vault precisa de configuração' : 'Nenhum vault definido') }}
                </div>
                <div v-if="vault && vault.path" class="mt-0.5 truncate font-mono text-[11px] text-muted" :title="vault.path">{{ vault.path }}</div>
                <div v-if="vault" class="mt-1.5 flex flex-wrap gap-1.5">
                  <span class="pill border" :class="badge(vault.hasConfig)">config/</span>
                  <span class="pill border" :class="badge(vault.hasTasks)">tasks/</span>
                  <span class="pill border" :class="badge(vault.hasGit)">git</span>
                </div>
              </div>
            </div>
          </div>

          <!-- input do caminho + ação -->
          <label class="mb-1 block text-[12px] text-faint">Caminho da pasta do vault</label>
          <div class="flex items-center gap-2">
            <input
              v-model="vaultPath"
              class="field flex-1 font-mono text-[12px]"
              placeholder="ex: C:\Users\voce\meu-vault  ou  /home/voce/meu-vault"
              @keydown.enter.prevent="defineVault"
            />
            <button
              class="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
              :disabled="vaultSaving || !vaultPath.trim()"
              @click="defineVault"
            >
              <svg v-if="vaultSaving" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4 animate-spin"><path d="M16 10a6 6 0 1 1-1.8-4.3" stroke-linecap="round" /></svg>
              {{ vaultSaving ? 'Definindo…' : 'Definir vault' }}
            </button>
          </div>
          <p class="mt-1 text-[11px] text-faint">
            Se a pasta não tiver <code class="font-mono">config/</code>/<code class="font-mono">tasks/</code> ou git, o Basalt os cria (não apaga nada existente).
          </p>

          <!-- resultado da última ação de vault -->
          <div v-if="vaultMsg" class="mt-2 rounded-md border px-3 py-2 text-[12px]"
            :class="vaultMsgType === 'error' ? 'border-red-500/40 bg-red-500/5 text-red-300' : 'border-green-500/30 bg-green-500/5 text-green-300'">
            {{ vaultMsg }}
          </div>
        </section>

        <!-- ETAPA GIT (só depois de o vault estar definido) -->
        <section v-if="vaultDone" class="mt-5 border-t border-ink-500 pt-4">
          <div class="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-faint">
            <span class="grid h-4 w-4 place-items-center rounded-full bg-ink-600 text-[10px] text-muted">2</span>
            Git (remote / push / pull)
          </div>

          <!-- resumo do repo -->
          <div v-if="health" class="mb-2.5 flex flex-wrap gap-x-5 gap-y-1 rounded-md border border-ink-500 bg-ink-850 px-3 py-2 text-[11px] text-faint">
            <span>branch: <span class="text-muted">{{ health.branch || '—' }}</span></span>
            <span>user: <span class="text-muted">{{ health.user ? (health.user.name + ' <' + health.user.email + '>') : '— não configurado' }}</span></span>
            <span>remote: <span class="text-muted">{{ health.remoteUrl || '— nenhum' }}</span></span>
          </div>

          <!-- lista de checks -->
          <ul class="space-y-2.5">
            <li
              v-for="c in checks"
              :key="c.id"
              class="flex items-start gap-3 rounded-lg border p-3"
              :class="c.ok ? 'border-ink-500 bg-ink-850' : 'border-red-500/30 bg-red-500/5'"
            >
              <span
                class="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full"
                :class="c.ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'"
              >
                <svg v-if="c.ok" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" class="h-3.5 w-3.5"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <svg v-else viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
              </span>
              <div class="min-w-0 flex-1">
                <div class="text-[13px] text-txt">{{ c.label }}</div>
                <div v-if="c.detail" class="mt-0.5 text-[12px] text-muted">{{ c.detail }}</div>
                <div v-if="!c.ok && c.fix" class="mt-1.5 flex items-center gap-2">
                  <code class="min-w-0 flex-1 truncate rounded border border-ink-500 bg-ink-900 px-2 py-1 font-mono text-[11px] text-amber-200" :title="c.fix">{{ c.fix }}</code>
                  <button class="icon-btn h-6 w-6 flex-shrink-0" title="Copiar correção" @click="copyFix(c.fix)">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5"><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M4 13V5a1 1 0 0 1 1-1h8" /></svg>
                  </button>
                </div>
              </div>
            </li>
            <li v-if="!checks.length && !loading" class="px-1 py-4 text-center text-[12px] text-faint">
              {{ error || 'Nenhum check retornado pelo servidor.' }}
            </li>
          </ul>
        </section>
      </div>

      <!-- footer -->
      <footer class="flex flex-shrink-0 items-center gap-2 border-t border-ink-500 px-5 py-3">
        <span v-if="copied" class="text-[12px] text-green-400">Copiado!</span>
        <span v-else-if="error" class="truncate text-[12px] text-red-300" :title="error">{{ error }}</span>
        <div class="flex-1"></div>
        <button
          class="rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-ink-700"
          @click="$emit('dismiss')"
        >Continuar mesmo assim</button>
        <button
          v-if="vaultDone"
          class="flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
          :disabled="loading"
          @click="revalidate"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4" :class="{ 'animate-spin': loading }"><path d="M16 10a6 6 0 1 1-1.8-4.3" stroke-linecap="round" /><path d="M15 3v3h-3" stroke-linecap="round" stroke-linejoin="round" /></svg>
          {{ loading ? 'Validando…' : 'Revalidar' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script>
import { getHealthGit, getVault, setVault } from '../api';

export default {
  name: 'SetupWizard',
  props: {
    // estado inicial vindo do bootstrap do App (evita 2ª chamada ao abrir)
    health: { type: Object, default: null },
    // estado inicial do vault vindo do bootstrap do App
    vault: { type: Object, default: null },
  },
  data() {
    return {
      loading: false,
      error: '',
      copied: false,
      // vault
      vaultPath: (this.vault && this.vault.path) || '',
      vaultSaving: false,
      vaultMsg: '',
      vaultMsgType: 'success',
    };
  },
  computed: {
    checks() {
      return (this.health && Array.isArray(this.health.checks)) ? this.health.checks : [];
    },
    // Vault "pronto" = existe e tem config (needsSetup falso).
    vaultDone() {
      return !!(this.vault && this.vault.needsSetup === false);
    },
  },
  watch: {
    vault(v) {
      // mantém o input em sincronia quando o App atualiza o estado do vault
      if (v && v.path && !this.vaultPath) this.vaultPath = v.path;
    },
  },
  methods: {
    badge(ok) {
      return ok
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : 'border-ink-500 bg-ink-700 text-faint';
    },
    async defineVault() {
      const p = (this.vaultPath || '').trim();
      if (!p) { this.vaultMsg = 'Informe o caminho da pasta do vault.'; this.vaultMsgType = 'error'; return; }
      this.vaultSaving = true;
      this.vaultMsg = '';
      try {
        const res = await setVault(p);
        // res: { path, exists, hasConfig, hasTasks, hasGit, needsSetup, schema?, board?, gute? }
        const parts = [];
        if (res && res.hasConfig) parts.push('config/ pronto');
        if (res && res.hasTasks) parts.push('tasks/ pronto');
        if (res && res.hasGit) parts.push('git ok'); else parts.push('git ausente');
        this.vaultMsg = 'Vault definido. ' + parts.join(' · ') + '.';
        this.vaultMsgType = (res && res.needsSetup === false) ? 'success' : 'error';
        // avisa o App: ele recarrega config/tasks e revalida o git
        this.$emit('vault-set', res);
        // tenta puxar a saúde do git já do novo vault
        if (res && res.needsSetup === false) {
          await this.revalidate(true);
        }
      } catch (e) {
        this.vaultMsg = e.message || 'Falha ao definir o vault.';
        this.vaultMsgType = 'error';
      } finally {
        this.vaultSaving = false;
      }
    },
    async revalidate(silent) {
      this.loading = true;
      if (!silent) this.error = '';
      try {
        const [h, v] = await Promise.all([getHealthGit(), getVault()]);
        // repassa os novos estados pro App; ele decide se fecha (ok) ou mantém
        this.$emit('revalidated', { health: h, vault: v });
      } catch (e) {
        this.error = e.message || 'Falha ao revalidar.';
      } finally {
        this.loading = false;
      }
    },
    copyFix(text) {
      const done = () => { this.copied = true; setTimeout(() => { this.copied = false; }, 1600); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => {});
        }
      } catch (e) { /* ignore */ }
    },
  },
};
</script>
