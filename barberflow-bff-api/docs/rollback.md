# Plano de Rollback — BFF BarberFlow

## 1. Janelas de deploy e observação

| Fase          | Duração | Ação se problema detectado         |
|---------------|---------|------------------------------------|
| Deploy        | 0–2min  | Revert imediato (zero downtime)    |
| Observação    | 2–15min | Monitorar SLOs e error rate        |
| Estabilização | 15–60min| Considerar estável se SLOs OK      |

## 2. Gatilhos de rollback automático

Rollback deve ser iniciado **imediatamente** se qualquer condição abaixo for verdadeira:

- Error rate > 1% por mais de 2 minutos
- Latência p95 > 2× o baseline por 5 minutos
- `/health/ready` retornando 503 por > 1 minuto
- Alertas críticos disparados no Sentry/Prometheus

## 3. Procedimento de rollback (Vercel)

### Rollback via CLI Vercel

```bash
# 1. Listar deployments recentes
vercel ls --limit 10

# 2. Fazer rollback para o deployment anterior estável
vercel rollback [deployment-url]

# 3. Verificar que o rollback foi aplicado
vercel inspect [deployment-url]

# 4. Checar health
curl https://api.barberflow.com/health/live
curl https://api.barberflow.com/health/ready
```

### Rollback via GitHub (reverter commit)

```bash
# 1. Identificar o último commit estável
git log --oneline -10

# 2. Criar commit de revert (NUNCA usar --hard em produção)
git revert HEAD --no-edit

# 3. Push para branch main → aciona CI → deploy automático
git push origin main

# 4. Monitorar CI em GitHub Actions
```

## 4. Rollback de banco de dados (Supabase)

### Princípios:
- Migrações devem ser **reversíveis** — sempre criar `down.sql` junto com `up.sql`
- Nunca fazer `DROP COLUMN` em produção sem período de deprecação
- Usar `ALTER TABLE ... ADD COLUMN` com `DEFAULT` para manter compatibilidade

### Reverter migração específica

```sql
-- Verificar estado atual das migrações
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;

-- Executar script de rollback da migração
-- (arquivo: supabase/migrations/YYYYMMDDHHMMSS_nome_rollback.sql)
```

### Backup antes de qualquer deploy de migração

```bash
# Via Supabase Dashboard → Settings → Database → Backups
# Ou via pg_dump (requer SUPABASE_DB_URL)
pg_dump $SUPABASE_DB_URL > backup_pre_deploy_$(date +%Y%m%d_%H%M%S).sql
```

## 5. Checklist pós-rollback

- [ ] `/health/live` → 200
- [ ] `/health/ready` → 200
- [ ] Error rate < 0.1% (baseline)
- [ ] Latência p95 dentro do SLO
- [ ] Supabase Dashboard sem erros de DB
- [ ] Sentry sem novos alertas críticos
- [ ] Notificar equipe no canal de incidentes

## 6. Registro de incidentes

Após qualquer rollback, registrar em `docs/incidentes/` com:
- Data/hora do incidente
- Causa raiz (se conhecida)
- Tempo de recuperação (MTTR)
- Ações preventivas para evitar reincidência

## 7. Contacts de escalada

| Nível | Responsável    | Canal                  |
|-------|---------------|------------------------|
| L1    | Dev on-call    | Slack #alertas-bff     |
| L2    | Tech Lead      | WhatsApp / Telefone    |
| L3    | CTO            | WhatsApp urgente       |
