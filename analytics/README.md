# BarberFlow Analytics

O Analytics compartilha o projeto Supabase do BarberFlow, mas utiliza schema,
tabelas, políticas, funções e migrations isoladas no schema PostgreSQL
`analytics`.

O coletor público é a Edge Function `collect-event` do mesmo projeto. Ele começa
desativado (`ANALYTICS_ENABLED=false`), e a landing não consulta tabelas ou RPCs
diretamente.

## Estrutura

- `../supabase/migrations/20260731*_analytics_*.sql`: sete migrations isoladas.
- `../supabase/functions/collect-event/`: Edge Function do projeto BarberFlow.
- `src/`: validação, segurança, repositório e guard reutilizáveis.
- `docs/`: arquitetura, eventos, segurança, implantação e rollback.
- `tests/`: contratos executáveis sem rede ou banco real.

## Variáveis

O módulo reutiliza `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e
`SUPABASE_SERVICE_ROLE_KEY`. Mantém `ANALYTICS_ADMIN_EMAIL`,
`ANALYTICS_HMAC_SECRET`, `ANALYTICS_ALLOWED_ORIGIN` e
`ANALYTICS_ENABLED=false`.

`SUPABASE_SERVICE_ROLE_KEY` e `ANALYTICS_HMAC_SECRET` são exclusivos do
servidor/Edge Function e nunca podem chegar ao navegador.

## Validação

```powershell
node --test analytics/tests/analytics-contract.test.mjs analytics/tests/schema-contract.test.mjs
```

Leia [deployment.md](docs/deployment.md) antes de aplicar qualquer migration.
