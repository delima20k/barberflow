# Processo de Migration

Este projeto usa Supabase/PostgreSQL. Todo deploy com migration deve passar pelo workflow `db-validate` antes de executar `supabase db push`.

## Como criar uma migration

1. Crie o arquivo em `supabase/migrations/` seguindo o timestamp sequencial.
2. Garanta que a migration seja online sempre que possivel: `create index concurrently`, backfill em lotes e constraints validadas em duas fases quando aplicavel.
3. Documente rollback no proprio SQL com comentario `-- rollback:` ou crie `db/rollbacks/<migration>.down.sql`.
4. Atualize `db/snapshots/schema-current.sql` com `npm run db:snapshot`.
5. Rode localmente `npm run test:db` e `npm run db:validate`.

Checklist obrigatorio:

- [ ] Migration tem rollback documentado?
- [ ] Afeta tabela com RLS? Se sim, RLS tests foram atualizados?
- [ ] Afeta RPC existente? Se sim, contract test foi atualizado?
- [ ] Afeta contadores? Se sim, triggers foram validados?
- [ ] Migration rodou em staging sem erro?
- [ ] Migration e reversivel?
- [ ] Estimated downtime: 0 (online) ou X segundos (justificado)?

## Contract test de RPC

RPC critica deve ter:

- Documento em `db/contracts/<rpc>.md`.
- Snapshot em `db/contracts/snapshots/<rpc>.json`.
- Cobertura em `tests/db-contracts.test.js`.

Se o output mudar intencionalmente, atualize o snapshot no mesmo PR e explique a compatibilidade no documento do contrato. Mudanca sem snapshot deve falhar no passo `contract-tests`.

## Rodar localmente antes do PR

Com Docker/Supabase CLI disponiveis:

```bash
npm run test:db
npm run db:validate
supabase start
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_crud_suite.sql
supabase stop --no-backup
```

O workflow completo tambem usa `SUPABASE_STAGING_DB_URL` para schema diff, auditoria de contadores, baseline de performance e integridade dos dados.

## Pipeline db-validate

Ordem obrigatoria:

1. Schema diff: compara staging com `db/snapshots/schema-current.sql` e falha em divergencia nao registrada.
2. Migration dry-run: recria banco local, aplica migrations, exige rollback documentado e executa arquivos `.down.sql` quando existirem.
3. Contract tests: valida contratos de RPC pos-migration.
4. RLS tests: roda report estatico e suite SQL em banco isolado.
5. Counter consistency: warning para drift acima de `COUNTER_DRIFT_THRESHOLD`.
6. Performance baseline: warning para mudanca de plano nas 10 queries de `db/perf/critical-queries.sql`.
7. Data integrity: falha em FK orphans, nulos criticos e enums fora do dominio.

Meta de tempo: menor que 3 minutos; maximo aceitavel 5 minutos. Os passos 5 e 6 sao warning-only e podem ser paralelizados futuramente depois do passo 1.

## Se falhar em producao

1. Pare o deploy antes de `supabase db push` se o `db-validate` falhou.
2. Se a falha ocorreu durante migration ja aplicada, use o rollback documentado do PR e valide em staging antes de repetir em producao.
3. Abra hotfix com snapshot atualizado, teste RLS/contrato correspondente e evidencia do `db-validate`.
4. Para drift de contadores ou plano de performance, ajuste threshold apenas com justificativa e crie tarefa de correcao quando houver risco funcional.

## Debitos conhecidos

- O baseline de performance ainda compara texto de plano como artifact; diff semantico de planos JSON pode reduzir falso positivo.
- Rollback automatizado so executa arquivos `.down.sql`; migrations apenas com comentario `-- rollback:` exigem validacao manual.
- Contract tests atuais sao baseados em snapshots versionados; execucao contra banco real deve evoluir quando houver harness RPC dedicado.
