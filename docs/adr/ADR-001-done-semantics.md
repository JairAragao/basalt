# ADR-001 — Semântica de conclusão: `doneGroupId` + `completed_at`/`completed_by`

- **Status**: aceita (2026-06-10)
- **Escopo**: engine (config do board + contrato do frontmatter da tarefa)

## Contexto

O engine não tinha noção de tarefa "concluída": nenhum campo `completed_at`, e o board
não sabia qual grupo de status significa "feito". Isso bloqueava qualquer relatório de
throughput, lead time ou conclusão por usuário — "concluído" era só convenção visual.

## Decisão

1. **`board.json` ganha um `doneGroupId` opcional no topo** (string) referenciando um
   `statusGroups[].id`. Ausente/`null` = o vault não tem semântica de conclusão.
   No load da config, referência órfã faz **self-heal pra `null`** (mesmo padrão das refs
   órfãs de card/filtros). O `PUT /api/board/status` valida estrito (400 pra id desconhecido).
2. **`completed_at` (datetime) e `completed_by` (string)** entram na família de campos de
   auditoria (`system` + `auto`, read-only na UI), injetados/normalizados pelo `config.js`
   inclusive em vaults semeados antes desta feature.
3. **O `tasks-repo` é o único escritor** e carimba **só na transição**:
   - status entra no grupo done → carimba `completed_at = now ISO`, `completed_by = ator git`;
   - status sai do grupo done → os dois campos são removidos;
   - todo o resto preserva os campos como estão — **tarefa legada já em done nunca é
     retro-carimbada** (fabricaria data de conclusão falsa e geraria commits fantasma).
4. **O watcher não é tocado.** O carimbo precisa viajar no mesmo commit do move, e o
   watcher nunca commita.
5. O `commit-msg.js` ignora os dois campos na descrição (a mensagem já diz que o status mudou).

## Alternativas descartadas

- **Flag `done: true` por grupo** (permitiria N grupos done) — rejeitada: YAGNI; muda o
  shape de `statusGroups` e complica o editor de Status. Revisitar se surgir demanda.
- **Derivar conclusão do histórico git** (commit que moveu a tarefa) — rejeitada: precisa
  porém cara (ler histórico por tarefa) e complexa; campo carimbado mantém o files-as-DB
  auto-contido.
- **Carimbar no watcher** — rejeitada: o watcher nunca commita (invariante), então o
  carimbo ficaria sem versionar ou forçaria o watcher a commitar.

## Consequências

- Vaults antigos funcionam sem mudança; marcar um grupo done liga o carimbo dali em diante.
- Tarefa legada em done sem carimbo aparece como "concluída, sem data" nos relatórios;
  backfill manual opcional fica no backlog.
- Vault novo é semeado com `doneGroupId` apontando pro grupo de conclusão do template.

## Summary (EN)

`board.json` gains an optional top-level `doneGroupId` (self-heals to `null` when
orphaned). `completed_at`/`completed_by` become audit fields (`system+auto`) stamped by
`tasks-repo` **only on transition** into/out of the done group — legacy tasks are never
retro-stamped, the watcher stays mute, and commit messages ignore the stamps.
