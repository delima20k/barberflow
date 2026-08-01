# Implantação manual

Nada desta etapa deve ser aplicado automaticamente. Mantenha
`ANALYTICS_ENABLED=false` durante backup, dry-run e validação.

## 1. Backup obrigatório

Com o CLI já vinculado ao projeto Supabase do BarberFlow:

```powershell
supabase db dump --linked --schema analytics -f analytics-backup-before-deploy.sql
```

Se o schema ainda não existir, registre essa condição no checklist e faça também
o backup normal do projeto conforme o procedimento operacional do BarberFlow.

## 2. Variáveis do mesmo projeto

Reutilize:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Mantenha:

```env
ANALYTICS_ADMIN_EMAIL=
ANALYTICS_HMAC_SECRET=
ANALYTICS_ALLOWED_ORIGIN=https://barberflow.live
ANALYTICS_ENABLED=false
```

Nunca disponibilize `SUPABASE_SERVICE_ROLE_KEY` ou `ANALYTICS_HMAC_SECRET` no
navegador.

## 3. Revisão e aplicação

Confira primeiro, sem aplicar:

```powershell
supabase db push --linked --dry-run
```

Após aprovação explícita, o comando de aplicação é:

```powershell
supabase db push --linked
```

No Dashboard do mesmo projeto, adicione `analytics` à lista mínima de schemas
expostos pela Data API antes de usar as RPCs. Para Realtime, publique somente
`analytics.analytics_events` e valide a policy de administrador ativo. O
`supabase/config.toml` já registra essa configuração para o ambiente local.

Cadastre o administrador somente depois que o usuário existir no Auth atual:

```sql
insert into analytics.analytics_admins (user_id, active)
select id, true
from auth.users
where lower(email) = lower('<ANALYTICS_ADMIN_EMAIL>')
on conflict (user_id) do update set active = excluded.active;
```

Publique manualmente a função no mesmo projeto apenas após validar os secrets:

```powershell
supabase functions deploy collect-event --no-verify-jwt
```

Não altere `ANALYTICS_ENABLED` para `true` nesta etapa.

## 4. Retenção

`analytics.cleanup_analytics_data()` mantém eventos por 90 dias, sessões por 180
dias e não remove métricas agregadas. Nenhum agendamento automático foi criado.
Uma execução futura exige confirmação e deve usar credencial administrativa.

## 5. Rollback

O procedimento inicial é não destrutivo: desative o coletor, remova a publicação
da Edge Function se necessário e execute [rollback.sql](rollback.sql) no SQL
Editor. Ele revoga acessos, mas preserva todas as tabelas e dados.

Só remova o schema após confirmar o backup e a intenção de apagar os dados. Os
comentários `-- rollback:` de cada migration registram a ordem técnica reversa.
