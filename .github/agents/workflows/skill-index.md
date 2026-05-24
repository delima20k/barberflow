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
| 06 | [`skills/skill-06-p2p-mensagens.md`](skills/skill-06-p2p-mensagens.md) | WebRTC, P2P, criptografia ponta a ponta, MediaP2P | Mensagens, chat, vídeo, mídia P2P |
| 07 | [`skills/skill-07-testes.md`](skills/skill-07-testes.md) | TDD, node:test, fluxo red-green-refactor, cobertura | Testes, TDD, validações, edge cases |
| 08 | [`skills/skill-08-performance.md`](skills/skill-08-performance.md) | Cache, paginação, custo, debounce, Blob URLs, N+1 | Performance, otimização, custo de infra |
| 09 | [`skills/skill-09-refatoracao.md`](skills/skill-09-refatoracao.md) | Escopo, checklist pós-implementação, check final, commit | Refatoração, revisão final, limpeza de código |

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
| Mensagens / chat / WebRTC / P2P / criptografia E2E | `skill-06-p2p-mensagens.md` |
| Testes / TDD / validações / edge cases | `skill-07-testes.md` |
| Performance / cache / custo / paginação / otimização | `skill-08-performance.md` |
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

---

## Atualizacao: contratos de banco

| Tipo de tarefa | Arquivos a ler |
|---|---|
| Snapshot de schema / contrato de RPC / regressao de banco | `skills/skill-10-db-contracts.md`, `skills/skill-05-banco.md`, `skills/skill-07-testes.md` |
