<template>
  <div class="flex h-full flex-col">
    <div class="flex-1 space-y-2 overflow-y-auto p-1">
      <div
        v-for="(prop, pi) in props_"
        :key="prop._uid"
        class="rounded-lg border border-ink-500 p-3"
        :class="prop.system ? 'bg-ink-850/60 opacity-80' : 'bg-ink-850'"
      >
        <!-- linha principal: label + tipo + remover -->
        <div class="flex items-center gap-2">
          <input
            v-model="prop.label"
            class="field flex-1"
            placeholder="Nome da propriedade"
            :disabled="prop.system"
            :class="{ '!text-faint': prop.system }"
          />

          <div class="w-32 flex-shrink-0">
            <Dropdown
              v-if="!prop.system"
              :value="prop.type"
              :options="typeOptions"
              placeholder="Tipo"
              @input="(v) => changeType(prop, v)"
            />
            <span v-else class="field flex items-center !text-faint">{{ typeLabel(prop.type) }}</span>
          </div>

          <span v-if="prop.system" class="pill flex-shrink-0 border border-ink-500 bg-ink-700 text-faint">sistema</span>

          <button
            v-else
            type="button"
            class="icon-btn h-7 w-7 flex-shrink-0"
            title="Remover propriedade"
            @click="removeProp(pi)"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
          </button>
        </div>

        <!-- editores específicos do tipo (ocultos p/ sistema) -->
        <div v-if="!prop.system" class="mt-2 space-y-2">
          <!-- options (enum): cada opção editável (rename) + excluir + adicionar -->
          <div v-if="prop.type === 'enum'" class="rounded-md border border-ink-500 bg-ink-800 p-2">
            <div class="mb-1.5 text-[11px] text-faint">Opções</div>
            <div class="space-y-1.5">
              <div
                v-for="opt in prop.options"
                :key="opt._uid"
                class="flex items-center gap-2"
              >
                <input
                  v-model="opt.value"
                  class="field flex-1 !py-1 text-[12px]"
                  placeholder="Nome da opção"
                />
                <span
                  v-if="opt._original && opt._original !== opt.value.trim()"
                  class="pill flex-shrink-0 border border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300"
                  :title="'Renomeará tarefas de “' + opt._original + '” para “' + opt.value.trim() + '”'"
                >renomear</span>
                <button
                  type="button"
                  class="icon-btn h-7 w-7 flex-shrink-0"
                  title="Excluir opção"
                  @click="removeOption(prop, opt._uid)"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
                </button>
              </div>

              <input
                v-model="prop._newOption"
                class="field !w-40 !py-1 text-[12px]"
                placeholder="+ opção (Enter)"
                @keydown.enter.prevent="addOption(prop)"
                @blur="addOption(prop)"
              />
            </div>
          </div>

          <!-- min/max (int) -->
          <div v-else-if="prop.type === 'int'" class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 text-[12px] text-faint">
              mín
              <input v-model.number="prop.min" type="number" class="field !w-20 !py-1" placeholder="—" />
            </label>
            <label class="flex items-center gap-1.5 text-[12px] text-faint">
              máx
              <input v-model.number="prop.max" type="number" class="field !w-20 !py-1" placeholder="—" />
            </label>
          </div>

          <!-- builder de expressão (formula) -->
          <div v-else-if="prop.type === 'formula'" class="rounded-md border border-ink-500 bg-ink-800 p-2">
            <div class="mb-1 flex items-center gap-2">
              <span class="pill border border-teal-500/40 bg-teal-500/10 text-[10px] text-teal-300">derivado · somente leitura</span>
              <span class="text-[11px] text-faint">calculada a partir das propriedades numéricas</span>
            </div>

            <!-- expressão -->
            <input
              v-model="prop.expression"
              class="field !py-1 font-mono text-[12px]"
              placeholder="use os nomes das propriedades abaixo, ex: (a * b) / c"
            />

            <!-- propriedades numéricas clicáveis -->
            <div class="mt-2 text-[11px] text-faint">Propriedades</div>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <button
                v-for="nk in numericKeysFor(prop)"
                :key="nk.key"
                type="button"
                class="rounded border border-ink-500 bg-ink-700 px-2 py-0.5 font-mono text-[11px] text-txt transition-colors hover:border-accent hover:bg-ink-600"
                :title="nk.label"
                @click="insertToken(prop, nk.key)"
              >{{ nk.key }}</button>
              <span v-if="!numericKeysFor(prop).length" class="text-[11px] text-faint">nenhuma propriedade numérica disponível</span>
            </div>

            <!-- operadores -->
            <div class="mt-2 text-[11px] text-faint">Operadores</div>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <button
                v-for="op in operators"
                :key="op"
                type="button"
                class="grid h-6 min-w-[1.5rem] place-items-center rounded border border-ink-500 bg-ink-700 px-1.5 font-mono text-[12px] text-muted transition-colors hover:border-accent hover:bg-ink-600 hover:text-txt"
                @click="insertToken(prop, op)"
              >{{ op }}</button>
            </div>

            <!-- arredondamento -->
            <label class="mt-2 flex items-center gap-1.5 text-[12px] text-faint">
              casas decimais
              <input v-model.number="prop.round" type="number" min="0" max="6" class="field !w-20 !py-1" placeholder="2" />
            </label>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md px-2 py-2 text-[13px] text-faint hover:bg-ink-700 hover:text-muted"
        @click="addProp"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M10 4v12M4 10h12" stroke-linecap="round" /></svg>
        Adicionar propriedade
      </button>
    </div>

    <!-- footer -->
    <div class="flex flex-shrink-0 items-center gap-3 border-t border-ink-500 pt-3">
      <span v-if="error" class="flex-1 truncate text-[12px] text-red-300" :title="error">{{ error }}</span>
      <span v-else class="flex-1"></span>
      <button
        class="rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
        :disabled="saving"
        @click="save"
      >{{ saving ? 'Salvando…' : 'Salvar propriedades' }}</button>
    </div>
  </div>
</template>

<script>
import { saveProperties } from '../api';
import Dropdown from './Dropdown.vue';

let UID = 0;
const nextUid = () => `p${++UID}`;
let OUID = 0;
const nextOptUid = () => `o${++OUID}`;

const TYPE_LABELS = { string: 'Texto', enum: 'Lista', int: 'Número', formula: 'Fórmula' };

function slugify(label) {
  return (label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acentos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default {
  name: 'PropertyEditor',
  components: { Dropdown },
  props: {
    config: { type: Object, required: true },
  },
  data() {
    return {
      props_: [],
      saving: false,
      error: '',
      typeOptions: [
        { value: 'string', label: 'Texto' },
        { value: 'enum', label: 'Lista' },
        { value: 'int', label: 'Número' },
        { value: 'formula', label: 'Fórmula' },
      ],
      operators: ['+', '-', '*', '/', '(', ')'],
    };
  },
  created() {
    this.load();
  },
  methods: {
    load() {
      const src = (this.config.schema && this.config.schema.properties) || {};
      this.props_ = Object.keys(src).map((key) => {
        const spec = src[key] || {};
        return {
          _uid: nextUid(),
          _originalKey: key,
          _newOption: '',
          key,
          label: spec.label || key,
          type: spec.type || 'string',
          // cada opção vira objeto estável: _original (valor no schema) + value (editável)
          options: Array.isArray(spec.options)
            ? spec.options.map((o) => ({ _uid: nextOptUid(), _original: o, value: o }))
            : [],
          min: spec.min,
          max: spec.max,
          // fórmula: expressão sobre chaves de props numéricas + arredondamento
          expression: spec.type === 'formula' ? (spec.expression || '') : '',
          round: spec.type === 'formula' && spec.round !== undefined && spec.round !== null ? spec.round : undefined,
          required: !!spec.required,
          system: !!spec.system,
          default: spec.default,
        };
      });
    },
    typeLabel(t) { return TYPE_LABELS[t] || t; },
    changeType(prop, v) {
      prop.type = v;
      if (v === 'enum' && !Array.isArray(prop.options)) prop.options = [];
      if (v === 'formula' && prop.expression === undefined) prop.expression = '';
    },
    addProp() {
      this.props_.push({
        _uid: nextUid(),
        _originalKey: null,
        _newOption: '',
        key: '',
        label: '',
        type: 'string',
        options: [],
        min: undefined,
        max: undefined,
        expression: '',
        round: undefined,
        required: false,
        system: false,
        default: undefined,
      });
    },
    // Chaves de propriedades numéricas disponíveis p/ usar na fórmula (int + formula),
    // exceto a própria. Slug do label (mesma regra do build) p/ refletir o que será gravado.
    numericKeysFor(prop) {
      const out = [];
      const seen = new Set();
      for (const p of this.props_) {
        if (p._uid === prop._uid) continue;
        if (p.type !== 'int' && p.type !== 'formula') continue;
        const key = p.system ? p._originalKey : (slugify(p.label) || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, label: (p.label || '').trim() || key });
      }
      return out;
    },
    // Insere um token (chave de prop ou operador) no input da expressão da fórmula.
    insertToken(prop, token) {
      const cur = prop.expression || '';
      const needsSpace = cur && !/[\s(]$/.test(cur) && !/^[)\s]/.test(token);
      prop.expression = cur + (needsSpace ? ' ' : '') + token;
    },
    removeProp(idx) {
      this.props_.splice(idx, 1);
    },
    addOption(prop) {
      const v = (prop._newOption || '').trim();
      if (!v) return;
      // nova opção: sem _original (não dispara rename/migração)
      if (!prop.options.some((o) => (o.value || '').trim() === v)) {
        prop.options.push({ _uid: nextOptUid(), _original: null, value: v });
      }
      prop._newOption = '';
    },
    removeOption(prop, uid) {
      const idx = prop.options.findIndex((o) => o._uid === uid);
      if (idx !== -1) prop.options.splice(idx, 1);
    },
    validate(built) {
      // labels não-vazios
      for (const p of this.props_) {
        if (!(p.label || '').trim()) return 'Toda propriedade precisa de um nome.';
        if (!p.system && p.type === 'formula') {
          if (!(p.expression || '').trim()) return `A fórmula "${p.label.trim()}" precisa de uma expressão.`;
        }
        if (!p.system && p.type === 'enum') {
          const vals = (p.options || []).map((o) => (o.value || '').trim());
          if (!vals.length) return `A lista "${p.label.trim()}" precisa de ao menos uma opção.`;
          if (vals.some((v) => !v)) return `A lista "${p.label.trim()}" tem uma opção sem nome.`;
          const seenOpt = new Set();
          for (const v of vals) {
            if (seenOpt.has(v)) return `A lista "${p.label.trim()}" tem a opção "${v}" duplicada.`;
            seenOpt.add(v);
          }
        }
      }
      // chaves únicas e válidas
      const seen = new Set();
      for (const key of Object.keys(built)) {
        if (!/^[A-Za-z0-9_]+$/.test(key)) return `Nome inválido: gera a chave "${key}".`;
        if (seen.has(key)) return `Duas propriedades geram a mesma chave "${key}". Use nomes distintos.`;
        seen.add(key);
      }
      return '';
    },
    build() {
      const properties = {};
      const usedKeys = new Set();
      const renames = [];
      const optionRenames = [];

      for (const p of this.props_) {
        let key;
        if (p.system) {
          key = p._originalKey; // sistema: chave original imutável
        } else {
          let base = slugify(p.label) || 'prop';
          key = base;
          let n = 2;
          while (usedKeys.has(key)) { key = `${base}_${n++}`; }
        }
        usedKeys.add(key);

        const spec = { type: p.type, label: (p.label || '').trim() };
        if (p.type === 'enum') {
          // achata opções (objeto -> string) e coleta renames de valor
          spec.options = (p.options || []).map((o) => (o.value || '').trim());
          for (const o of (p.options || [])) {
            const to = (o.value || '').trim();
            if (o._original && to && o._original !== to) {
              optionRenames.push({ property: key, from: o._original, to });
            }
          }
        }
        if (p.type === 'int') {
          if (p.min !== undefined && p.min !== null && p.min !== '') spec.min = Number(p.min);
          if (p.max !== undefined && p.max !== null && p.max !== '') spec.max = Number(p.max);
        }
        if (p.type === 'formula') {
          spec.expression = (p.expression || '').trim();
          if (p.round !== undefined && p.round !== null && p.round !== '') spec.round = Number(p.round);
        }
        // fórmula é derivada (read-only): nunca marca required
        if (p.required && p.type !== 'formula') spec.required = true;
        if (p.system) spec.system = true;
        if (p.default !== undefined) spec.default = p.default;

        properties[key] = spec;

        if (!p.system && p._originalKey && p._originalKey !== key) {
          renames.push({ from: p._originalKey, to: key });
        }
      }

      return { properties, renames, optionRenames };
    },
    save() {
      const { properties, renames, optionRenames } = this.build();
      const err = this.validate(properties);
      if (err) { this.error = err; return; }
      this.error = '';

      this.saving = true;
      saveProperties({ properties, renames, optionRenames })
        .then((updated) => { this.$emit('saved', updated); })
        .catch((e) => { this.error = e.message || 'Falha ao salvar.'; })
        .finally(() => { this.saving = false; });
    },
  },
};
</script>
