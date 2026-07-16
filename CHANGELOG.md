# Changelog

Todas as mudanças relevantes do Basalt estão documentadas aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); as versões seguem semver.

## [0.8.6] - 2026-07-16

### Adicionado

- **Aba "Atualizações" nas Configurações** — vê o **changelog das versões**, faz
  **verificação manual** ("Verificar agora"), escolhe o **intervalo de auto-verificação**
  (30 min / 1h / 3h / 6h / 24h) ou **desliga** de vez.
- **Modal de atualização estilizado** (tema do app, não mais o diálogo nativo) com
  "Reiniciar agora / Depois". **"Depois" adia pela sessão toda** — não reaparece popup
  nas próximas verificações; fica só um **destaque na barra lateral** ("Atualização
  disponível") que reabre o modal/leva pra aba.

### Mudado

- **Intervalo de auto-verificação agora é parametrizável** (default 3h) e pode ser
  desligado — antes era fixo. A checagem no boot respeita a preferência.

## [0.8.5] - 2026-07-16

### Mudado

- **Auto-update estilo VSCode** — além de checar no boot, agora **verifica de tempos
  em tempos** (a cada 3h) se há release nova no GitHub e **avisa dentro do app** com
  um banner discreto "Atualização pronta — Reiniciar" (em vez do diálogo nativo).
  Baixa em background; clicar em Reiniciar aplica na hora (ou aplica sozinha ao
  fechar). Também expõe checagem manual (IPC `update:check`).

## [0.8.4] - 2026-07-16

### Adicionado

- **Auto-update pela release mais recente do GitHub** (`electron-updater` +
  provider GitHub). O app empacotado checa `JairAragao/basalt`, baixa o novo
  instalador em background e oferece reiniciar (ou aplica ao fechar). Repo público
  → sem token pro usuário; funciona mesmo sem assinatura (NSIS). Releases passam a
  ser publicadas via `npm run release` (`electron-builder --publish always`), com
  `latest.yml` + `.blockmap` e nomes de asset que o updater entende. **0.8.4 é a
  primeira versão com updater** — instale-a manualmente; da próxima em diante é
  automático.

## [0.8.3] - 2026-07-16

### Mudado

- **Dashboard: cores do gráfico refletem as cores reais do agrupador** — ao agrupar
  por **status**, cada barra usa a cor da etapa (do board); para qualquer outro
  agrupador com cor de opção, usa a cor da opção (sem cor explícita, mantém o hash
  estável). Nada de cores aleatórias.
- **Dashboard: ordenação do agrupador** — alterna entre **Quantidade** (maior→menor)
  e **Sequência** (ordem declarada — etapas do board pro status, ordem das opções
  pros demais). Preferência lembrada.

### Corrigido

- **Flash branco no boot antes do splash** — o `index.html` cru não tinha fundo
  definido, aparecendo branco até o CSS (Tailwind) aplicar. Agora o fundo dark é
  inline no `<head>`, então nunca há um quadro branco antes da tela de carregamento.
- **Clicar abaixo do texto não criava linha nova** — clicar na área vazia abaixo do
  conteúdo agora cria/foca um parágrafo no fim (estilo Notion). Resolve o "trava"
  quando o último bloco é um **code block** (o Enter fica preso dentro dele).
- **Cursor não ia pro fim ao clicar no fim de uma linha escrita** — clicar à direita
  do texto de uma linha agora posiciona o caret no fim daquela linha visual.

## [0.8.2] - 2026-07-14

### Corrigido

- **Instalar extensão falhava no Windows (EPERM ao remover `.git`)** — o git marca
  arquivos do `.git/` como somente-leitura; o `fs.rmSync` (mesmo com force) dava
  EPERM. Agora a remoção limpa o atributo read-only da árvore antes de apagar (com
  retries). Vale pro `.git` do clone e pra remoção/limpeza de plugins.
- **Renomear a propriedade-título soltava o título do card** — renomear uma prop
  (ex.: `titulo` → `tarefa`) migrava o frontmatter das tarefas, mas `board.card.title`,
  `subtitle`, `badge`, `fields`, `filters`, `sort.by` e `schema.idFrom` continuavam
  apontando pro nome antigo → o card perdia o título e o campo virava uma propriedade
  comum. Agora essas referências acompanham o rename (self-heal).

## [0.8.1] - 2026-07-14

### Mudado

- **Notion Import virou um plugin em repositório próprio** (`basalt-plugin-notion-import`),
  extraído de `orchestra-basalt/scripts`. Instala pela aba **Extensões**; usa
  `BASALT_VAULT` pra escrever no vault ativo. Sem mudanças no engine (rebuild).

## [0.8.0] - 2026-07-14

### Adicionado

- **Aba de Extensões (plugins do GitHub)** — instale plugins colando `owner/repo`
  (ou a URL). O Basalt clona (`--depth 1`), lê o manifesto `basalt-plugin.json` +
  README (descrição) + ícone, roda `npm install` e mostra um card estilo VSCode.
  Configuração das variáveis do plugin por formulário (grava um `.env` local),
  execução com **log ao vivo** (SSE) e remoção. Instalação **por-vault**
  (`plugins/<name>/`, versionado no git do vault); `.env` e `node_modules` são
  gitignorados — segredos não viajam no push. Plugins rodam com o Node embutido
  (sem depender de node no PATH) e recebem `BASALT_VAULT`/`BASALT_PLUGIN_DIR`.
  Aviso explícito antes de executar (código de terceiros).

### Corrigido

- **Imagem no corpo do card não aparecia no `.md`** — com a imagem em bloco
  (`inline:false`), o serializer default do tiptap-markdown (inline) não emitia
  a marcação: o asset era salvo mas o `.md` ficava sem `![](…)` e nada renderizava
  no round-trip. Agora um serializer de bloco explícito grava `![](src)` em linha
  própria. Vale pros três caminhos (colar, arrastar, `/imagem`).

### Mudado

- **Versão do Basalt saiu do topo para o rodapé da barra lateral.**

## [0.7.0] - 2026-07-14

### Adicionado

- **Arrastar colunas no kanban** — cada etapa tem uma alça de arraste: reordene
  as colunas e **mova uma etapa de um grupo macro para outro** (ex.: "Finalizado"
  de *Concluído* → *Em andamento*) direto no board. Persiste na hora; grupo macro
  nunca fica sem etapa (reverte com aviso).
- **Menu ⋮ por coluna** — edição rápida de nome e cor da etapa num popover, sem
  abrir as Configurações.
- **Arrastar etapas entre grupos nas Configurações › Status** — além de reordenar,
  agora dá pra arrastar uma etapa de um grupo macro para outro; e reordenar os
  próprios grupos macro pela alça.
- **Imagem no corpo do card via "/"** — o menu de blocos ganhou "Imagem" (abre o
  seletor de arquivo). Colar (Ctrl+V) e arrastar-e-soltar já subiam a imagem pro
  vault (`assets/`) e inseriam a URL servível; o "/" completa os três caminhos.

### Mudado

- **Alternar Kanban/Lista saiu da topbar para a barra lateral** — virou submenu de
  *Tarefas*, com linha-guia e indentação (hierarquia clara) e barra âmbar no ativo.
  A preferência é lembrada (`basalt.tasksView`).
- **Instalador (Windows) voltou ao visual padrão** — o dark parcial do NSIS deixava
  botões/radios nativos claros (look quebrado, sem plugin de dark-mode); o padrão é
  consistente.

## [0.6.2] - 2026-06-18

### Mudado

- **Edição do card mais fluida (estilo Notion)** — o respiro lateral do corpo passou
  a fazer parte da área editável: clicar e arrastar na margem ao redor do texto já
  seleciona (sem precisar mirar no glifo) e clicar no fim da linha posiciona o cursor
  ali. O handle de bloco (6 pontinhos) saiu da borda do painel para o gutter coladinho
  ao texto, visível no hover de cada linha.
- **Status de salvamento no topo** — a barra inferior "Salvando…/Salvo ✓" deu lugar a
  um indicador discreto no header do card: ponto âmbar (pendente), spinner (salvando),
  ✓ verde efêmero (salvou) e nada quando tudo está salvo. Erro vira ícone vermelho com
  a mensagem no tooltip.

## [0.6.1] - 2026-06-18

### Corrigido

- **Sincronização não trava mais em divergência** — o push em background era um
  `git push` puro: ao ser rejeitado por *non-fast-forward* (remoto à frente, ex.
  outra máquina rodando o Basalt), nada reintegrava o remoto e os commits locais
  iam se acumulando à frente do origin — o `pull --ff-only` deixava de avançar e a
  sincronização ficava presa até intervenção manual. Agora o push se **auto-cura**:
  ao detectar divergência, faz `pull --rebase --autostash` (empilha o working tree,
  rebaseia os commits locais sobre o remoto, devolve o stash) e re-tenta o push (até
  3x). Conflito real de conteúdo aborta o rebase com o working tree intacto (sem
  marcadores que corromperiam o `.md`) e sinaliza `diverged`. Os commits integrados
  pelo push viram notificações, como no pull manual.

### Notas

- Suite de testes: 103 → 107 (integração real de push: divergência limpa, conflito
  real e sem-remote).

## [0.6.0] - 2026-06-11

### Adicionado

- **Opções com cor, editáveis inline** — renomeie, recolora (paleta de 13) e exclua
  opções de enum/multiselect direto do select no card ou nas Configurações, estilo
  Notion. A cor vive no schema do vault (`options` aceita `string | {value, color}`);
  sem cor, vale a cor automática. Renomear preserva a cor e migra as tarefas.
- **Filtros que seguem o tipo do campo** — texto livre (ignora caixa/acentos) pra
  `string`, número exato pra `int`, intervalo de datas pra `datetime` (agora filtrável),
  selects pra enum/usuário. Combinam por E; contagens sempre do conjunto completo.
- **Janela de render incremental** — kanban (50/coluna) e tabela (100 + "Mostrando X de
  Y") carregam mais ao rolar; vaults grandes não travam a tela.
- **Sync configurável** — nova aba "Sync" nas Configurações: intervalo do auto-pull
  (desligado a 15 min) e estratégia em conflito (rebase com abort seguro · só
  fast-forward · perguntar). Falha de pull nunca mais é silenciosa (ícone âmbar + aviso;
  modal no modo perguntar).

### Mudado

- Sidebar no padrão ACM: botão flutuante na borda pra expandir/recolher, **Dashboard
  acima de Tarefas** e Configurações ancorada no rodapé.
- Selects: a pseudo-opção "— limpar —" morreu; limpar agora é um **X** à direita do
  valor. Busca do select indica "Buscar ou criar…".
- Logo do header: sem o quadrado, centralizado, maior e com a luz pulsante do splash.
- Barras do dashboard por enum usam a cor de cada opção.

### Notas

- Documentação principal passou a ser em português (inglês como alternativa `.en.md`).
- Suite de testes: 64 → 103 (options/optionMeta, integração real de pull com conflito,
  filtros).
- Idioma da interface (pt/EN) ficou para a 0.7.0.

## [0.5.0] - 2026-06-10

### Adicionado

- **Sidebar de navegação** — rail lateral recolhido por padrão com **Tarefas**,
  **Dashboard** e **Configurações**; a view ativa é lembrada **por vault** e restaurada
  ao trocar de aba.
- **Dashboard de relatórios** — contagens de criadas / finalizadas / abertas, lead time
  médio, série temporal criadas×finalizadas (uPlot, carregado sob demanda) e quebras por
  usuário do roster e por qualquer propriedade `enum`. Agregação 100% no cliente
  ([ADR-002](docs/adr/ADR-002-client-side-reports.md)).
- **Semântica de conclusão** — marque um grupo de status como grupo de "conclusão" no
  editor de Status; o engine carimba `completed_at`/`completed_by` automaticamente na
  transição (e limpa quando a tarefa sai do grupo). Tarefas legadas nunca são
  retro-carimbadas ([ADR-001](docs/adr/ADR-001-done-semantics.md)).
- **Estrutura open source** — licença MIT, README/CONTRIBUTING bilíngues (pt-BR
  principal + EN), código de conduta, política de segurança, templates de issue/PR,
  `docs/ARCHITECTURE.md` e ADRs.

### Mudado

- Configurações saíram da engrenagem do header e foram pra sidebar.
- Vault novo já nasce com a semântica de conclusão ativa (`doneGroupId` no board padrão).

### Notas

- Instalador não assinado — o SmartScreen do Windows avisa na primeira execução
  ("Mais informações" → "Executar assim mesmo").
- Suite de testes do server cresceu de 40 pra 64 testes (tasks-repo, config e reports
  agora cobertos).

## [0.4.0] - 2026-06-09

Resumo retroativo (era pré-changelog), a partir do histórico git:

- **Abas** multi-vault, **roster** de usuários (`config/users.json`) com identidade git
  estável, **notificações por pull**, GC de assets órfãos e migração de opções de enum.
- Auto-save, selects editáveis inline, chips coloridos nos cards, status/blocos estilo
  Notion.
- Mensagens de commit automáticas descritivas (só o que mudou, ciente do título).
- Instalador assistido dark; histórico do card paginado; badge de versão no header.
