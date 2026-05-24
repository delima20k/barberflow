# SKILL INDEX — AGENTE DELIMA

> Índice geral de todos os arquivos de skill.
> Consulte este arquivo para encontrar o arquivo certo antes de qualquer tarefa.
> Última atualização: 17/05/2026

---

## Arquivos de skill disponíveis

| # | Arquivo | Responsabilidade | Quando usar |
|---|---|---|---|
| 01 | [`skills/skill-01-base.md`](skills/skill-01-base.md) | Identidade, objetivos, fluxo de validação, SOLID, Design Patterns, arquitetura, fallback | Qualquer tarefa — ler sempre como base |
| 02 | [`skills/skill-02-frontend.md`](skills/skill-02-frontend.md) | Router, animações, navegação, CSS, cards, componentes UI | Telas, layout, animações, UI, modal, componentes |
| 03 | [`skills/skill-03-backend.md`](skills/skill-03-backend.md) | Services, controllers, repositories, BFF, APIs | Backend, BFF, rotas, controllers, services |
| 04 | [`skills/skill-04-seguranca.md`](skills/skill-04-seguranca.md) | OWASP, JWT, CSP, autenticação, criptografia, validação de entrada | Segurança, auth, tokens, headers, inputs |
| 05 | [`skills/skill-05-banco.md`](skills/skill-05-banco.md) | Supabase, PostgreSQL, RLS, migrations, storage, paginação | Banco, queries, migrations, storage, Supabase |
| 06 | [`skills/skill-06-p2p-mensagens.md`](skills/skill-06-p2p-mensagens.md) | WebRTC, P2P, chat canonico BFF, criptografia ponta a ponta, MediaP2P | Mensagens, chat, vídeo, mídia P2P |
| 07 | [`skills/skill-07-testes.md`](skills/skill-07-testes.md) | TDD, node:test, fluxo red-green-refactor, cobertura | Testes, TDD, validações, edge cases |
| 08 | [`skills/skill-08-performance.md`](skills/skill-08-performance.md) | Cache, paginação, custo, debounce, Blob URLs, N+1 | Performance, otimização, custo de infra |
| 09 | [`skills/skill-09-refatoracao.md`](skills/skill-09-refatoracao.md) | Escopo, checklist pós-implementação, check final, commit | Refatoração, revisão final, limpeza de código |
| 10 | [`barberflow-bff-api/docs/filas.md`](../../barberflow-bff-api/docs/filas.md) | Mensageria BFF: BullMQ, IQueueService, Job VO, JobHandler, RetryPolicy, DeadLetterQueue, InMemoryQueueService, BullMQAdapter, OutboxPattern, WorkerRegistry | Filas, jobs assíncronos, retry, DLQ, outbox, workers, mensageria |

---

## Mapa rápido por tipo de tarefa

| Tipo de tarefa | Arquivos a ler |
|---|---|
| Qualquer tarefa (base obrigatória) | `skill-01-base.md` |
| Nova funcionalidade completa | `skill-01-base.md`, `skill-07-testes.md`, `skill-09-refatoracao.md` |
| Criar ou reutilizar classe | `skill-01-base.md` (§ Fluxo de Validação + CLASS_REGISTRY) |
| Front-end / nova tela / layout / CSS | `skill-02-frontend.md` |
| Animações / navegação / Router | `skill-02-frontend.md` (§ Router, § Animação de telas) |
| Cards / componentes visuais | `skill-02-frontend.md` (§ Cards, § Componentes globais) |
| Backend / BFF / services / controllers / rotas | `skill-03-backend.md` |
| Segurança / OWASP / autenticação / JWT / headers | `skill-04-seguranca.md` |
| Banco / queries / migrations / storage / Supabase | `skill-05-banco.md` |
| RLS policies / cobertura CRUD / report de tabelas sem RLS | `skill-05-banco.md` (§ Cobertura automatizada de RLS), `skill-04-seguranca.md`, `skill-07-testes.md` |
| Upload pre-assinado / pipeline assincrono de midia / variantes | `skill-05-banco.md` (Pipeline assincrono de midia na BFF), `skill-03-backend.md`, `skill-07-testes.md`, `barberflow-bff-api/docs/filas.md` |
| Mensagens / chat / WebRTC / P2P / criptografia E2E | `skill-06-p2p-mensagens.md`, `skill-03-backend.md`, `skill-05-banco.md`, `skill-07-testes.md`, `barberflow-bff-api/docs/filas.md` |
| Quebra incremental do MediaManager / adapters Story e Portfolio / compressao por Strategy | `skill-06-p2p-mensagens.md` (Quebra incremental do MediaManager), `skill-07-testes.md`, `skill-08-performance.md`, `skill-09-refatoracao.md` |
| Chat canonico BFF / realtime privado / outbox / cursor reverso | `skill-06-p2p-mensagens.md` (Chat canonico na BFF), `skill-03-backend.md`, `skill-05-banco.md`, `skill-07-testes.md`, `barberflow-bff-api/docs/filas.md`, `barberflow-bff-api/docs/realtime.md` |
| Testes / TDD / validações / edge cases | `skill-07-testes.md` |
| Performance / cache / custo / paginação / otimização | `skill-08-performance.md` |
| Vite / bundler frontend / chunks / bundle budget / Lighthouse CI | `skill-08-performance.md` (Pipeline Vite / bundler frontend), `skill-02-frontend.md`, `skill-07-testes.md`, `skill-09-refatoracao.md` |
| Feed BFF / fanout hibrido / cursor estavel / cache Redis da timeline | `skill-08-performance.md` (Feed escalavel na BFF), `skill-03-backend.md`, `skill-05-banco.md`, `skill-07-testes.md`, `barberflow-bff-api/docs/filas.md` |
| Refatoração / revisão / check final / commit | `skill-09-refatoracao.md` |
| **Tarefa não encontrada em nenhum arquivo** | Ler `skill.md` + este índice + arquivos relacionados; se a regra não existir, implementar como sênior; documentar a nova boa prática no arquivo correto; atualizar este índice |

---

## Como atualizar este índice

Quando uma nova boa prática for criada:

1. Identifique qual arquivo de skill é o mais adequado para a nova regra.
2. Adicione a regra nesse arquivo com um heading `##` ou `###` claro.
3. Atualize a tabela "Arquivos de skill disponíveis" se o escopo do arquivo mudar.
4. Adicione uma linha no "Mapa rápido" para o novo tipo de tarefa.
5. Se o arquivo ficar muito grande (> 2.000 linhas), avalie separar por subtema e criar um novo arquivo numerado.
6. Atualize também o `skill.md` mestre se a nova regra for global (valem para qualquer tarefa).

---

> **REGRA FINAL:** Sempre perguntar — *"Existe uma forma mais barata, mais inteligente, mais segura e mais escalável de fazer isso?"*
> Se existir: **FAZER MELHOR.**

## Atualizacao DELIMA - Notificacoes Canonicas

| Tipo de tarefa | Arquivos a ler |
|---|---|
| Notificacoes canonicas BFF / canais / provider push / digest | `skill-03-backend.md` (Notificacoes canonicas na BFF), `skill-04-seguranca.md`, `skill-05-banco.md`, `skill-07-testes.md`, `barberflow-bff-api/docs/filas.md`, `barberflow-bff-api/docs/realtime.md` |

## Atualizacao DELIMA - Scheduler Canonico

| Tipo de tarefa | Arquivos a ler |
|---|---|
| Scheduler canonico BFF / cron / lock distribuido / tarefas recorrentes | `skill-03-backend.md` (Scheduler canonico na BFF), `skill-05-banco.md`, `skill-07-testes.md`, `skill-08-performance.md`, `barberflow-bff-api/docs/filas.md` |

## Atualizacao DELIMA - Page Sections

| Tipo de tarefa | Arquivos a ler |
|---|---|
| Extracao incremental de god file de pagina / PageSection / EventBus de secao | `skill-02-frontend.md` (Sections em god files de pagina), `skill-07-testes.md`, `skill-09-refatoracao.md` |

## Atualizacao DELIMA - Schema Snapshot e Contratos de RPC

| Tipo de tarefa | Arquivos a ler |
|---|---|
| Schema snapshot / diff de migrations / contrato de RPC / regressão de banco | `skill-05-banco.md`, `skill-07-testes.md` + regras abaixo |
| Pipeline db-validate / deploy com migration / rollback / auditoria staging | `skill-05-banco.md` (Pipeline db-validate antes de deploy), `skill-07-testes.md`, `skill-09-refatoracao.md` |

### Regras obrigatórias — Schema Snapshot e Contratos

**Ao criar uma nova RPC:**
1. Criar arquivo `db/contracts/snapshots/<nome>.json` com assinatura canônica
2. Criar arquivo `db/contracts/<nome>.md` com documentação do contrato
3. Executar `node scripts/db-snapshot.js` para regenerar `db/snapshots/`
4. Commitar: migration + snapshots + contratos no mesmo commit
5. Testes de cobertura em `tests/db-contracts.test.js` validam automaticamente no CI

**Ao modificar uma RPC existente:**
1. Atualizar `db/contracts/snapshots/<nome>.json` com a nova assinatura
2. Atualizar `db/contracts/<nome>.md`
3. Executar `node scripts/db-snapshot.js` para regenerar o snapshot
4. Se quebrar contrato → CI falha em `db-tests.yml` → merge bloqueado

**Scripts disponíveis:**
- `npm run db:snapshot` — regenera snapshot (obrigatório após nova migration)
- `npm run db:check`    — valida conformidade (usado no CI)
- `npm run db:diff`     — diff legível do schema
- `npm run db:coverage` — cobertura de contratos de RPCs
- `npm run test:db`     — roda todos os testes de banco

**Arquivos do sistema:**
- `scripts/db-rpc-parser.js`  — RpcSignatureParser + SchemaSnapshotGenerator + SchemaDiffer
- `scripts/db-snapshot.js`    — CLI de geração de snapshot
- `scripts/db-diff.js`        — CLI de diff e cobertura
- `db/snapshots/schema-current.sql` — snapshot versionado (commitar sempre)
- `db/snapshots/schema.hash`       — hash do snapshot (usado no boot)
- `db/contracts/snapshots/*.json`  — assinaturas canônicas das RPCs
- `db/contracts/*.md`              — documentação humana dos contratos
- `shared/js/SchemaValidator.js`   — validação de hash no boot da app
- `.github/workflows/db-tests.yml` — job CI que bloqueia merge se contrato violado
