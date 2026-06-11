<template>
  <Board
    v-if="view === 'kanban'"
    :tasks="tasks"
    :config="config"
    :color-columns="colorColumns"
    :sort="sort"
    @open="$emit('open', $event)"
    @delete="$emit('delete', $event)"
    @moved="$emit('moved', $event)"
    @config-saved="$emit('config-saved', $event)"
    @error="$emit('error', $event)"
  />
  <TableView
    v-else
    :tasks="tasks"
    :config="config"
    :sort="sort"
    @open="$emit('open', $event)"
    @sort="$emit('sort', $event)"
  />
</template>

<script>
import Board from '../components/Board.vue';
import TableView from '../components/TableView.vue';

// Extração MÍNIMA do bloco board/tabela do App.vue — pass-through puro de
// props/eventos, zero lógica própria (a lógica continua no App).
export default {
  name: 'TasksView',
  components: { Board, TableView },
  props: {
    tasks: { type: Array, default: () => [] },
    config: { type: Object, required: true },
    view: { type: String, default: 'kanban' }, // 'kanban' | 'table'
    colorColumns: { type: Boolean, default: false },
    sort: { type: Object, default: null },
  },
  emits: ['open', 'delete', 'moved', 'config-saved', 'error', 'sort'],
};
</script>
