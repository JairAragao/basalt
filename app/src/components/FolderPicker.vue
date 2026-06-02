<template>
  <div class="rounded-lg border border-ink-500 bg-ink-850">
    <!-- Electron: diálogo NATIVO de pasta (preferido); o navegador abaixo fica como alternativa -->
    <div v-if="isElectron" class="flex items-center gap-2 border-b border-ink-500 px-2.5 py-2">
      <button
        type="button"
        class="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110"
        @click="pickNative"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M3 6a1 1 0 0 1 1-1h3l1.5 1.5H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z" stroke-linejoin="round" /></svg>
        Procurar pasta…
      </button>
      <span class="text-[11px] text-faint">diálogo nativo do sistema</span>
    </div>

    <!-- barra de caminho atual + parent -->
    <div class="flex items-center gap-2 border-b border-ink-500 px-2.5 py-2">
      <button
        type="button"
        class="icon-btn h-7 w-7 flex-shrink-0 disabled:opacity-30"
        title="Pasta acima"
        :disabled="!cur || !cur.parent || loading"
        @click="go(cur && cur.parent)"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M10 16V5M5 9l5-4 5 4" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <div class="min-w-0 flex-1 truncate font-mono text-[12px] text-muted" :title="cur && cur.path">
        {{ (cur && cur.path) || '…' }}
      </div>
      <button
        type="button"
        class="icon-btn h-7 w-7 flex-shrink-0"
        title="Ir pra home"
        :disabled="loading"
        @click="go(cur && cur.home)"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M3 9.5L10 4l7 5.5M5 8.5V16h10V8.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </div>

    <!-- drives / roots (Windows: C:\ D:\ …) -->
    <div v-if="cur && cur.roots && cur.roots.length > 1" class="flex flex-wrap gap-1.5 border-b border-ink-500 px-2.5 py-1.5">
      <button
        v-for="r in cur.roots"
        :key="r"
        type="button"
        class="rounded border border-ink-500 bg-ink-700 px-2 py-0.5 font-mono text-[11px] text-muted hover:border-accent hover:text-txt"
        @click="go(r)"
      >{{ r }}</button>
    </div>

    <!-- lista de subpastas -->
    <div class="max-h-[360px] min-h-[220px] overflow-y-auto p-1">
      <div v-if="loading" class="grid h-[220px] place-items-center text-[12px] text-faint">Carregando…</div>
      <div v-else-if="error" class="grid h-[220px] place-items-center px-4 text-center text-[12px] text-red-300">{{ error }}</div>
      <template v-else>
        <button
          v-for="d in (cur && cur.dirs) || []"
          :key="d.path"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-txt hover:bg-ink-700"
          @click="go(d.path)"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 flex-shrink-0 text-amber-300/80"><path d="M3 6a1 1 0 0 1 1-1h3l1.5 1.5H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z" stroke-linejoin="round" /></svg>
          <span class="truncate">{{ d.name }}</span>
        </button>
        <div v-if="cur && !cur.dirs.length" class="grid h-[200px] place-items-center text-[12px] text-faint">Nenhuma subpasta aqui.</div>
      </template>
    </div>

    <!-- criar subpasta + usar esta pasta -->
    <div class="space-y-2 border-t border-ink-500 px-2.5 py-2.5">
      <div class="flex items-center gap-2">
        <input
          v-model="newName"
          class="field flex-1 text-[12px]"
          placeholder="(opcional) criar subpasta aqui: ex. meu-vault"
          @keydown.enter.prevent="useFolder"
        />
      </div>
      <div class="flex items-center gap-2">
        <p class="min-w-0 flex-1 truncate text-[11px] text-faint" :title="targetPath">
          Vai usar: <span class="font-mono text-muted">{{ targetPath || '—' }}</span>
        </p>
        <button
          type="button"
          class="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
          :disabled="!targetPath"
          @click="useFolder"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          Usar esta pasta
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { listDir } from '../api';

export default {
  name: 'FolderPicker',
  props: {
    // caminho inicial pra abrir (ex.: vault atual). Vazio → home do usuário.
    start: { type: String, default: '' },
  },
  data() {
    return {
      cur: null, // { path, parent, dirs, roots, sep, home }
      loading: false,
      error: '',
      newName: '',
    };
  },
  computed: {
    isElectron() {
      return !!(typeof window !== 'undefined' && window.electron && window.electron.isElectron);
    },
    // Caminho final = pasta atual + (subpasta nova, se informada).
    targetPath() {
      if (!this.cur || !this.cur.path) return '';
      const name = (this.newName || '').trim();
      if (!name) return this.cur.path;
      const sep = this.cur.sep || '\\';
      const base = this.cur.path.endsWith(sep) ? this.cur.path : this.cur.path + sep;
      return base + name;
    },
  },
  mounted() {
    this.go(this.start || '');
  },
  methods: {
    async go(p) {
      if (p === undefined || p === null) return;
      this.loading = true;
      this.error = '';
      try {
        this.cur = await listDir(p);
        this.newName = '';
      } catch (e) {
        this.error = e.message || 'Não foi possível abrir a pasta.';
      } finally {
        this.loading = false;
      }
    },
    useFolder() {
      if (this.targetPath) this.$emit('select', this.targetPath);
    },
    async pickNative() {
      try {
        const p = await window.electron.pickFolder();
        if (p) this.$emit('select', p);
      } catch (e) {
        this.error = e.message || 'Falha ao abrir o diálogo nativo.';
      }
    },
  },
};
</script>
