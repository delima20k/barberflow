# SKILL 10 - CONTRATOS DE BANCO E SNAPSHOT DE SCHEMA

> Leia este arquivo para tarefas de snapshot de schema, contratos de RPC, regressao de banco e CI `db-tests`.

---

## 1. SNAPSHOT DE SCHEMA

- Toda migration que altera schema deve rodar `npm run db:snapshot`.
- Versionar sempre:
  - `db/snapshots/schema-current.sql`;
  - `db/snapshots/schema-current.hash`.
- O snapshot deve ser deterministico: normalizar `pg_dump --schema-only`, remover ruido de ambiente e ordenar objetos por tipo/nome.
- PR com migration deve rodar `npm run db:tests`; drift de schema falha o merge.
- O diff deve ser legivel e agrupado por tipo de objeto, nunca apenas SQL bruto.

---

## 2. CONTRATOS DE RPC

- Toda RPC nova precisa de contrato antes do merge.
- Cada contrato deve ter:
  - documento em `db/contracts/<nome-rpc>.md`;
  - entrada valida e entradas invalidas em `db/contracts/rpc-contracts.json`;
  - snapshot de resposta em `db/contracts/snapshots/<nome-rpc>.json`.
- RPC recriada 2+ vezes ou consumida por `.rpc()` e critica e deve estar coberta.
- Entradas invalidas devem retornar erro tipado, nunca 500 generico.
- Efeitos colaterais esperados devem ser documentados e validados no modo live.

---

## 3. BOOT GUARD

- A aplicacao pode validar schema no boot com `DB_SCHEMA_VALIDATE_ON_BOOT=true`.
- Em desenvolvimento, divergencia gera warning.
- Em producao, `DB_SCHEMA_BLOCK_ON_DRIFT=true` bloqueia o boot quando houver drift.

---

## 4. CI

- O job `db-tests` deve rodar:
  - snapshot diff;
  - cobertura de RPC;
  - testes de contrato;
  - hook de RLS.
- Toda nova RPC em migration alterada no PR deve aparecer em `db/contracts/rpc-contracts.json`.
