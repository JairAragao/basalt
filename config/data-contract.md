# Contrato de dados — tarefa do `orchestra-tasks`

Cada tarefa é um arquivo `.md` em `tasks/`. O **registro** vive no
**frontmatter** YAML (bloco entre `---`); o corpo do arquivo é a descrição
livre (markdown). O **schema** é `config/schema.json` — ele é a fonte da
verdade sobre quais campos existem, seus tipos e suas regras.

Este doc serve de referência para o `README`, para o app/IA que cria tarefas
e para quem for migrar do Notion no futuro.

---

## Campos do frontmatter

### Identificador

| Campo | Tipo | Origem | Descrição |
|---|---|---|---|
| `id` | string | gerado | Identificador único da tarefa (ver "Geração de id" abaixo). Deve bater com o nome do arquivo. |

### Campos de input (app / IA escrevem)

São os campos definidos em `schema.properties`. Quem cria/edita a tarefa
(app web ou agente de IA) é responsável por preenchê-los.

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `titulo` | string | **sim** | Não pode ser vazio. É a base do slug do `id`. |
| `status` | enum | **sim** | Um de: `todo`, `doing`, `review`, `done`. Default: `todo`. |
| `responsavel` | string | não | Apelido de quem toca a tarefa. |
| `modulo` | enum | não | Um de: `MRP`, `Fiscal`, `Financeiro`, `Estoque`, `Comercial`, `Qualidade`, `Admin`, `Outro`. |
| `tipo` | enum | não | Um de: `bug`, `feature`, `melhoria`, `doc`. |
| `branche` | string | não | Branch de trabalho (convenção: inglês + `snake_case`). |
| `G` | int (1–5) | não | Gravidade (matriz GUT). |
| `U` | int (1–5) | não | Urgência (matriz GUT). |
| `T` | int (1–5) | não | Tendência (matriz GUT). |
| `E` | int (1–5) | não | Esforço (pondera a prioridade). |

> Regras de tipo aplicadas pela validação:
> - `int`: precisa ser inteiro; `min`/`max` do schema são respeitados.
> - `enum`: se presente, precisa estar em `options`.
> - `string`: coerção simples; só falha se for obrigatório e vier vazio.
> - Campos opcionais ausentes/vazios não geram erro.

### Campos derivados (watcher escreve)

São os campos listados em `schema.derived`. **Nunca** devem ser escritos
pelo app nem pela IA — são calculados e gravados pelo watcher do servidor a
partir de `G/U/T/E` (regra em `config/gute.json`, cálculo em
`server/gute.js`).

| Campo | Tipo | Descrição |
|---|---|---|
| `GUT` | int/null | `G * U * T`. `null` se algum de G/U/T faltar. |
| `prioridade_gute` | number/null | `G * U * T / E`. `null` se algum input faltar ou `E = 0`. |
| `gute_computed_at` | timestamp | Momento do último cálculo (ISO 8601). |

A **validação de tarefa** (`server/validate.js`) ignora esses campos: se
vierem no `data`, não são validados nem geram erro. Isso evita que a IA
"polua" os derivados e mantém o cálculo como responsabilidade única do
watcher.

---

## Geração de `id`

Formato:

```
<idPrefix><YYYY-MM-DD>-<slug>
```

- `idPrefix`: vem do schema (atualmente `T-`).
- `YYYY-MM-DD`: **data atual** no momento da criação (horário local).
- `slug`: derivado de `data[schema.idFrom]` (atualmente `titulo`).

Exemplo: título `"Corrigir cálculo de necessidade no MRP"` criado em
2026-06-01 → `T-2026-06-01-corrigir-calculo-de-necessidade-no-mrp`.

### Regra do slug

1. Minúsculas.
2. Remove acentos (`ç → c`, `ã → a`, etc.).
3. Tudo que não for `[a-z0-9]` vira `-`.
4. Colapsa `-` repetidos em um só.
5. Corta em **60 caracteres**.
6. Remove `-` das pontas.
7. Se o campo de origem (`titulo`) vier vazio, usa `tarefa` como base.

O `id` deve corresponder ao nome do arquivo `.md` em `tasks/` (sem extensão).

---

## Separação de escrita

| Quem escreve | O quê |
|---|---|
| App web / IA | Campos de **input** (`schema.properties`): `titulo`, `status`, `responsavel`, `modulo`, `tipo`, `branche`, `G`, `U`, `T`, `E`. |
| Watcher (servidor) | Campos **derivados** (`schema.derived`): `GUT`, `prioridade_gute`, `gute_computed_at`. |

Regra de ouro: **input e derivado nunca se misturam na escrita.** A IA/app
nunca calcula nem grava GUT/prioridade — só informa G/U/T/E. O watcher
observa a mudança, recalcula e grava os derivados. Isso garante uma fonte
única de cálculo e evita divergência entre quem edita e o board.

---

## Referências de código

- Schema: `config/schema.json`
- Regra GUT: `config/gute.json`
- Validação + geração de id: `server/validate.js` (`validateTask`, `genId`)
- Cálculo GUT (watcher): `server/gute.js` (`compute`)
- Board (colunas, ordenação): `config/board.json`
