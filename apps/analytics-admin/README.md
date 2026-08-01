# Analytics Admin

PWA externa para monitorar a jornada da landing page BarberFlow. O painel
continua em modo DEMO por padrão, com dados simulados e sem conexão externa.

## Executar e validar

Na raiz do repositório:

```powershell
node server.js
npm --prefix apps/analytics-admin test
npm --prefix apps/analytics-admin run check
npm --prefix apps/analytics-admin run build
```

Abra `http://localhost:3000/apps/analytics-admin/` e use
`demo@analytics.local` / `analytics-demo`.

## Supabase compartilhado

O Analytics compartilha o projeto Supabase e o Auth do BarberFlow, mas usa
schema, tabelas, políticas, funções e migrations isoladas em `analytics`.
Nenhuma tabela Analytics é criada diretamente em `public`.

O build do painel reutiliza somente as variáveis públicas:

```text
ANALYTICS_ADMIN_MODE=supabase
ANALYTICS_ADMIN_PRODUCTION_URL=https://analistc.barberflow.live
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
ANALYTICS_COLLECTOR_URL=
```

`SUPABASE_SERVICE_ROLE_KEY` e `ANALYTICS_HMAC_SECRET` pertencem exclusivamente
ao ambiente seguro da Edge Function e nunca podem ir para o navegador.

As sete migrations ficam em `supabase/migrations/` e a função em
`supabase/functions/collect-event/`. Elas não são aplicadas pelo build. Consulte
[ANALYTICS_ADMIN.md](./ANALYTICS_ADMIN.md) antes de qualquer ativação.

## Publicação

Na Vercel, use `apps/analytics-admin` como Root Directory, `npm run build` como
Build Command e `.` como Output Directory. Mantenha
`ANALYTICS_ADMIN_MODE=demo` até que migrations, RLS, allowlist, CORS e rollback
sejam validados manualmente no mesmo projeto Supabase do BarberFlow.
