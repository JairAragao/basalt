# ADR-001 — Completion semantics: `doneGroupId` + `completed_at`/`completed_by`

- **Status**: accepted (2026-06-10)
- **Scope**: engine (board config + task frontmatter contract)

## Context

The engine had no notion of a "completed" task: no `completed_at` field, and the board
did not know which status group means "done". This blocked any reporting on throughput,
lead time or completion-by-user, and left "done" as a purely visual convention.

## Decision

1. **`board.json` gains an optional top-level `doneGroupId`** (string) referencing a
   `statusGroups[].id`. Absent/`null` = the vault has no completion semantics.
   On config load, an orphan reference **self-heals to `null`** (same pattern as orphan
   card/filter references). `PUT /api/board/status` validates strictly (400 on unknown id).
2. **`completed_at` (datetime) and `completed_by` (string)** join the audit-field family
   (`system` + `auto`, read-only in the UI), injected/normalized by `config.js` even for
   vaults seeded before this feature.
3. **`tasks-repo` is the only writer** and stamps **only on transition**:
   - status enters the done group → stamp `completed_at = now ISO`, `completed_by = git actor`;
   - status leaves the done group → both fields are removed;
   - everything else preserves the fields as-is — **legacy tasks already in done are
     never retro-stamped** (that would fabricate completion dates and produce phantom commits).
4. **The watcher is untouched.** The stamp must travel in the same commit as the move,
   and the watcher never commits.
5. `commit-msg.js` ignores both fields when describing changes (the message already says
   the status changed).

## Alternatives considered

- **`done: true` flag per group** (allows multiple done groups) — rejected: YAGNI; changes
  the `statusGroups` shape and complicates the Status editor. Revisit if demand appears.
- **Deriving completion from git history** (commit that moved the task) — rejected:
  accurate but expensive (reading per-task history) and complex; a stamped field keeps
  files-as-DB self-contained.
- **Stamping in the watcher** — rejected: the watcher never commits (invariant), so the
  stamp would be left uncommitted or force the watcher to commit.

## Consequences

- Old vaults work unchanged; marking a done group enables stamping from then on.
- Legacy tasks in done without a stamp appear as "completed, no date" in reports;
  an optional manual backfill is backlog material.
- New vaults are seeded with `doneGroupId` pointing at the template's done group.

## Resumo (pt-BR)

O board ganha `doneGroupId` (opcional, self-heal pra `null` se órfão). `completed_at`/
`completed_by` viram campos de auditoria (`system+auto`) carimbados pelo `tasks-repo`
**só na transição** pra dentro/fora do grupo done — legado nunca é retro-carimbado, o
watcher continua mudo, e a mensagem de commit ignora os carimbos.
