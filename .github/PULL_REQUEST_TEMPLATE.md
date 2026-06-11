## What & why

<!-- What does this PR change, and what problem does it solve? -->

## Checklist

- [ ] `npm test` is green (Vitest)
- [ ] `npm run build` is green (Vite)
- [ ] The engine stays **generic** — no client/workflow-specific names hardcoded
      (specific behavior belongs in vault config or a preset)
- [ ] Vault file writes (if any) are atomic (`.tmp` + rename) and path-safe
- [ ] Public docs updated **in pairs** — pt-BR primary + `.en.md` alternate — when behavior/API changed
- [ ] Marked below whether this requires rebuilding the installer

**Requires installer rebuild?** yes / no — <!-- touches server/, electron/, defaults/ or the packaged front -->
