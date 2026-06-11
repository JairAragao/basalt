# Contribuindo com o Basalt

**Português (Brasil)** · [English](CONTRIBUTING.en.md)

Obrigado por considerar contribuir. Este documento te leva do zero a um PR verde.

## Setup do zero

```bash
git clone https://github.com/JairAragao/basalt.git
cd basalt
nvm use 20        # Node ≥ 18 obrigatório (Vite quebra no 16); .nvmrc diz 20
npm install
npm run dev       # backend :4317 + Vite :5173 (proxy /api → :4317)
```

> **Aviso de porta:** o backend de dev sobe na **:4317**. Não mate processos nessa porta
> pra "liberá-la" — provavelmente é o dev server de alguém rodando. Se precisar fazer
> smoke-test do server isolado, suba em outra porta:
> `PORT=4399 node server/index.js` (qualquer porta livre serve).

Na primeira execução o app mostra o SetupWizard — aponte pra uma pasta descartável
(seu vault de teste), **não** pro repo do engine.

## Testes

```bash
npm test          # Vitest, roda server/*.test.js + app/src/*.test.js
```

A suíte precisa estar verde antes de qualquer PR. Comportamento novo em `server/` ou em
módulos puros do front (como `app/src/reports.js`) deve vir com testes — aumentar a
cobertura é uma das formas mais fáceis e bem-vindas de contribuir (veja as issues com
label `good first issue`).

## Build

```bash
npm run build     # build de produção do Vite → app/dist
```

Build verde faz parte do checklist de PR. Fique de olho no tamanho dos chunks: views
pesadas carregam lazy (`defineAsyncComponent`) — o editor de corpo TipTap, o emoji
picker e o dashboard de relatórios são chunks lazy. Não puxe dependência pesada pro
bundle inicial.

## Empacotamento (Electron)

```bash
npm run electron:build   # instalável em release/
```

Gotchas de Windows, aprendidos na dor:

- **Feche o app antes.** Uma instância do Basalt rodando trava arquivos que o
  electron-builder precisa sobrescrever — o build falha ou gera artefato quebrado.
- **Cache do winCodeSign + symlinks darwin**: o pacote `winCodeSign` do electron-builder
  contém symlinks de macOS que falham ao extrair no Windows. Pré-extraia o cache *sem*
  a pasta `darwin/` (ou remova-a do cache extraído) antes de buildar.
- **Exit code mascarado por pipe**: se você embrulhar o build num pipeline de shell, o
  exit code do pipeline pode mascarar a falha do electron-builder. Confira o output do
  build e os artefatos em `release/` — não confie só no exit code do pipe.

Os instaladores hoje são **não assinados** (SmartScreen/Gatekeeper avisam). Code signing
está no roadmap; não tente resolver num PR de passagem.

## Gotchas de código que pegam

- **`tiptap-markdown` está pinado em `0.8.10`.** Versões 0.9+ exigem TipTap v3 e o
  projeto usa TipTap v2 (`@tiptap/* ^2.27.2`). Não suba sem migrar toda a stack do editor.
- **`expr-eval` precisa de `parser.consts = {}`.** Sem isso, `E` vira o número de Euler
  e `PI` vira π — colidindo com nomes legítimos de campo em fórmulas.
- **Escrita atômica é obrigatória.** Todo arquivo que o engine escreve passa por
  `.tmp` + `rename` (ver `tasks-repo.js`). Nunca dê `writeFileSync` direto num arquivo
  de tarefa.
- **O watcher nunca commita e tem anti-loop.** Ele só recalcula campos de fórmula e só
  regrava o arquivo quando um valor derivado realmente mudou (e então carimba
  `computed_at`). Não adicione operações git nem novos caminhos de escrita no
  `watcher.js`.
- **`validate.js` é tolerante por design.** Tipos de propriedade desconhecidos e chaves
  desconhecidas no frontmatter não podem quebrar a validação — usuários editam `.md` à
  mão, e chaves estrangeiras são preservadas, não destruídas.
- **Chaves de `localStorage` usam o prefixo `basalt.`** (`basalt.peekMode`,
  `basalt.sidebarOpen`, `basalt.viewByVault`, `basalt.dashRange`, …). Renomear uma chave
  reseta silenciosamente a preferência salva — aceitável, mas faça sabendo.
- **Use `Dropdown.vue`, nunca `<select>` nativo.** Idem pro resto do design system:
  paleta dark é `ink-*` / `txt` / `muted` / `faint` com accent `#d9a01e` (âmbar),
  definida no `tailwind.config.js`; pegue cores do `palette.js`, não invente hex novo.

## A regra de ouro: fronteira engine ↔ vault

**Nada específico de cliente ou de workflow entra no engine.** Nenhum nome de campo
hardcoded, nenhuma regra especial de board, nenhum "se for tal vault, faça tal coisa".
Se um comportamento é específico de um caso de uso, ele precisa ser expressável como
**config do vault** (`schema.json` / `board.json`) ou, no futuro, como preset/plugin.
PRs que hardcodam o workflow de alguém em `server/` ou `app/src/` vão receber pedido de
generalização.

Um bom teste de cheiro: essa mudança faria sentido pra um vault que você nunca viu?

## Fluxo de contribuição

1. **Fork** do repo e branch a partir da `main`.
2. Faça a mudança, commits pequenos. Estilo de mensagem:
   `feat(escopo): descrição curta` / `fix(escopo): …` — o histórico é majoritariamente
   em pt-BR, mas **commits em inglês de contribuidores são bem-vindos**.
3. Abra um **PR contra a `main`** e preencha o template.

### Checklist de PR

- [ ] `npm test` verde
- [ ] `npm run build` verde
- [ ] O engine continua genérico (sem hardcode de cliente/vault)
- [ ] Docs atualizadas **nos dois idiomas** quando o comportamento muda — pt-BR é o
      principal, EN a alternativa (`README.md` + `README.en.md`,
      `docs/ARCHITECTURE.md` + `docs/ARCHITECTURE.en.md`, …)
- [ ] Sinalizou se a mudança exige rebuild do instalável (toca `server/`, `app/`,
      `electron/` ou `defaults/`)

## Sobre o `"private": true`

O `"private": true` no `package.json` é **intencional**: ele só impede um `npm publish`
acidental. O Basalt é um app, não uma lib npm — o pacote não é publicado no registry.
Não remova a flag.

## Código de conduta e segurança

Ao participar você concorda com o [Código de Conduta](CODE_OF_CONDUCT.md).
Pra vulnerabilidades, siga o [SECURITY.md](SECURITY.md) — não abra issue pública.
