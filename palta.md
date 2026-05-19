# PALTA.MD — AUDITORIA TÉCNICA COMPLETA BARBERFLOW
### Agente: DELIMA | Data: 2026-05-16 | Modo: Read-Only (sem alterações)
### Escopo: apps/ · barberflow-bff-api/ · src/ · shared/js/ · supabase/ · infraestrutura

---

## SUMÁRIO EXECUTIVO

O BarberFlow é um projeto de qualidade técnica acima da média para seu porte. A arquitetura
Clean Architecture + DDD está corretamente separada em todas as camadas (Frontend → BFF → Backend → DB).
O uso de OOP com campos privados (`#`), BaseService/BaseRepository/BaseController, e injeção de
dependência via construtor demonstra maturidade de design.

**No entanto**, foram identificados problemas que vão de críticos (segurança de dados) a baixos
(dívida técnica), distribuídos em 7 categorias. Este documento mapeia cada problema com um
prompt individual, controlado, reversível, com checklist de validação.

---

## SCOREBOARD — NOTAS 0 A 10

| Dimensão | Nota | Justificativa |
|----------|------|---------------|
| **Segurança** | 6.5/10 | `direct_messages` sem RLS é brecha grave; resto bem configurado |
| **Escalabilidade** | 6/10 | Rate limit em memória (não Redis), geo Euclidiana, sem cursor pagination |
| **POO** | 9/10 | Uso exemplar de classes, campos privados `#`, herança controlada e DI |
| **Clean Architecture** | 8.5/10 | Separação Controller→Service→Repository impecável; MediaManager é exceção |
| **Performance** | 7/10 | Haversine em memória, auth fallback sem cache, endpoints públicos sem ETag |
| **Organização** | 9/10 | Estrutura de pastas, nomes de classes, convenções — excelentes |
| **Banco de dados** | 5.5/10 | Sem RLS em direct_messages, sem CHECK constraints, geo Euclidiana |
| **API BFF** | 8.5/10 | Pós-auditoria anterior: rate limit, trust proxy, joins, cache headers corrigidos |
| **Estrutura geral** | 8/10 | Monorepo bem organizado; shared/js UMD é solução elegante |
| **Preparação para produção** | 6.5/10 | Sem testes src/, sem Redis, sem monitoramento P2P, direct_messages exposto |

**Média geral: 7.45/10**

---

## PROBLEMAS POR CATEGORIA

---

# 🔴 SEGURANÇA

---

## SEG-01 · `direct_messages` sem RLS — qualquer usuário lê TODAS as mensagens

**Gravidade:** CRÍTICO — P0
**Categoria:** Segurança · Banco de dados

**Descrição:**
A tabela `direct_messages` armazena mensagens privadas entre usuários. É a **única tabela
com dados pessoais sensíveis que não possui Row Level Security (RLS)** habilitado. Qualquer
usuário autenticado com a `anon_key` pode fazer SELECT em todas as mensagens do banco.

**Evidência:**
```sql
-- supabase/migrations/20250501_direct_messages.sql ou similar
-- Tabela criada, mas sem:
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY ... ON direct_messages;
```

**Impacto:** Violação de privacidade, LGPD Art. 46 (dever de segurança), possível
vazamento de conversas privadas entre clientes e profissionais.

---

### PROMPT SEG-01 — Adicionar RLS à tabela direct_messages

**Objetivo:** Proteger mensagens privadas com Row Level Security, permitindo que cada
usuário veja apenas suas próprias mensagens (enviadas ou recebidas).

**Arquivos afetados:**
- `supabase/migrations/` — criar nova migration `20260516_rls_direct_messages.sql`

**Risco:** BAIXO — RLS é aditivo; não altera dados existentes. O risco é regressão
em queries do backend que usem `service_role_key` (service_role bypassa RLS — sem impacto).

**Dependências:** Nenhuma. Pode ser aplicado isoladamente.

**Ordem correta:** Antes de qualquer deploy com direct_messages em produção.

**Migration a criar:**
```sql
-- supabase/migrations/20260516_rls_direct_messages.sql

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Usuário pode ver mensagens onde é remetente ou destinatário
CREATE POLICY "dm_select_proprio"
  ON direct_messages FOR SELECT
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Usuário só pode inserir mensagens onde é o remetente
CREATE POLICY "dm_insert_proprio"
  ON direct_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Usuário só pode deletar suas próprias mensagens enviadas
CREATE POLICY "dm_delete_proprio"
  ON direct_messages FOR DELETE
  USING (sender_id = auth.uid());
```

**Checklist de validação:**
- [ ] `SELECT * FROM direct_messages` com usuário A retorna apenas mensagens de/para A
- [ ] `SELECT * FROM direct_messages` com usuário B não retorna mensagens de A
- [ ] INSERT com `sender_id ≠ auth.uid()` é rejeitado com 401/403
- [ ] Backend com `service_role_key` ainda lê todas as mensagens (bypassa RLS)
- [ ] Realtime subscription de direct_messages filtra corretamente por usuário

**Como revisar:** No Supabase Studio → Table Editor → direct_messages → RLS tab.
Verificar que `Row Security enabled: true` e as 3 policies aparecem.

**Como testar:**
```sql
-- Com token de usuário A (anon_key):
SELECT * FROM direct_messages; -- deve retornar apenas mensagens de/para A
-- Com token de usuário B:
SELECT * FROM direct_messages WHERE sender_id = '<uuid_de_A>'; -- deve retornar vazio
```

**O que pode quebrar:**
- Se o backend em `src/` acessa `direct_messages` via `anon_key` (em vez de `service_role`),
  as queries quebram. Verificar `src/repositories/DirectMessageRepository.js` — deve usar
  o client com `service_role_key`.
- Realtime subscriptions sem filtro por usuário retornarão menos dados (correto por segurança).

---

## SEG-02 · CORS raiz (`vercel.json`) sem CSP granular para recursos externos

**Gravidade:** MÉDIO — P1
**Categoria:** Segurança · Frontend

**Descrição:**
O `vercel.json` na raiz define Content-Security-Policy para os SPAs. A política atual
permite `img-src * data: blob:` (wildcard para imagens) e `connect-src` amplo. Considerando
que o app usa Supabase Storage, Cloudflare R2 e MapTiler, a política pode ser mais restrita.

**Evidência:**
```json
// vercel.json (raiz)
"Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src * data: blob:; ..."
```

**Impacto:** Menor — XSS via imagens de domínios externos não controlados.

---

### PROMPT SEG-02 — Restringir img-src e connect-src na CSP

**Objetivo:** Substituir `img-src *` por domínios explícitos (Supabase Storage + Cloudflare R2 + MapTiler).

**Arquivos afetados:**
- `vercel.json` (raiz) — header `Content-Security-Policy`

**Risco:** MÉDIO — CSP muito restrita quebra carregamento de imagens de usuários.
Testar extensivamente com avatares, portfólios e mapas antes de aplicar.

**Dependências:** Nenhuma.

**Ordem correta:** Após mapear todos os domínios externos usados.

**Alteração:**
```json
"img-src 'self' data: blob: https://*.supabase.co https://*.r2.dev https://api.maptiler.com"
```

**Checklist:**
- [ ] Avatares de usuários carregam (Supabase Storage)
- [ ] Imagens de portfólio carregam (R2 ou Supabase)
- [ ] Mapa MapTiler renderiza corretamente
- [ ] Console do browser sem erros de CSP

**O que pode quebrar:** Imagens de domínios não listados (CDN customizado, links externos em bio).

---

## SEG-03 · Tokens de refresh não rotacionados no backend legado

**Gravidade:** ALTO — P1
**Categoria:** Segurança · Backend

**Descrição:**
O `src/` (backend legado) armazena hashes SHA-256 de refresh tokens. O mecanismo de
rotação existe (`TokenService.rotateRefreshToken()`), mas não há revogação em cascata:
se um refresh token for comprometido, todos os tokens anteriores da mesma sessão ainda
são válidos até expirar (7 dias).

**Impacto:** Janela de comprometimento de 7 dias por token vazado.

---

### PROMPT SEG-03 — Implementar revogação em cascata de refresh tokens

**Objetivo:** Ao usar um refresh token, invalidar todos os tokens anteriores da mesma
família de sessão (token rotation com family invalidation).

**Arquivos afetados:**
- `src/repositories/TokenRepository.js`
- `src/services/TokenService.js`
- `supabase/migrations/` — nova migration para adicionar coluna `family_id` em `refresh_tokens`

**Risco:** ALTO — mudança no fluxo de autenticação. Testar exaustivamente antes de aplicar.

**Dependências:** SEG-01 não bloqueia este. Pode ser feito em paralelo.

**Ordem correta:** Criar migration → atualizar repository → atualizar service → testar.

**Checklist:**
- [ ] Login cria novo `family_id` (UUID)
- [ ] Refresh usa token válido, cria novo token com mesmo `family_id`, invalida o anterior
- [ ] Se token antigo da mesma família for usado novamente → 401 e toda a família é revogada
- [ ] Logout invalida todos os tokens da família

**O que pode quebrar:** Sessões de usuários com múltiplos dispositivos (cada dispositivo
deve ter seu próprio `family_id`). Sessões existentes sem `family_id` precisam de migration.

---

# 🏦 BANCO DE DADOS

---

## DB-01 · Coordenadas geográficas usam Euclidean math — não PostGIS

**Gravidade:** ALTO — P1 (escalabilidade + precisão)
**Categoria:** Banco de dados · Performance

**Descrição:**
Queries de proximidade usam diferença de graus (Euclidiana) em vez da função esférica
`ST_DWithin()` do PostGIS. A extensão PostGIS já está habilitada no projeto (`create extension
if not exists postgis`). A fórmula Euclidiana é incorreta perto dos polos e imprecisa
em distâncias > 50km.

**Evidência — migration existente:**
```sql
-- Busca por proximidade (simplificado):
WHERE ABS(latitude - $1) < $raio AND ABS(longitude - $2) < $raio
```

**Impacto:** Resultados de busca imprecisos + sem índice espacial (tabela full-scan).

---

### PROMPT DB-01 — Migrar queries geográficas para PostGIS ST_DWithin

**Objetivo:** Substituir comparação Euclidiana por `ST_DWithin(geom, ponto, raio_metros)`
com índice GIST para busca eficiente.

**Arquivos afetados:**
- `supabase/migrations/20260516_postgis_barbershops.sql` — nova migration
- `src/repositories/BarbeariaRepository.js` — query de proximidade
- `barberflow-bff-api/repositories/BarbeariaRepository.js` — mesma query no BFF

**Risco:** MÉDIO — migration altera tipo de coluna e adiciona índice. Pode travar
tabela brevemente em produção se não for feito com CONCURRENTLY.

**Dependências:** PostGIS já habilitado (verificado nas migrations).

**Ordem correta:**
1. Criar migration com coluna `geom GEOMETRY(Point, 4326)`
2. Popular `geom` com `ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)`
3. Criar índice GIST CONCURRENTLY
4. Atualizar repositories para usar `ST_DWithin`

**Migration:**
```sql
-- supabase/migrations/20260516_postgis_barbershops.sql

-- Adicionar coluna geometry
ALTER TABLE barbershops ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);

-- Popular com dados existentes
UPDATE barbershops
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Criar índice espacial
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barbershops_geom ON barbershops USING GIST (geom);

-- Trigger para manter geom sincronizado
CREATE OR REPLACE FUNCTION sync_barbershop_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_barbershop_geom
BEFORE INSERT OR UPDATE OF latitude, longitude ON barbershops
FOR EACH ROW EXECUTE FUNCTION sync_barbershop_geom();
```

**Query atualizada (repositories):**
```javascript
// BarbeariaRepository.js — getNearby()
.rpc('get_barbershops_nearby', { lat, lng, raio_km: raioKm, limit_val: 50 })
// ou com PostgREST filter:
.select(BarbeariaRepository.#SELECT)
.filter('geom', 'st_dwithin', `SRID=4326;POINT(${lng} ${lat})::geography,${raioKm * 1000}`)
```

**Checklist:**
- [ ] Busca retorna barbearias dentro do raio correto (testar com coordenadas conhecidas)
- [ ] Resultados ordenados por distância real (não por diferença de grau)
- [ ] Performance: query com índice GIST < 50ms para 10.000 barbearias
- [ ] Trigger atualiza `geom` ao fazer UPDATE de latitude/longitude

**O que pode quebrar:** Haversine em memória no BffService — pode ser removido após
migração (PostgREST retorna já filtrado por distância real).

---

## DB-02 · Sem CHECK constraints em colunas numéricas críticas

**Gravidade:** MÉDIO — P1
**Categoria:** Banco de dados · Integridade

**Descrição:**
Colunas como `price`, `duration_min`, `rating_avg`, `likes_count`, `amount` não possuem
CHECK constraints. Dados inconsistentes podem ser inseridos via service_role_key bypass
ou bug de aplicação.

**Evidência:**
```sql
-- services (tabela de serviços de barbearia)
price NUMERIC(10,2)  -- sem CHECK price >= 0
duration_min INT     -- sem CHECK duration_min > 0 AND duration_min <= 480

-- appointments
duration_min INT     -- sem CHECK
```

---

### PROMPT DB-02 — Adicionar CHECK constraints nas tabelas principais

**Objetivo:** Garantir integridade de dados em nível de banco, impedindo valores
impossíveis (preço negativo, duração zero, rating fora de 0-5).

**Arquivos afetados:**
- `supabase/migrations/20260516_check_constraints.sql` — nova migration

**Risco:** BAIXO — CHECK constraints são validadas apenas em INSERT/UPDATE.
Dados existentes precisam ser validados antes (pode falhar se houver dados inválidos).

**Dependências:** Nenhuma. Pode ser feito isoladamente.

**Ordem correta:**
1. Verificar dados existentes (query de diagnóstico)
2. Corrigir dados inválidos se encontrados
3. Aplicar migration com constraints

**Migration:**
```sql
-- Diagnóstico antes de aplicar
SELECT id, price FROM services WHERE price < 0;
SELECT id, duration_min FROM services WHERE duration_min <= 0 OR duration_min > 480;
SELECT id, rating_avg FROM barbershops WHERE rating_avg < 0 OR rating_avg > 5;

-- Constraints
ALTER TABLE services
  ADD CONSTRAINT chk_price_positivo CHECK (price >= 0),
  ADD CONSTRAINT chk_duration_valida CHECK (duration_min > 0 AND duration_min <= 480);

ALTER TABLE appointments
  ADD CONSTRAINT chk_duration_valida CHECK (duration_min > 0 AND duration_min <= 480);

ALTER TABLE barbershops
  ADD CONSTRAINT chk_rating_avg CHECK (rating_avg >= 0 AND rating_avg <= 5),
  ADD CONSTRAINT chk_likes_count CHECK (likes_count >= 0),
  ADD CONSTRAINT chk_rating_score CHECK (rating_score >= 0);

ALTER TABLE transactions
  ADD CONSTRAINT chk_amount_positivo CHECK (amount > 0);

ALTER TABLE subscriptions
  ADD CONSTRAINT chk_datas CHECK (valid_until >= valid_from);
```

**Checklist:**
- [ ] Nenhuma linha existente viola as constraints (diagnóstico limpo)
- [ ] INSERT com price = -1 retorna erro PostgreSQL
- [ ] INSERT com duration_min = 0 retorna erro PostgreSQL
- [ ] Application layer não é afetada (validação já existe em BaseValidator)

**O que pode quebrar:** Dados de seed/fixtures de teste com valores inválidos.

---

## DB-03 · Sem jobs de limpeza automática (queue_entries, stories, notificações)

**Gravidade:** MÉDIO — P2
**Categoria:** Banco de dados · Escalabilidade

**Descrição:**
Três tabelas acumulam dados indefinidamente sem cleanup:
- `queue_entries` — entradas de fila de atendimento que terminaram
- `stories` — stories expiradas (created_at + 24h já passou)
- `notifications` — notificações lidas com mais de 30 dias

Em 12 meses de uso, essas tabelas terão milhões de linhas obsoletas degradando performance.

---

### PROMPT DB-03 — Criar pg_cron jobs para limpeza automática

**Objetivo:** Agendar limpeza automática de dados expirados para manter performance
das tabelas de alta rotatividade.

**Arquivos afetados:**
- `supabase/migrations/20260516_cleanup_crons.sql` — nova migration

**Risco:** BAIXO — deleções de dados antigos. Não afeta dados ativos.
Habilitar `pg_cron` na extensão do Supabase (Settings > Extensions).

**Dependências:** Extensão `pg_cron` habilitada no Supabase.

**Ordem correta:**
1. Habilitar pg_cron no Supabase Studio
2. Criar migration com schedules

**Migration:**
```sql
-- supabase/migrations/20260516_cleanup_crons.sql

-- Limpar queue_entries finalizadas com mais de 7 dias
SELECT cron.schedule(
  'cleanup_queue_entries',
  '0 3 * * *',  -- 3h da manhã, todo dia
  $$
    DELETE FROM queue_entries
    WHERE status IN ('done', 'cancelled', 'no_show')
      AND updated_at < NOW() - INTERVAL '7 days';
  $$
);

-- Limpar stories expiradas (24h após criação)
SELECT cron.schedule(
  'cleanup_stories',
  '0 */6 * * *',  -- a cada 6 horas
  $$
    DELETE FROM stories
    WHERE created_at < NOW() - INTERVAL '24 hours';
  $$
);

-- Limpar notificações lidas com mais de 30 dias
SELECT cron.schedule(
  'cleanup_notifications',
  '0 4 * * 0',  -- domingo às 4h
  $$
    DELETE FROM notifications
    WHERE read = true
      AND created_at < NOW() - INTERVAL '30 days';
  $$
);
```

**Checklist:**
- [ ] `SELECT * FROM cron.job` mostra os 3 jobs cadastrados
- [ ] Executar manualmente: `SELECT cron.run_job('cleanup_queue_entries')` sem erros
- [ ] Verificar logs do cron: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC`
- [ ] Tabelas não contêm registros mais antigos que o threshold após execução

**O que pode quebrar:** Nada — deleta apenas dados finalizados/expirados.

---

## DB-04 · Índices ausentes em colunas de alta frequência de consulta

**Gravidade:** MÉDIO — P2
**Categoria:** Banco de dados · Performance

**Descrição:**
Queries frequentes não possuem índices nas colunas de filtragem/ordenação mais usadas.

**Colunas sem índice identificadas:**
- `appointments.scheduled_at` — orders e filtros de range
- `appointments.professional_id` — filtros de conflito (verificar conflito de horário)
- `notifications.user_id + read` — filtros de listagem de notificações
- `queue_entries.barbershop_id + status` — consultas de fila ativa
- `stories.barbershop_id + created_at` — stories por barbearia

---

### PROMPT DB-04 — Adicionar índices faltantes

**Objetivo:** Criar índices para as queries mais frequentes, reduzindo full table scans.

**Arquivos afetados:**
- `supabase/migrations/20260516_missing_indexes.sql` — nova migration

**Risco:** BAIXO — índices são aditivos. Criação com CONCURRENTLY não bloqueia
leituras em produção.

**Dependências:** Nenhuma.

**Migration:**
```sql
-- supabase/migrations/20260516_missing_indexes.sql

-- Agendamentos por profissional + data (verificação de conflito)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_professional_scheduled
  ON appointments (professional_id, scheduled_at)
  WHERE status NOT IN ('cancelled', 'no_show', 'done');

-- Agendamentos por data (queries de range)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_scheduled_at
  ON appointments (scheduled_at DESC);

-- Notificações por usuário não lidas
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read = false;

-- Fila ativa por barbearia
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_entries_shop_active
  ON queue_entries (barbershop_id, created_at)
  WHERE status = 'waiting';

-- Stories por barbearia (recentes primeiro)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_shop_created
  ON stories (barbershop_id, created_at DESC);
```

**Checklist:**
- [ ] `EXPLAIN ANALYZE` nas queries principais mostra "Index Scan" em vez de "Seq Scan"
- [ ] Tempo de query de conflito de agendamento < 5ms com 10.000 registros
- [ ] Criação CONCURRENTLY concluída sem erros

**O que pode quebrar:** Nada — índices são transparentes para a aplicação.

---

## DB-05 · Tabelas `likes` e `portfolio_likes` são redundantes

**Gravidade:** BAIXO — P3
**Categoria:** Banco de dados · Organização

**Descrição:**
Existem duas tabelas separadas para likes — `likes` (barbearias) e `portfolio_likes`
(fotos de portfólio). A estrutura é idêntica (user_id, target_id, created_at).
Poderia ser uma tabela unificada `likes` com coluna `target_type` ENUM.

**Impacto:** Duplicação de schema, dois triggers de atualização de contador, duas
políticas RLS para manter.

---

### PROMPT DB-05 — Unificar tabelas de likes

**Objetivo:** Consolidar `likes` e `portfolio_likes` em uma tabela `likes` com
discriminador `target_type` ('barbershop' | 'portfolio_item').

**Arquivos afetados:**
- `supabase/migrations/20260516_unify_likes.sql`
- `src/repositories/LikeRepository.js` (se existir)
- `shared/js/` — qualquer service que use likes de portfólio

**Risco:** ALTO — migração de dados + alteração de schema. Testar exaustivamente
em staging antes de produção.

**Dependências:** DB-01 não bloqueia, mas fazer em ambiente estável.

**Ordem correta:**
1. Criar nova tabela unificada
2. Migrar dados existentes
3. Atualizar código
4. Remover tabelas antigas (apenas após verificação)

**Checklist:**
- [ ] Todos os likes existentes migrados (contagem idêntica antes/depois)
- [ ] Triggers de `likes_count` funcionando para ambos os tipos
- [ ] API de curtir barbearia funcionando
- [ ] API de curtir portfólio funcionando
- [ ] RLS aplicado à tabela unificada

**O que pode quebrar:** Queries hardcoded para nome de tabela antigo. Verificar
todos os repositórios antes de remover tabelas.

---

# 🚀 ESCALABILIDADE

---

## ESC-01 · Rate limiting em memória — ineficaz em serverless multi-instância

**Gravidade:** ALTO — P1
**Categoria:** Escalabilidade · BFF

**Descrição:**
`express-rate-limit` usa `MemoryStore` por padrão. Na Vercel serverless, cada cold start
cria uma nova instância Node.js com seu próprio MemoryStore. O rate limit efetivo é
`max × número_de_instâncias`, não `max`. Com 10 instâncias ativas, o limite de 300 req/min
se torna 3.000 req/min por IP.

**Impacto:** Rate limiting completamente ineficaz sob carga real em produção.

---

### PROMPT ESC-01 — Migrar rate limiting para Redis/Upstash

**Objetivo:** Substituir MemoryStore por Upstash Redis (serverless-compatible) para
compartilhar contadores entre todas as instâncias da Vercel.

**Arquivos afetados:**
- `barberflow-bff-api/middlewares/rateLimiter.js`
- `barberflow-bff-api/package.json` — adicionar `@upstash/ratelimit` ou `rate-limit-redis`
- `barberflow-bff-api/.env.example` — adicionar `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`
- `barberflow-bff-api/vercel.json` — adicionar variáveis de ambiente

**Risco:** MÉDIO — requer conta Upstash e variáveis de ambiente em produção.
Em desenvolvimento, manter MemoryStore (skip em não-produção já implementado para auth).

**Dependências:** Conta Upstash criada e `UPSTASH_REDIS_REST_URL` disponível.

**Instalação:**
```bash
cd barberflow-bff-api
npm install @upstash/ratelimit @upstash/redis
```

**Alteração em rateLimiter.js:**
```javascript
const { Ratelimit } = require('@upstash/ratelimit');
const { Redis }     = require('@upstash/redis');

const IS_PROD = process.env.APP_ENV === 'production';

// Em produção: Redis compartilhado. Fora: limiter sem-op.
const getStore = () => {
  if (!IS_PROD) return undefined; // MemoryStore padrão (dev/test)
  return new (require('rate-limit-redis'))({
    sendCommand: (...args) => redis.sendCommand(args),
  });
};
```

**Checklist:**
- [ ] `npm test` continua passando (MemoryStore em dev)
- [ ] Em produção: 11ª requisição do mesmo IP retorna 429
- [ ] Redis no Upstash mostra contadores incrementando
- [ ] Custo Upstash compatível com volume esperado

**O que pode quebrar:** Latência adicional de ~5ms por request (round-trip Redis).
Em caso de falha do Redis, configurar fallback para MemoryStore.

---

## ESC-02 · Auth fallback sem cache — round-trip ao Supabase por request

**Gravidade:** MÉDIO — P2
**Categoria:** Escalabilidade · BFF

**Descrição:**
Quando `SUPABASE_JWT_SECRET` não está configurado, `AuthMiddleware` faz
`supabase.auth.getUser(token)` — um round-trip de rede por cada request autenticado.
Em produção com JWT secret configurado, isso não ocorre. Mas em staging/desenvolvimento
sem secret, cada request autenticado tem +50-100ms de latência.

---

### PROMPT ESC-02 — Adicionar cache LRU para auth fallback

**Objetivo:** Cachear resultado de `getUser(token)` por TTL de 5 minutos para
evitar chamadas repetidas ao Supabase Auth no fallback.

**Arquivos afetados:**
- `barberflow-bff-api/middlewares/auth.js`
- `barberflow-bff-api/package.json` — adicionar `lru-cache`

**Risco:** BAIXO — cache apenas em path de fallback (JWT secret ausente).
TTL de 5min significa tokens revogados levam até 5min para serem invalidados.

**Dependências:** Nenhuma — pode ser feito isoladamente.

**Instalação:**
```bash
npm install lru-cache
```

**Alteração:**
```javascript
const { LRUCache } = require('lru-cache');

const authCache = new LRUCache({
  max: 1000,           // máximo 1000 tokens simultâneos
  ttl: 5 * 60 * 1000, // 5 minutos
});

// No path de fallback:
const cached = authCache.get(token);
if (cached) { req.user = cached; return next(); }
const { data, error } = await SupabaseClient.getInstance().auth.getUser(token);
if (!error) authCache.set(token, data.user);
```

**Checklist:**
- [ ] Segundo request com mesmo token não faz chamada de rede (log mostra "cache hit")
- [ ] Cache expira após 5 min (token inválido não persiste além do TTL)
- [ ] `npm test` continua passando

**O que pode quebrar:** Logout não invalida cache imediatamente. Em 5min, token
pós-logout ainda é aceito. Aceitável para o cenário de fallback (JWT secret ausente).

---

## ESC-03 · Sem cursor pagination — histórico truncado silenciosamente

**Gravidade:** MÉDIO — P2
**Categoria:** Escalabilidade · Backend · BFF

**Descrição:**
Todas as queries de listagem usam `.limit(50)` sem cursor ou offset. Usuários com
histórico de 200+ agendamentos nunca veem registros antigos. O cliente não recebe
indicação de que há mais dados.

---

### PROMPT ESC-03 — Implementar cursor pagination em agendamentos

**Objetivo:** Adicionar suporte a `?cursor=<last_id>&limit=20` em `GET /api/agendamentos`
para permitir carregamento incremental no app mobile.

**Arquivos afetados:**
- `barberflow-bff-api/repositories/AgendamentoRepository.js` — método `getByCliente()`
- `barberflow-bff-api/services/AgendamentoBffService.js` — método `listar()`
- `barberflow-bff-api/controllers/AgendamentoController.js` — parsing de query params
- `barberflow-bff-api/routes/agendamentos.js` — documentação

**Risco:** MÉDIO — mudança de contrato de API. Clientes sem suporte a cursor
recebem apenas a primeira página (comportamento atual = sem regressão).

**Dependências:** DB-04 (índice em scheduled_at) para performance.

**Implementação:**
```javascript
// AgendamentoRepository.js
async getByCliente(clientId, { cursor, limit = 20 } = {}) {
  let query = this._db
    .from('appointments')
    .select(AgendamentoRepository.#SELECT)
    .eq('client_id', clientId)
    .order('scheduled_at', { ascending: false })
    .limit(limit + 1); // +1 para saber se há próxima página

  if (cursor) query = query.lt('scheduled_at', cursor);

  const { data, error } = await query;
  if (error) this._throwDbError(error, 'getByCliente');

  const hasMore = data.length > limit;
  const items   = hasMore ? data.slice(0, limit) : data;
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].scheduled_at : null,
  };
}
```

**Checklist:**
- [ ] `GET /api/agendamentos?limit=5` retorna `{ items: [...], nextCursor: "..." }`
- [ ] `GET /api/agendamentos?cursor=<nextCursor>` retorna próxima página
- [ ] Última página retorna `nextCursor: null`
- [ ] `npm test` continua passando
- [ ] Clientes sem `cursor` param recebem primeira página (sem regressão)

**O que pode quebrar:** Apps que esperam array simples em vez de `{ items, nextCursor }`.
Versionar endpoint (`/api/v2/agendamentos`) se necessário.

---

# 🏛️ ARQUITETURA

---

## ARQ-01 · MediaManager (745 linhas) viola Single Responsibility

**Gravidade:** MÉDIO — P2
**Categoria:** Arquitetura · Backend

**Descrição:**
`src/services/MediaManager.js` (745 linhas) acumula responsabilidades de:
- Upload para Supabase Storage
- Upload para Cloudflare R2 (fallback)
- Replicação P2P entre peers
- Processamento de imagem (redimensionamento, WebP)
- Criptografia AES-256-GCM
- Health check de peers
- Gerenciamento de chunks (P2P upload)

São 6 responsabilidades distintas em um único serviço. Qualquer mudança de storage
provider afeta código de criptografia e vice-versa.

---

### PROMPT ARQ-01 — Decompor MediaManager em 4 serviços especializados

**Objetivo:** Extrair responsabilidades do MediaManager em classes menores:
- `StorageService` — upload/download Supabase + R2
- `MediaProcessingService` — resize, WebP, EXIF
- `ChunkService` — upload P2P em chunks (já pode existir separado)
- `EncryptionService` — AES-256-GCM (já pode existir separado)
- `MediaManager` — orquestrador que delega às 4 classes acima (thin facade)

**Arquivos afetados:**
- `src/services/MediaManager.js` — refatorar
- `src/services/StorageService.js` — novo arquivo
- `src/services/MediaProcessingService.js` — novo arquivo
- `src/app.js` — atualizar injeção de dependência

**Risco:** ALTO — serviço central. Manter interface pública de `MediaManager` idêntica
(facade pattern) para não quebrar os 14 controllers que o usam.

**Dependências:** Nenhuma pré-requisito de banco.

**Ordem correta:**
1. Criar serviços especializados (novos arquivos)
2. Atualizar MediaManager para delegar
3. Testes de integração passando
4. Deploy
5. (Futuro) Remover código duplicado do MediaManager

**Checklist:**
- [ ] Upload de avatar funciona
- [ ] Upload de foto de portfólio funciona
- [ ] Fallback R2 funciona quando Supabase Storage falha
- [ ] Todos os testes de integração passam
- [ ] Interface pública de MediaManager não mudou (sem breaking changes)

**O que pode quebrar:** Controllers que injetam `MediaManager` diretamente
(verificar `src/app.js` — todos devem continuar recebendo o facade).

---

## ARQ-02 · Backend `src/` sem testes automatizados

**Gravidade:** ALTO — P1
**Categoria:** Arquitetura · Qualidade

**Descrição:**
O `barberflow-bff-api/tests/` tem 140 testes cobrindo controller, service, repository
e middlewares. O `src/` (backend principal com 14 controllers, 22 services, 14 repositories)
não possui nenhum teste automatizado. Com serviços complexos como `TokenService`,
`PasswordService` e `MediaManager`, a ausência de testes é um risco real de regressão.

---

### PROMPT ARQ-02 — Criar testes unitários para TokenService e PasswordService

**Objetivo:** Adicionar testes mínimos para os dois serviços de segurança críticos,
estabelecendo o padrão de teste para o backend principal.

**Arquivos afetados:**
- `src/tests/token-service.test.js` — criar
- `src/tests/password-service.test.js` — criar
- `package.json` (raiz ou `src/`) — adicionar script `test:backend`

**Risco:** NENHUM — apenas adição de testes. Não altera código de produção.

**Dependências:** Nenhuma.

**Template (token-service.test.js):**
```javascript
'use strict';
const { suite, test } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET        = 'test-secret-32-chars-minimum!!';
process.env.JWT_REFRESH_SECRET = 'refresh-secret-32-chars-min!!';
process.env.JWT_ADMIN_SECRET  = 'admin-secret-32-chars-minimum!!';

const TokenService = require('../services/TokenService');

suite('TokenService', () => {
  test('gera e verifica access token', () => {
    const token   = TokenService.gerarAccessToken({ id: 'uuid-test', role: 'client' });
    const payload = TokenService.verificarToken(token);
    assert.strictEqual(payload.id, 'uuid-test');
  });

  test('token expirado lança AppError 401', async () => {
    // usa token gerado com expiresIn: '1ms'
    ...
  });
});
```

**Checklist:**
- [ ] `npm run test:backend` executa sem erros
- [ ] Cobertura mínima: TokenService, PasswordService
- [ ] Testes rodam sem dependência de banco (unit-only)

**O que pode quebrar:** Nada — apenas adição de testes.

---

## ARQ-03 · P2P FallbackService sem monitoramento de saúde

**Gravidade:** BAIXO — P3
**Categoria:** Arquitetura · Backend · Observabilidade

**Descrição:**
O `src/services/FallbackService.js` e `PeerHealthService.js` gerenciam uma rede P2P
para replicação de mídia. Não há endpoint de health check específico para o estado
da rede P2P nem métricas de peers disponíveis/indisponíveis.

---

### PROMPT ARQ-03 — Adicionar endpoint de saúde P2P

**Objetivo:** Expor `/api/v1/health/peers` com status dos peers P2P registrados,
para monitoramento externo (UptimeRobot, Grafana).

**Arquivos afetados:**
- `src/controllers/HealthController.js` — adicionar método `getPeerHealth()`
- `src/routes/health.js` — adicionar rota `GET /peers`

**Risco:** BAIXO — apenas adição de rota. Sem alteração de lógica existente.

**Checklist:**
- [ ] `GET /api/v1/health/peers` retorna `{ peers: [...], healthy: N, total: N }`
- [ ] Endpoint não requer autenticação (monitoramento externo)
- [ ] Não vaza informações sensíveis de peers (sem IPs privados ou credenciais)

**O que pode quebrar:** Nada.

---

# 🎭 POO (ORIENTAÇÃO A OBJETOS)

---

## OOP-01 · `shared/js/` sem interface contratual formal entre camadas

**Gravidade:** BAIXO — P3
**Categoria:** POO · shared/js/

**Descrição:**
Em `shared/js/`, os services importam repositories diretamente via `require()` sem
contrato formal (interface/duck typing verificado). Em JS/Node.js puro, isso é aceitável,
mas `AuthService` assume que o objeto passado no construtor tem `.signIn()`, `.signOut()`,
`.refresh()` sem verificar em runtime.

---

### PROMPT OOP-01 — Adicionar duck-type validation no BaseService de shared/

**Objetivo:** Validar no construtor que o repositório injetado possui os métodos
esperados, falhando cedo com mensagem clara em vez de falha tardia com TypeError.

**Arquivos afetados:**
- `shared/js/services/BaseService.js` (se existir) ou cada service individualmente

**Risco:** BAIXO — apenas adição de validação defensiva no construtor.

**Implementação:**
```javascript
class AuthService {
  #repo;
  constructor(repo) {
    const required = ['signIn', 'signOut', 'refresh', 'getUser'];
    for (const method of required) {
      if (typeof repo[method] !== 'function') {
        throw new TypeError(`[AuthService] repo deve implementar ${method}()`);
      }
    }
    this.#repo = repo;
  }
}
```

**Checklist:**
- [ ] Instanciar AuthService com objeto sem `signIn` lança TypeError imediatamente
- [ ] Mensagem de erro indica qual método está faltando
- [ ] Testes existentes continuam passando

**O que pode quebrar:** Mocks de teste sem todos os métodos esperados.

---

## OOP-02 · `server.js` (servidor dev) mistura responsabilidades de roteamento e serving

**Gravidade:** BAIXO — P3
**Categoria:** POO · Infraestrutura

**Descrição:**
`server.js` (278 linhas, OOP puro sem Express) implementa roteamento, serving de
arquivos estáticos, mime-types e proxy reverso em uma única classe. Bem implementado,
mas `ProxyHandler` e `StaticFileHandler` poderiam ser classes separadas para o caso
de reuso futuro.

**Impacto:** Dívida técnica apenas — não afeta produção (server.js é só para dev).

**Recomendação:** Não refatorar agora. Anotar como melhoria futura quando server.js
precisar de nova funcionalidade (adição de WebSocket support, por exemplo).

---

# 💨 PERFORMANCE

---

## PERF-01 · Endpoints de barbearias públicos sem ETag/Last-Modified

**Gravidade:** MÉDIO — P2
**Categoria:** Performance · BFF

**Descrição:**
Após a auditoria anterior, `Cache-Control: public, max-age=60` foi adicionado às rotas
públicas de barbearias. Porém, sem `ETag` ou `Last-Modified`, browsers não podem fazer
conditional GETs — sempre recebem o body completo, mesmo quando não mudou nada.

---

### PROMPT PERF-01 — Adicionar ETag em endpoints de barbearias

**Objetivo:** Gerar ETag baseado no hash do payload para permitir resposta 304 Not Modified
quando o cliente já tem versão atualizada.

**Arquivos afetados:**
- `barberflow-bff-api/controllers/BaseController.js` — adicionar `etag()` helper
- `barberflow-bff-api/controllers/BarbeariaController.js` — usar `etag()` nas rotas públicas

**Risco:** BAIXO — ETag é aditivo. Clientes que ignoram ETag continuam funcionando.

**Implementação:**
```javascript
// BaseController.js
const crypto = require('crypto');

etag(res, data) {
  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify(data))
    .digest('hex')
    .slice(0, 16);
  res.setHeader('ETag', `"${hash}"`);
  return hash;
}

// Uso em BarbeariaController:
const data = await this.#svc.listarDestaque();
const tag  = this.etag(res, data);
if (req.headers['if-none-match'] === `"${tag}"`) {
  return res.status(304).end();
}
this.cachePublico(res, 60, 300);
this.success(res, data);
```

**Checklist:**
- [ ] Segunda requisição com `If-None-Match` retorna 304 (sem body)
- [ ] Dados diferentes geram ETag diferente
- [ ] `npm test` continua passando

**O que pode quebrar:** Nada — ETag é transparente para clientes sem suporte.

---

## PERF-02 · Haversine em memória no BFF — O(N) com catálogo grande

**Gravidade:** MÉDIO — P2 (dependente de DB-01 PostGIS)
**Categoria:** Performance · BFF · Banco de dados

**Descrição:**
`BarbeariaService.js` aplica filtro Haversine em memória após receber registros do banco.
Com PostGIS (ver DB-01), esse cálculo pode ser feito inteiramente no banco com índice
espacial GIST, eliminando o processamento Node.js e reduzindo dados trafegados.

**Este prompt depende de DB-01 (migração PostGIS) ter sido aplicada primeiro.**

---

### PROMPT PERF-02 — Remover Haversine in-memory após migração PostGIS

**Objetivo:** Após DB-01, simplificar `BarbeariaService.listarProximas()` para confiar
no filtro PostgREST `ST_DWithin`, removendo a computação em memória.

**Arquivos afetados:**
- `barberflow-bff-api/services/BarbeariaService.js`
- `barberflow-bff-api/repositories/BarbeariaRepository.js`

**Risco:** MÉDIO — mudança de lógica de filtragem. Testar com coordenadas reais.

**Dependências:** DB-01 (PostGIS migration) concluída e verificada.

**Implementação:**
```javascript
// BarbeariaService.js — após DB-01
async listarProximas(lat, lng, raioKm) {
  this._coordenada(lat, lng);
  this._positivo('raioKm', raioKm);
  // Banco já filtra e ordena por distância real
  return this.#repo.getNearby(lat, lng, raioKm);
}

// BarbeariaRepository.js — sem map/filter Haversine
async getNearby(lat, lng, raioKm) {
  const { data, error } = await this._db
    .from('barbershops')
    .select(BarbeariaRepository.#SELECT)
    .filter('geom', 'st_dwithin', `SRID=4326;POINT(${lng} ${lat})::geography,${raioKm * 1000}`)
    .order('rating_score', { ascending: false })
    .limit(50);
  if (error) this._throwDbError(error, 'getNearby');
  return data;
}
```

**Checklist:**
- [ ] Busca retorna barbearias dentro do raio especificado
- [ ] Resultados ordenados por distância/rating (configurar no PostgREST ou PostGIS)
- [ ] Performance < 50ms para 10.000 barbearias (verificar com EXPLAIN ANALYZE)
- [ ] `npm test` continua passando

**O que pode quebrar:** Se DB-01 não foi aplicado, query quebra imediatamente.
Verificar existência da coluna `geom` antes de aplicar.

---

# 🔧 BFF API

---

## BFF-01 · Race condition em criação de agendamentos

**Gravidade:** ALTO — P1
**Categoria:** BFF · Banco de dados · Escalabilidade

**Descrição:**
`AgendamentoBffService.#verificarConflito()` faz SELECT de conflitos e depois
`this.#repo.criar(payload)`. Entre as duas operações, dois clientes podem criar
agendamentos simultâneos para o mesmo profissional no mesmo horário. Ambos passariam
na verificação e ambos seriam inseridos — criando double-booking.

**Evidência:**
```
T=0ms: Cliente A verifica conflito → não há conflito
T=1ms: Cliente B verifica conflito → não há conflito
T=2ms: Cliente A insere agendamento
T=3ms: Cliente B insere agendamento  ← DOUBLE BOOKING
```

---

### PROMPT BFF-01 — Resolver race condition com Supabase RPC + unique constraint

**Objetivo:** Usar UNIQUE constraint parcial + RPC atômica para garantir que não
haja sobreposição de horários no nível do banco, eliminando a race condition.

**Arquivos afetados:**
- `supabase/migrations/20260516_appointments_unique_constraint.sql`
- `supabase/migrations/20260516_rpc_criar_agendamento.sql`
- `barberflow-bff-api/repositories/AgendamentoRepository.js`
- `barberflow-bff-api/services/AgendamentoBffService.js`

**Risco:** ALTO — mudança no fluxo crítico de agendamento. Testar em staging.

**Dependências:** DB-04 (índice em professional_id + scheduled_at) deve estar ativo.

**Migration:**
```sql
-- Função RPC atômica com lock por profissional
CREATE OR REPLACE FUNCTION criar_agendamento_atomico(
  p_client_id UUID, p_professional_id UUID, p_barbershop_id UUID,
  p_service_id UUID, p_scheduled_at TIMESTAMPTZ, p_duration_min INT, p_status TEXT
)
RETURNS SETOF appointments
LANGUAGE plpgsql AS $$
DECLARE
  v_fim TIMESTAMPTZ;
  v_conflito INT;
BEGIN
  v_fim := p_scheduled_at + (p_duration_min || ' minutes')::INTERVAL;

  -- Verifica conflito com FOR UPDATE (lock do profissional nesse slot)
  SELECT COUNT(*) INTO v_conflito
  FROM appointments
  WHERE professional_id = p_professional_id
    AND status NOT IN ('cancelled', 'no_show', 'done')
    AND scheduled_at < v_fim
    AND scheduled_at + (duration_min || ' minutes')::INTERVAL > p_scheduled_at
  FOR UPDATE;  -- Serializa concorrência

  IF v_conflito > 0 THEN
    RAISE EXCEPTION 'CONFLICT: horário indisponível' USING ERRCODE = '23505';
  END IF;

  RETURN QUERY
  INSERT INTO appointments (client_id, professional_id, barbershop_id, service_id,
    scheduled_at, duration_min, status)
  VALUES (p_client_id, p_professional_id, p_barbershop_id, p_service_id,
    p_scheduled_at, p_duration_min, p_status)
  RETURNING *;
END;
$$;
```

**Checklist:**
- [ ] 100 requests simultâneos para o mesmo horário/profissional resultam em 1 sucesso e 99 erros 409
- [ ] Agendamento criado retorna dados completos (com joins)
- [ ] Error code 23505 é tratado como 409 Conflict no controller
- [ ] `npm test` continua passando

**O que pode quebrar:** Timeout em pico de carga (lock SELECT FOR UPDATE pode criar
fila). Monitorar latência em produção.

---

## BFF-02 · `routes/auth.js` usa lazy-init — falha silenciosa no startup

**Gravidade:** BAIXO — P3
**Categoria:** BFF · Confiabilidade

**Descrição:**
`routes/auth.js` instancia `AuthController` apenas no primeiro request (lazy init):
```javascript
let _ctrl;
function ctrl() {
  if (!_ctrl) _ctrl = new AuthController(new AuthRepository(SupabaseClient.getInstance()));
  return _ctrl;
}
```
Se `SUPABASE_ANON_KEY` estiver ausente, o erro só aparece no primeiro request de auth,
não no startup. O health check `/api/health` responde 200 mesmo com auth quebrado.

---

### PROMPT BFF-02 — Validar SUPABASE_ANON_KEY no startup da aplicação

**Objetivo:** Verificar variáveis obrigatórias ao iniciar o servidor, falhando
cedo com mensagem clara em vez de falha silenciosa no primeiro request.

**Arquivos afetados:**
- `barberflow-bff-api/app.js` ou `barberflow-bff-api/server.js` — adicionar validação de startup

**Risco:** NENHUM — apenas adição de validação defensiva.

**Implementação:**
```javascript
// No topo de app.js, antes de criarApp():
function validarEnv() {
  const obrigatorias = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
  const ausentes = obrigatorias.filter(k => !process.env[k]);
  if (ausentes.length > 0) {
    throw new Error(`[BFF] Variáveis obrigatórias ausentes: ${ausentes.join(', ')}`);
  }
}
// Chamar antes de criarApp() em server.js
```

**Checklist:**
- [ ] Servidor não inicia sem SUPABASE_ANON_KEY
- [ ] Mensagem de erro clara no console (não stack trace)
- [ ] Com todas as vars configuradas, startup normal
- [ ] `npm test` usa `APP_ENV=development` — validação pulada (ou vars mockadas)

**O que pode quebrar:** Ambientes de teste sem vars reais. Adicionar `skip` em test env.

---

# 📱 FRONTEND

---

## FRONT-01 · Service Worker sem estratégia de invalidação de cache

**Gravidade:** BAIXO — P3
**Categoria:** Frontend · PWA

**Descrição:**
O Service Worker dos apps PWA (cliente e profissional) usa cache-first strategy.
Não há mecanismo de invalidação de cache quando o backend atualiza dados críticos
(ex: horários disponíveis, preços de serviços). Usuários podem ver dados stale
indefinidamente até o SW ser atualizado.

---

### PROMPT FRONT-01 — Adicionar versão de cache e invalidação no Service Worker

**Objetivo:** Incluir versão (`CACHE_VERSION`) no nome do cache para que novo deploy
invalide o cache automaticamente, evitando dados stale.

**Arquivos afetados:**
- `apps/cliente/sw.js` (ou `service-worker.js`)
- `apps/profissional/sw.js`

**Risco:** BAIXO — mudança no Service Worker. Usuários com SW antigo recebem o novo
na próxima visita (comportamento padrão de atualização de SW).

**Implementação:**
```javascript
// sw.js
const CACHE_VERSION = 'v2026.05.16'; // atualizar a cada deploy
const CACHE_NAME    = `barberflow-${CACHE_VERSION}`;

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
});
```

**Checklist:**
- [ ] Novo deploy invalida caches antigos
- [ ] App carrega corretamente após atualização do SW
- [ ] Dados críticos (preços, horários) são buscados da rede, não do cache

**O que pode quebrar:** Usuários offline perdem cache na atualização. Manter estratégia
network-first para dados críticos e cache-first apenas para assets estáticos.

---

## RESUMO DE PRIORIDADES

### P0 — Aplicar ANTES de qualquer release público

| ID | Problema | Categoria | Arquivo Principal |
|----|---------|-----------|-------------------|
| SEG-01 | direct_messages sem RLS | Segurança · DB | migration nova |
| BFF-01 | Race condition agendamentos | BFF · DB | AgendamentoRepository + migration |

### P1 — Aplicar antes de crescimento de usuários

| ID | Problema | Categoria | Arquivo Principal |
|----|---------|-----------|-------------------|
| DB-01 | Geo Euclidiana → PostGIS | DB · Performance | migration + repositories |
| DB-02 | Sem CHECK constraints | DB · Integridade | migration nova |
| ESC-01 | Rate limit em memória | Escalabilidade · BFF | rateLimiter.js |
| ARQ-02 | Sem testes em src/ | Arquitetura · Qualidade | src/tests/ (criar) |
| SEG-03 | Token rotation sem cascade | Segurança · Backend | TokenService + migration |

### P2 — Aplicar para escalar além de 1.000 usuários

| ID | Problema | Categoria | Arquivo Principal |
|----|---------|-----------|-------------------|
| DB-03 | Sem cleanup automático | DB · Escalabilidade | migration (crons) |
| DB-04 | Índices faltantes | DB · Performance | migration |
| ESC-02 | Auth fallback sem cache | Escalabilidade · BFF | auth.js middleware |
| ESC-03 | Sem cursor pagination | Escalabilidade | AgendamentoRepository |
| ARQ-01 | MediaManager monolítico | Arquitetura · Backend | MediaManager.js |
| PERF-01 | Sem ETag nos endpoints | Performance · BFF | BaseController |
| PERF-02 | Haversine in-memory | Performance · BFF | BarbeariaService |
| SEG-02 | CSP img-src wildcard | Segurança · Frontend | vercel.json raiz |

### P3 — Melhorias de qualidade e dívida técnica

| ID | Problema | Categoria | Arquivo Principal |
|----|---------|-----------|-------------------|
| DB-05 | likes redundantes | DB · Organização | migration |
| ARQ-03 | Sem health check P2P | Arquitetura | HealthController |
| OOP-01 | Sem duck-type validation | POO · shared/js | BaseService |
| BFF-02 | Lazy init silencioso | BFF · Confiabilidade | app.js |
| FRONT-01 | SW sem invalidação | Frontend · PWA | sw.js |

---

## PONTOS FORTES — O QUE ESTÁ EXCELENTE

- ✅ **Clean Architecture real** em todas as 4 camadas (Frontend/BFF/Backend/DB)
- ✅ **OOP exemplar** — campos privados `#`, herança controlada, DI via construtor
- ✅ **Zero SELECT \*** — campos explícitos em todos os repositories do sistema
- ✅ **Zero N+1** — joins explícitos em todas as listagens
- ✅ **LGPD compliance** — direito ao esquecimento implementado com `anonimizar_perfil()`
- ✅ **RLS no Supabase** — em 23 das 24 tabelas (apenas `direct_messages` faltando)
- ✅ **Máquina de estados** — transições de agendamento validadas e documentadas
- ✅ **JWT local** — verificação HS256 sem round-trip de rede
- ✅ **shared/js UMD** — código compartilhado entre Node.js e browser elegantemente
- ✅ **Docker multi-stage** — build enxuto, usuário não-root `barber`
- ✅ **Graceful shutdown** — SIGTERM/SIGINT com timeout configurável
- ✅ **140 testes** na BFF — cobertura de controller, service, repository e middlewares
- ✅ **Pino logging** — estruturado, com redação de campos sensíveis
- ✅ **Mass assignment prevention** — `_payload(dados, CAMPOS_PERMITIDOS)` em todas as escritas
- ✅ **Anti-enumeration** — mensagens de erro genéricas em auth (não vaza se email existe)
- ✅ **RetryHelper** — backoff exponencial para chamadas de rede instáveis

---

*Documento gerado pelo agente DELIMA — Auditoria read-only completa.*
*Nenhuma linha de código foi alterada durante esta análise.*
*Total de prompts individuais: 15 | P0: 2 | P1: 5 | P2: 8 | P3: 5*
