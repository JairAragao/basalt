# Contributing to Basalt

[Português (Brasil)](CONTRIBUTING.md) · **English**

Thanks for considering a contribution. This document gets you from zero to a green PR.

## Setup from scratch

```bash
git clone https://github.com/JairAragao/basalt.git
cd basalt
nvm use 20        # Node ≥ 18 required (Vite breaks on 16); .nvmrc says 20
npm install
npm run dev       # backend :4317 + Vite :5173 (proxy /api → :4317)
```

> **Port warning:** the dev backend binds to **:4317**. Do not kill processes on that
> port to "free it up" — it is probably someone's running dev server. If you need to
> smoke-test the server in isolation, start it on a separate port:
> `PORT=4399 node server/index.js` (any free port works).

On first run the app shows the Setup Wizard — point it at a scratch folder (your test
vault), **not** at the engine repo itself.

## Tests

```bash
npm test          # Vitest, runs server/*.test.js + app/src/*.test.js
```

The suite must be green before any PR. New behavior in `server/` or in pure front
modules (like `app/src/reports.js`) should come with tests — test coverage is one of
the easiest and most welcome ways to contribute (see the open issues labeled
`good first issue`).

## Build

```bash
npm run build     # Vite production build → app/dist
```

A green build is part of the PR checklist. Keep an eye on chunk sizes: heavy views are
loaded lazily (`defineAsyncComponent`) — the TipTap body editor, the emoji picker and
the reports dashboard are all lazy chunks. Don't pull heavy dependencies into the
initial bundle.

## Packaging (Electron)

```bash
npm run electron:build   # installer in release/
```

Windows gotchas, learned the hard way:

- **Close the app first.** A running Basalt instance locks files that electron-builder
  needs to overwrite — the build fails or produces a broken artifact.
- **winCodeSign cache + darwin symlinks**: electron-builder's `winCodeSign` archive
  contains macOS symlinks that fail to extract on Windows. Pre-extract the cache
  *without* the `darwin/` folder (or remove it from the extracted cache) before building.
- **Exit codes masked by pipes**: if you wrap the build in a shell pipeline, the
  pipeline's exit code can mask electron-builder's failure. Check the build output and
  the artifacts in `release/` — don't trust the pipe's exit code alone.

Installers are currently **unsigned** (SmartScreen/Gatekeeper will warn). Code signing
is on the roadmap; don't try to fix it in a drive-by PR.

## Code gotchas that will bite you

- **`tiptap-markdown` is pinned to `0.8.10`.** Versions 0.9+ require TipTap v3 and this
  project is on TipTap v2 (`@tiptap/* ^2.27.2`). Do not bump it without migrating the
  whole editor stack.
- **`expr-eval` needs `parser.consts = {}`.** Without it, `E` resolves to Euler's number
  and `PI` to π — which collide with legitimate field names in formulas.
- **Atomic writes are mandatory.** Every file the engine writes goes through
  `.tmp` + `rename` (see `tasks-repo.js`). Never `writeFileSync` directly to a task file.
- **The watcher never commits and is loop-proof.** It only recomputes formula fields and
  only rewrites a file when a derived value actually changed (then stamps `computed_at`).
  Do not add git operations or new write paths to `watcher.js`.
- **`validate.js` is tolerant by design.** Unknown property types and unknown frontmatter
  keys must not break validation — users hand-edit `.md` files, and foreign keys are
  preserved, not destroyed.
- **`localStorage` keys use the `basalt.` prefix** (`basalt.peekMode`,
  `basalt.sidebarOpen`, `basalt.viewByVault`, `basalt.dashRange`, …). Renaming a key
  silently resets the stored preference — acceptable, but do it knowingly.
- **Use `Dropdown.vue`, never a native `<select>`.** Same for the rest of the design
  system: dark palette is `ink-*` / `txt` / `muted` / `faint` with accent `#d9a01e`
  (amber), defined in `tailwind.config.js`; pick colors from `palette.js`, don't invent
  new hex values.

## The golden rule: engine ↔ vault boundary

**Nothing customer- or workflow-specific goes into the engine.** No hardcoded field
names, no special-cased board rules, no "if this vault then that". If a behavior is
specific to one use case, it must be expressible as **vault config** (`schema.json` /
`board.json`) or, in the future, as a preset/plugin. PRs that hardcode someone's
workflow into `server/` or `app/src/` will be asked to generalize.

A good smell test: would this change make sense for a vault you have never seen?

## Contribution flow

1. **Fork** the repo and create a branch from `main`.
2. Make your change, keep commits small. Commit message style:
   `feat(scope): short description` / `fix(scope): …` — the history is mostly in
   Brazilian Portuguese, but **English commits from contributors are welcome**.
3. Open a **PR against `main`** and fill in the template.

### PR checklist

- [ ] `npm test` green
- [ ] `npm run build` green
- [ ] The engine stays generic (no customer/vault-specific hardcode)
- [ ] Docs updated **in both languages** when behavior changes — pt-BR is primary, EN
      is the alternate (`README.md` + `README.en.md`,
      `docs/ARCHITECTURE.md` + `docs/ARCHITECTURE.en.md`, …)
- [ ] Flagged whether the change requires rebuilding the installer (touches `server/`,
      `app/`, `electron/` or `defaults/`)

## About `"private": true`

The `"private": true` in `package.json` is **intentional**: it only prevents accidental
`npm publish`. Basalt is an app, not an npm library — the package is not published to
the registry. Don't remove the flag.

## Code of conduct & security

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
For vulnerabilities, please follow [SECURITY.md](SECURITY.md) — do not open public issues.
