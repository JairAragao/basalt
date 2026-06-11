# Basalt — Architecture

[Português (Brasil)](ARCHITECTURE.md) · **English**

How Basalt actually works, for people who want to contribute. Last full audit: 2026-06-10 (v0.5.0).

## The big picture

Three repositories, one boundary:

| Repo | Role |
|---|---|
| **basalt** (this one) | The generic **engine**: server, SPA, Electron shell. Ships empty. |
| **basalt-vault** | A **vault**: `config/` + `tasks/` + its own git repo. Your data. |
| **basalt-lp** | Static landing page with download links. |

```
┌─ Electron main ── starts the server on a free 127.0.0.1 port, IPC for folder picker
│
│  ┌─ Vue 3 SPA (app/src) ── board / table / peek / dashboard / settings
│  │        │ fetch /api
│  ▼        ▼
│  Express server (server/) ── thin layer of fs + git over the vault
│        │
│        ▼
│  VAULT (separate folder & git repo)
│    config/schema.json   ← properties (string, enum, int, formula, datetime, user)
│    config/board.json    ← groups, stages, colors, card, sort, filters, doneGroupId
│    config/users.json    ← roster (optional)
│    tasks/*.md           ← one task = one markdown file (frontmatter + body)
│    assets/*             ← uploaded images (raster only)
└──────
```

**The engine is generic.** No client/workflow-specific property names exist in the code;
behavior is driven by the vault's `schema.json`/`board.json`, read at runtime. Anything
workflow-specific belongs in vault config (or a future preset) — this is enforced in review.

## Canonical flow of a save

```
UI (auto-save) → PUT /api/tasks/:id
  → tasks-repo: validate (schema) → strip managed/derived fields from input
    → preserve foreign frontmatter keys + formula results → stamp updated_at/by
    → ATOMIC write (.tmp + rename, path-safe)
  → commit-msg.describeChanges(before, after) builds a human message (pt-BR)
  → gitChain (single promise queue) commits — awaited, local, fast
  → push runs in background, coalesced; failures surface as `warning` on the NEXT response
  → watcher (chokidar) sees the change → recomputes formula fields → rewrites ONLY if a
    value changed (anti-loop) → stamps computed_at → NEVER commits
```

## Invariants (what keeps this safe)

1. **Atomic + path-safe writes** — every vault file write goes through `.tmp` + rename;
   ids are regex-validated and resolved paths must stay inside `tasks/`/`assets/`.
2. **Serialized git** — one promise chain (`gitChain`) + `simple-git` with
   `maxConcurrentProcesses: 1`: no `index.lock` races. Commits are awaited; pushes are
   background and best-effort (offline never breaks a save — you get a `warning`).
3. **The watcher is mute and idempotent** — recomputes formulas, rewrites only on change,
   never commits (derived values ride along with the next user commit).
4. **Self-heal over errors** — orphan config references (a removed property still used by
   card/filters/sort/`doneGroupId`) are pruned on load; `validate.js` tolerates unknown
   keys (e.g. `icon`/`cover` pass through untouched).
5. **Hardened Electron** — `contextIsolation: true`, `nodeIntegration: false`, restrictive
   CSP, minimal IPC (folder picker, window controls, ready signal), server bound to
   `127.0.0.1` on a free port.
6. **Generic engine** — see above; the 2026-06 audit found zero hardcoded client names
   (the `gute.js` shim is legacy test-compat, not seeded into new vaults).

## Server modules (`server/`, ~3.2k LOC)

| File | ~LOC | Responsibility |
|---|---|---|
| `index.js` | 45 | boot: express + `/api` + static `app/dist` (prod) + watcher start; auto-listen only via `node` (Electron controls listen) |
| `config.js` | 520 | vault resolution (settings › env › default), seed, reload, validation, derivations (columns, status options, formula keys, `doneStageIds`), audit-field normalization, roster & notifications storage |
| `routes.js` | 1030 | the REST API (31 endpoints), git serialization, automatic commit messages, asset GC, identity resolution, pull notifications |
| `tasks-repo.js` | 200 | task CRUD over `.md` files: validation, atomic writes, audit stamps, completion stamps (ADR-001), foreign-key preservation |
| `git.js` | 476 | commit/push/pull, identity (+ stable `basalt.userid`), history/diff, health check; non-interactive, 8s timeout |
| `commit-msg.js` | 120 | pure: before/after frontmatter diff → human commit message (audit/stamp fields ignored) |
| `validate.js` | 223 | pure: schema validation (tolerant of unknown keys/types), id generation |
| `formula.js` | 130 | generic formula engine (`expr-eval-fork`, `parser.consts = {}`, missing/div-zero → `null`) |
| `watcher.js` | 148 | chokidar over `tasks/*.md`: recompute, anti-loop, `computed_at`, re-watches on vault switch |
| `gute.js` | 25 | legacy shim → `formula.js` (kept for old tests; not seeded) |

## Feature notes

- **Multi-vault tabs** — tabs are UI; the backend is a **single-vault singleton**.
  Switching tabs = `POST /api/vaults/switch` → config reload → watcher re-watches.
  The vault list lives in `~/.basalt/settings.json`.
- **Roster** — `config/users.json` (versioned): stable user id ↔ display name ↔ git
  identities. Auto-registration writes `basalt.userid` to the **global** git config so the
  identity travels across vaults. No login — identity always derives from git.
- **Pull notifications** — after `POST /sync/pull`, commits by other authors touching
  tasks where you are the responsible become local notifications
  (`~/.basalt/notifications.json`, capped at 200, not versioned).
- **Asset GC** — replacing/removing a task's `icon`/`cover` deletes the orphaned asset
  (if nothing else references it), best-effort, committed.
- **Completion semantics (0.5.0)** — `board.json#doneGroupId` marks the "done" group;
  `tasks-repo` stamps `completed_at`/`completed_by` **only on transition** into the group
  and clears them on the way out. Legacy tasks are never retro-stamped. See
  [ADR-001](adr/ADR-001-done-semantics.md).
- **Reports dashboard (0.5.0)** — aggregates client-side in `app/src/reports.js` (pure,
  unit-tested) over `GET /tasks`; uPlot renders the time series inside a lazy chunk.
  Revisit server-side aggregation only past ~5k tasks. See
  [ADR-002](adr/ADR-002-client-side-reports.md).

## Known edges (accepted, single-user scale)

- A git process killed by the 8s timeout can leave a stale `.git/index.lock` in the vault
  (recovery: remove it / next save).
- Switching vaults with a commit in flight may leave that save uncommitted (it IS on disk;
  recovery: any next save or `git status`).
- PowerShell 5.1 mangles UTF-8 JSON bodies (accented stage ids) — use UTF-8 bytes when
  scripting against the API on Windows; browsers/Electron are unaffected.
