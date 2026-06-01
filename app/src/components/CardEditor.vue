<template>
  <div class="flex h-full flex-col">
    <div class="flex-1 overflow-y-auto pr-1">
      <p class="mb-3 text-[12px] text-muted">Escolha o que aparece na face do cartão, antes de abrir.</p>

      <!-- propriedades como etiquetas -->
      <div class="mb-5">
        <div class="mb-2 text-[12px] font-medium text-faint">Etiquetas no cartão</div>
        <label
          v-for="p in toggleProps"
          :key="p.key"
          class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-ink-700"
        >
          <input type="checkbox" class="accent-accent" :checked="fields.includes(p.key)" @change="toggleField(p.key)" />
          <span class="text-[13px] text-txt">{{ p.label }}</span>
          <span class="text-[11px] text-faint">{{ p.key }}</span>
        </label>
        <p v-if="!toggleProps.length" class="px-2 text-[12px] text-faint">Sem propriedades.</p>
      </div>

      <!-- subtítulo + etiqueta de destaque -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <div class="mb-1.5 text-[12px] font-medium text-faint">Subtítulo (rodapé do card)</div>
          <Dropdown :value="subtitle" :options="propOptions" placeholder="nenhum" clearable @input="(v) => (subtitle = v || '')" />
        </div>
        <div>
          <div class="mb-1.5 text-[12px] font-medium text-faint">Destaque (badge)</div>
          <Dropdown :value="badge" :options="badgeOptions" placeholder="nenhum" clearable @input="(v) => (badge = v || '')" />
        </div>
      </div>

      <p v-if="error" class="mt-3 text-[12px] text-red-300">{{ error }}</p>
    </div>

    <div class="mt-3 flex flex-shrink-0 justify-end gap-2 border-t border-ink-500 pt-3">
      <button
        class="rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
        :disabled="saving"
        @click="save"
      >{{ saving ? 'Salvando…' : 'Salvar' }}</button>
    </div>
  </div>
</template>

<script>
import Dropdown from './Dropdown.vue';
import { saveCard } from '../api';

export default {
  name: 'CardEditor',
  components: { Dropdown },
  props: { config: { type: Object, required: true } },
  data() {
    const card = (this.config.board && this.config.board.card) || {};
    return {
      fields: Array.isArray(card.fields) ? [...card.fields] : [],
      subtitle: card.subtitle || '',
      badge: card.badge || '',
      saving: false,
      error: '',
    };
  },
  computed: {
    schemaProps() { return (this.config.schema && this.config.schema.properties) || {}; },
    derived() { return (this.config.schema && this.config.schema.derived) || []; },
    titleKey() { return (this.config.board && this.config.board.card && this.config.board.card.title) || 'titulo'; },
    toggleProps() {
      return Object.keys(this.schemaProps)
        .filter((k) => k !== this.titleKey)
        .map((k) => ({ key: k, label: this.schemaProps[k].label || k }));
    },
    propOptions() {
      return this.toggleProps.map((p) => ({ value: p.key, label: p.label }));
    },
    badgeOptions() {
      const opts = this.propOptions.slice();
      this.derived.forEach((k) => opts.push({ value: k, label: k }));
      return opts;
    },
  },
  methods: {
    toggleField(key) {
      const i = this.fields.indexOf(key);
      if (i >= 0) this.fields.splice(i, 1);
      else this.fields.push(key);
    },
    async save() {
      this.error = '';
      this.saving = true;
      try {
        const updated = await saveCard({ fields: this.fields, subtitle: this.subtitle, badge: this.badge });
        this.$emit('saved', updated);
      } catch (e) {
        this.error = e.message || 'Falha ao salvar.';
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>
