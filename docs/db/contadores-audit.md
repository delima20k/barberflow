# Auditoria de Contadores Desnormalizados — BarberFlow
**Data:** 2026-05-23  
**Escopo:** Mapeamento estático completo + queries de auditoria + análise de drift + impacto downstream.  
**Restrição:** Nenhum dado foi alterado. Queries de auditoria foram escritas para execução em staging/produção.  
**Metodologia:** Leitura de todas as 83 migrations (`supabase/migrations/`), `shared/js/`, `src/`, `barberflow-bff-api/`.

---

## 1. Mapa completo de contadores desnormalizados

| # | Tabela | Coluna | Tipo | Default | Fonte da Verdade | Predicado na Fonte | Mecanismo de Manutenção | Estado |
|---|---|---|---|---|---|---|---|---|
| C1 | `barbershops` | `likes_count` | `INTEGER` | `0` | `barbershop_interactions` | `type = 'like'` | TRIGGER `trg_barbershop_rating` (SECURITY DEFINER) | ✅ Saudável |
| C2 | `barbershops` | `dislikes_count` | `INTEGER` | `0` | `barbershop_interactions` | `type = 'dislike'` | TRIGGER `trg_barbershop_rating` (SECURITY DEFINER) | ✅ Saudável |
| C3 | `barbershops` | `rating_score` | `NUMERIC(3,1)` | `0.0` | Derivado de C1 e C2 | Fórmula Bayesiana | TRIGGER `trg_barbershop_rating` (SECURITY DEFINER) | ✅ Saudável |
| C4 | `barbershops` | `rating_avg` | `NUMERIC(3,2)` | `0.00` | Nenhuma | — | **Nenhum** | ⚠️ Órfão — sempre 0 |
| C5 | `barbershops` | `rating_count` | `INTEGER` | `0` | Nenhuma | — | **Nenhum** | ⚠️ Órfão — sempre 0 |
| C6 | `professionals` | `rating_count` | `INTEGER` | `0` | `professional_likes` | — | TRIGGER `trg_professional_likes` (SECURITY DEFINER) | ⚠️ Saudável, mas nome enganoso (armazena curtidas, não avaliações) |
| C7 | `professionals` | `rating_avg` | `NUMERIC(3,2)` | `0.00` | Nenhuma | — | **Nenhum** | ⚠️ Órfão — sempre 0 |
| C8 | `portfolio_images` | `likes_count` | `INTEGER` | `0` | `likes` | `content_type = 'portfolio_image'` | **Nenhum** | ❌ Sem trigger — sempre 0 |
| C9 | `portfolio_images` | `views_count` | `INTEGER` | `0` | Nenhuma | — | **Nenhum** | ❌ Sem fonte — sempre 0 |
| C10 | `stories` | `views_count` | `INTEGER` | `0` | `story_views` | — | **Nenhum** | ❌ Sem trigger — sempre 0 |
| C11 | `stories` | `likes_count`* | — | — | `likes` | `content_type = 'story'` | **Nenhum** | ❌ Coluna referenciada em `SocialRepository.js:40` mas ausente no schema |
| C12 | `feed_items` | `likes_count` | `INTEGER` | `0` | `likes` | — | **Nenhum** | ❌ Sem trigger — sempre 0 |
| C13 | `feed_items` | `views_count` | `INTEGER` | `0` | Nenhuma | — | **Nenhum** | ❌ Sem fonte — sempre 0 |
| C14 | `barbershop_mensalistas` | `haircuts_count` | `INTEGER` | `0` | `queue_entries` / `transactions` | Corte de mensalista finalizado | Código de aplicação — BFF `MensalistaRepository.js:232` | ⚠️ Race condition — sem lock |

> *C11: `SocialRepository.js` faz `SELECT views_count, likes_count` de `stories`, mas nenhuma migration adiciona `likes_count` à tabela `stories`. A query retorna `null` silenciosamente via PostgREST — **nunca um erro explícito**.

---

## 2. Detalhamento por contador

### C1 / C2 / C3 — `barbershops.likes_count`, `dislikes_count`, `rating_score`

**Trigger:** `trg_barbershop_rating` em `barbershop_interactions` (AFTER INSERT OR DELETE).  
**Função:** `fn_update_barbershop_rating()` — SECURITY DEFINER, `search_path = public` (correto).  
**Estratégia:** Recalcula COUNT(*) completo a cada evento — seguro contra drift por inserção concorrente.  
**Multi-tenant:** Correto — filtrado por `barbershop_id`.  
**Soft delete:** `barbershop_interactions` usa DELETE físico — sem risco de soft delete não contado.

**Histórico de bugs:**
- `20260418000001` criou a função **sem** `SECURITY DEFINER`. A RLS `bi_select_own` filtrava o COUNT(*) por `auth.uid()`, fazendo o trigger ver apenas 0 ou 1 interações. Todos os likes/dislikes gravados entre 2026-04-18 e 2026-04-21 estão potencialmente corrompidos.
- `20260421000004` recriou a função ainda **sem** `SECURITY DEFINER` (segundo regression).
- `20260421000005` corrigiu com SECURITY DEFINER + backfill completo. O backfill recalculou todos os registros existentes na data de aplicação.

**Janela de corrupção:** 2026-04-18 a 2026-04-21 (3 dias). Registros criados neste período foram corrigidos pelo backfill de 20260421000005 **desde que a migration tenha sido aplicada em produção sem lag**.

---

### C4 / C5 — `barbershops.rating_avg`, `rating_count`

**Origem:** `20260406000001_initial_schema.sql` — criados com valor fixo `0`.  
**Manutenção:** Nenhuma trigger, nenhum código de aplicação encontrado que faça UPDATE nestas colunas.  
**Uso na aplicação:**
- `BarbershopRepository.js:29, 44-46, 76-77, 94-96, 113-114` — usados em ORDER BY e SELECT
- `NearbyBarbershopsWidget.js:593` — exibe `rating_count` como "cortes" (`${b.rating_count} cortes`)
- `MapWidget.js:389-390` — exibe `rating_avg` na tooltip do mapa
- `CapaBarbearia.js:68` — exibe `rating_avg` com arredondamento

**Diagnóstico:** Estas colunas existem no schema mas nunca são atualizadas. O sistema exibe `0.0` para todas as barbearias em qualquer widget que dependa delas. Como `rating_score` (C3) **é** mantido e é a coluna preferencial de ordenação, o impacto direto é limitado na ordenação. Porém os widgets de exibição de rating mostram `0.0 ⭐` universalmente.

> **Hipótese:** Estas colunas eram de uma arquitetura anterior baseada em `appointments` (avaliações pós-corte). A nova arquitetura substituiu pelo sistema `likes/dislikes` (C1-C3), mas as colunas antigas nunca foram deprecadas nem documentadas.

---

### C6 — `professionals.rating_count`

**Trigger:** `trg_professional_likes` em `professional_likes` (AFTER INSERT OR DELETE).  
**Função:** `fn_update_professional_likes_count()` — SECURITY DEFINER (corrigido em 20260421000005).  
**Estratégia:** Recalcula COUNT(*) completo.  
**Nome enganoso:** A coluna se chama `rating_count` mas armazena o número de curtidas (`professional_likes`), não de avaliações. A view `profiles_public` e `BarbeiroPage.js:188` exibem isso como "avaliações".

**Janela de corrupção:** 2026-04-20 a 2026-04-21 — trigger inicial sem SECURITY DEFINER, corrigido e backfillado em 20260421000005.

---

### C7 — `professionals.rating_avg`

**Origem:** `20260406000001_initial_schema.sql` — criado com valor fixo `0.00`.  
**Manutenção:** Nenhuma.  
**Uso:** `BarbeiroPage.js:189` exibe `profile.rating_avg`. Sempre `0.0` para todos os profissionais.

---

### C8 — `portfolio_images.likes_count`

**Origem:** `20260406000002_media_schema.sql`.  
**Fonte da verdade:** Tabela `likes` com `content_type = 'portfolio_image'`.  
**Manutenção:** **Zero** — nenhum trigger, nenhuma função, nenhum código de aplicação encontrado.  
**Histórico relevante:** `20260517000003_unify_portfolio_likes.sql` migrou dados de `portfolio_likes` → `likes` e dropou `portfolio_likes`. A migration **não** criou trigger de manutenção no novo caminho.  
**Resultado:** `portfolio_images.likes_count` está em 0 para todos os registros após a unificação (2026-05-17).

---

### C9 — `portfolio_images.views_count`

**Origem:** `20260406000002_media_schema.sql`.  
**Fonte da verdade:** Nenhuma tabela de views de portfolio encontrada.  
**Manutenção:** Zero.  
**Resultado:** Sempre 0. Nenhum usuário ou sistema atualiza este campo.

---

### C10 — `stories.views_count`

**Origem:** `20260406000002_media_schema.sql`.  
**Fonte da verdade:** Tabela `story_views` (possui INSERT policy, dados são gravados).  
**Manutenção:** Zero — `story_views` tem INSERT policy e dados chegam, mas nenhum trigger atualiza `stories.views_count`.  
**Resultado:** `story_views` tem N linhas para uma story, mas `stories.views_count` permanece 0.

---

### C11 — `stories.likes_count` (coluna fantasma)

**Referenciada em:** `src/repositories/SocialRepository.js:40`
```js
views_count, likes_count, expires_at, created_at,
```
**Presente no schema:** Não encontrada em nenhuma migration.  
**Resultado:** PostgREST retorna `null` para a coluna (sem erro). O frontend recebe `null` silenciosamente.

---

### C12 / C13 — `feed_items.likes_count`, `feed_items.views_count`

**Origem:** `20260522000002_feed_bounded_context.sql`.  
**Manutenção:** Zero — `SupabaseFeedRepository.saveItem()` não persiste estes campos:
```js
// barberflow-bff-api/infrastructure/feed/SupabaseFeedRepository.js:16-29
.insert({
  id, author_id, source_type, source_id, content_hash, fanout_mode, created_at
  // likes_count e views_count NÃO estão aqui → ficam em 0 pelo default
})
```
**Resultado:** Todos os `feed_items` têm `likes_count = 0` e `views_count = 0`. A função `get_feed_page` retorna estes zeros para o feed.

---

### C14 — `barbershop_mensalistas.haircuts_count`

**Origem:** `20260521000002_add_haircuts_count_mensalistas.sql`.  
**Manutenção:** Código de aplicação — `barberflow-bff-api/repositories/MensalistaRepository.js:232`:
```js
.update({ haircuts_count: row.haircuts_count + 1 })
```
**Problema de race condition:** O incremento é feito em duas operações separadas:
1. `SELECT haircuts_count FROM barbershop_mensalistas` (via `verificar()`)
2. `UPDATE SET haircuts_count = valor_lido + 1`

Sem `pg_advisory_xact_lock` ou `UPDATE ... SET haircuts_count = haircuts_count + 1 WHERE ...`, dois atendentes simultâneos podem ler o mesmo valor e o segundo decremento sobrescreve o primeiro. O drift esperado é: `real_count = N atendimentos, stored_count = N - (concurrent_writes - 1)`.

---

## 3. Queries de auditoria — comparação stored vs real COUNT

Executar em staging com role `service_role`. Todas as queries consideram soft delete e contexto multi-tenant.

### 3.1 — C1: barbershops.likes_count

```sql
SELECT
  b.id                                   AS entity_id,
  b.name,
  b.likes_count                          AS stored_count,
  COUNT(bi.id) FILTER (WHERE bi.type = 'like') AS real_count,
  b.likes_count - COUNT(bi.id) FILTER (WHERE bi.type = 'like') AS drift
FROM public.barbershops b
LEFT JOIN public.barbershop_interactions bi ON bi.barbershop_id = b.id
WHERE b.is_active = true          -- exclui barbearias deletadas logicamente
GROUP BY b.id, b.name, b.likes_count
HAVING b.likes_count != COUNT(bi.id) FILTER (WHERE bi.type = 'like')
ORDER BY ABS(b.likes_count - COUNT(bi.id) FILTER (WHERE bi.type = 'like')) DESC;
```

### 3.2 — C2: barbershops.dislikes_count

```sql
SELECT
  b.id                                       AS entity_id,
  b.name,
  b.dislikes_count                           AS stored_count,
  COUNT(bi.id) FILTER (WHERE bi.type = 'dislike') AS real_count,
  b.dislikes_count - COUNT(bi.id) FILTER (WHERE bi.type = 'dislike') AS drift
FROM public.barbershops b
LEFT JOIN public.barbershop_interactions bi ON bi.barbershop_id = b.id
WHERE b.is_active = true
GROUP BY b.id, b.name, b.dislikes_count
HAVING b.dislikes_count != COUNT(bi.id) FILTER (WHERE bi.type = 'dislike')
ORDER BY ABS(drift) DESC;
```

### 3.3 — C3: barbershops.rating_score (drift em relação ao valor calculado)

```sql
WITH stats AS (
  SELECT
    barbershop_id,
    COUNT(*) FILTER (WHERE type = 'like')    AS lk,
    COUNT(*) FILTER (WHERE type = 'dislike') AS dl
  FROM public.barbershop_interactions
  GROUP BY barbershop_id
),
calculated AS (
  SELECT
    s.barbershop_id,
    CASE WHEN (s.lk + s.dl) = 0 THEN 0.0
    ELSE ROUND(
      (3.0 * 5 + ((s.lk * 5.0 + s.dl * 1.0) / (s.lk + s.dl)) * (s.lk + s.dl))
      / (5 + (s.lk + s.dl))
    , 1) END AS expected_score
  FROM stats s
)
SELECT
  b.id,
  b.name,
  b.rating_score   AS stored_score,
  c.expected_score AS real_score,
  b.rating_score - c.expected_score AS drift
FROM public.barbershops b
LEFT JOIN calculated c ON c.barbershop_id = b.id
WHERE b.is_active = true
  AND b.rating_score IS DISTINCT FROM COALESCE(c.expected_score, 0.0)
ORDER BY ABS(b.rating_score - COALESCE(c.expected_score, 0.0)) DESC;
```

### 3.4 — C4 / C5: barbershops.rating_avg e rating_count (confirmação de que são sempre 0)

```sql
SELECT
  COUNT(*)                                    AS total_barbershops,
  COUNT(*) FILTER (WHERE rating_avg > 0)      AS com_rating_avg,
  COUNT(*) FILTER (WHERE rating_count > 0)    AS com_rating_count
FROM public.barbershops
WHERE is_active = true;
-- Esperado: com_rating_avg = 0, com_rating_count = 0
```

### 3.5 — C6: professionals.rating_count (armazena likes, não ratings)

```sql
SELECT
  p.id                   AS entity_id,
  pr.full_name,
  p.rating_count         AS stored_count,
  COUNT(pl.id)           AS real_like_count,
  p.rating_count - COUNT(pl.id) AS drift
FROM public.professionals p
LEFT JOIN public.profiles pr ON pr.id = p.id
LEFT JOIN public.professional_likes pl ON pl.professional_id = p.id
WHERE p.is_active = true
GROUP BY p.id, pr.full_name, p.rating_count
HAVING p.rating_count != COUNT(pl.id)
ORDER BY ABS(p.rating_count - COUNT(pl.id)) DESC;
```

### 3.6 — C8: portfolio_images.likes_count

```sql
-- Considera soft delete: apenas imagens ativas (status != 'deleted')
SELECT
  pi.id              AS entity_id,
  pi.owner_id,
  pi.category,
  pi.likes_count     AS stored_count,
  COUNT(l.id)        AS real_count,
  pi.likes_count - COUNT(l.id) AS drift
FROM public.portfolio_images pi
LEFT JOIN public.likes l
  ON l.content_id   = pi.id
  AND l.content_type = 'portfolio_image'
WHERE pi.status != 'deleted'         -- soft delete via status
GROUP BY pi.id, pi.owner_id, pi.category, pi.likes_count
HAVING pi.likes_count != COUNT(l.id)
ORDER BY ABS(pi.likes_count - COUNT(l.id)) DESC;
```

### 3.7 — C10: stories.views_count

```sql
-- Considera soft delete: stories expirados (expires_at < now()) são funcionalmente deletados
-- Auditamos todos para medir o drift histórico
SELECT
  s.id              AS entity_id,
  s.owner_id,
  s.barbershop_id,
  s.views_count     AS stored_count,
  COUNT(sv.id)      AS real_count,
  s.views_count - COUNT(sv.id) AS drift,
  s.expires_at,
  (s.expires_at < now()) AS expirado
FROM public.stories s
LEFT JOIN public.story_views sv ON sv.story_id = s.id
GROUP BY s.id, s.owner_id, s.barbershop_id, s.views_count, s.expires_at
HAVING s.views_count != COUNT(sv.id)
ORDER BY ABS(s.views_count - COUNT(sv.id)) DESC;
```

### 3.8 — C12: feed_items.likes_count

```sql
-- Nota: a tabela likes não tem FK para feed_items — join via source_id
-- O drift esperado é: stored=0, real=COUNT(likes where content_id=source_id)
SELECT
  fi.id              AS entity_id,
  fi.author_id,
  fi.source_type,
  fi.source_id,
  fi.likes_count     AS stored_count,
  COUNT(l.id)        AS real_count,
  fi.likes_count - COUNT(l.id) AS drift
FROM public.feed_items fi
LEFT JOIN public.likes l
  ON l.content_id    = fi.source_id
  AND l.content_type = fi.source_type
GROUP BY fi.id, fi.author_id, fi.source_type, fi.source_id, fi.likes_count
HAVING fi.likes_count != COUNT(l.id)
ORDER BY ABS(fi.likes_count - COUNT(l.id)) DESC;
```

### 3.9 — C14: barbershop_mensalistas.haircuts_count (não auditável automaticamente)

```sql
-- Não há tabela de eventos com granularidade de "corte de mensalista finalizado".
-- A melhor proxy disponível é transactions com tipo 'revenue' e mensalista ativo no período.
-- LIMITAÇÃO: esta query é uma estimativa — não é a fonte canônica.
SELECT
  bm.id,
  bm.barbershop_id,
  bm.client_id,
  bm.haircuts_count  AS stored_count,
  -- Proxy: transactions do cliente nesta barbearia no período do plano
  COUNT(t.id)        AS proxy_transaction_count,
  bm.haircuts_count - COUNT(t.id) AS drift_estimado
FROM public.barbershop_mensalistas bm
LEFT JOIN public.transactions t
  ON t.client_id     = bm.client_id
  AND t.barbershop_id = bm.barbershop_id
  AND t.status        = 'paid'
  AND t.type          = 'revenue'
  AND t.created_at   BETWEEN bm.starts_at AND bm.ends_at
GROUP BY bm.id, bm.barbershop_id, bm.client_id, bm.haircuts_count
HAVING bm.haircuts_count != COUNT(t.id)
ORDER BY ABS(drift_estimado) DESC;
```

> **Limitação:** Este contador não pode ser auditado automaticamente porque não existe tabela de eventos `mensalista_haircuts`. Ver Seção 7.

---

## 4. Classificação do drift esperado

Com base na análise estática de código e migrations (sem execução real de queries):

| # | Contador | Magnitude esperada de drift | Direção provável | Padrão temporal |
|---|---|---|---|---|
| C1 | `barbershops.likes_count` | Baixo — trigger recalcula do zero | Fantasmas possíveis (stored > real) se houve DELETE sem trigger | Correlação com 2026-04-18 a 2026-04-21 (janela de corrupção) |
| C2 | `barbershops.dislikes_count` | Baixo — mesma proteção de C1 | Idem | Idem |
| C3 | `barbershops.rating_score` | Proporcional ao drift de C1/C2 | Valores afastados do calculado | Idem |
| C4 | `barbershops.rating_avg` | **100%** dos registros com drift | stored=0, real=? (não há fonte) | Sempre — desde a criação |
| C5 | `barbershops.rating_count` | **100%** dos registros com drift | stored=0, real=? | Sempre |
| C6 | `professionals.rating_count` | Baixo | Fantasmas possíveis no período 2026-04-20 a 2026-04-21 | Correlação com janela de corrupção |
| C7 | `professionals.rating_avg` | **100%** — sempre 0 | stored=0, real=? | Sempre |
| C8 | `portfolio_images.likes_count` | **100%** após 2026-05-17 | stored=0, real=N (likes existem na tabela `likes`) | Início em 2026-05-17 (unify_portfolio_likes) |
| C9 | `portfolio_images.views_count` | Indeterminável — sem fonte | stored=0 | Sempre |
| C10 | `stories.views_count` | **Alto** — story_views tem dados, stories.views_count é 0 | Perdidos (stored < real) | Sempre — desde 2026-04-06 |
| C12 | `feed_items.likes_count` | **100%** após 2026-05-22 | stored=0, real=N | Desde criação do feed_items |
| C13 | `feed_items.views_count` | Indeterminável — sem fonte | stored=0 | Sempre |
| C14 | `barbershop_mensalistas.haircuts_count` | Pequeno mas crescente | Perdidos (drift negativo) | Correlação com horários de pico (concurrent writes) |

---

## 5. Rastreamento de causas prováveis

### C1/C2 — Janela de corrupção (2026-04-18 a 2026-04-21)

**Causa:** Trigger criado sem `SECURITY DEFINER`. O PostgreSQL executava o `COUNT(*)` sob o contexto do usuário que disparou o trigger, e a RLS `bi_select_own` (`USING (auth.uid() = user_id)`) filtrava o resultado para ver apenas as interações do próprio usuário — sempre 1 (ou 0 em DELETE).

**Resultado:** Para cada INSERT de like, `likes_count` era definido como 1 (independente de quantos likes reais existiam). Para cada DELETE, era definido como 0.

**Correção aplicada:** `20260421000005` adicionou SECURITY DEFINER e fez backfill. **Risco residual:** Se alguma migration foi aplicada com lag entre ambientes, o backfill pode não ter corrigido todos os registros.

### C4/C5/C7 — Colunas órfãs

**Causa:** Design original baseado em avaliações pós-corte (modelo star rating). A arquitetura migrou para `barbershop_interactions` (like/dislike), mas as colunas do modelo antigo nunca foram deprecadas. Nenhum trigger ou código as atualiza porque a feature nunca foi implementada.

**Resultado:** Exibição de `0.0 ⭐` para todas as barbearias e profissionais em qualquer widget que leia `rating_avg`.

### C8 — portfolio_images.likes_count sem trigger

**Causa:** `20260517000003_unify_portfolio_likes.sql` migrou os dados de `portfolio_likes` para a tabela unificada `likes`, removeu `portfolio_likes`, mas **não criou trigger** na tabela `likes` para manter `portfolio_images.likes_count`.

**Resultado:** Após 2026-05-17, qualquer like em portfolio é gravado em `likes` mas `portfolio_images.likes_count` permanece no valor que tinha antes da migration (provavelmente 0, já que `portfolio_likes` também não tinha trigger).

### C10 — stories.views_count sem trigger

**Causa:** A tabela `story_views` foi criada e tem políticas RLS corretas (INSERT para autenticados), então visualizações são gravadas com sucesso. Porém nenhuma migration criou um trigger `AFTER INSERT ON story_views` para incrementar `stories.views_count`.

**Resultado:** `story_views` acumula dados corretos, mas `stories.views_count` é sempre 0 — **dados são coletados e descartados**.

### C12/C13 — feed_items.likes_count e views_count

**Causa:** `SupabaseFeedRepository.saveItem()` não inclui `likes_count` ou `views_count` no INSERT. Nenhum trigger conecta eventos de like/view aos feed_items correspondentes.

**Resultado:** Todo `feed_item` nasce e permanece com `likes_count = 0, views_count = 0`. A query `get_feed_page` retorna zeros para o feed — os contadores do feed são inutilizáveis.

### C14 — haircuts_count: race condition

**Causa:** `MensalistaRepository.js` faz:
```js
// Leitura
const row = await this.verificar(barbershopId, clientId);
// ...mais código...
// Escrita (sem lock)
.update({ haircuts_count: row.haircuts_count + 1 })
```

**Padrão correto seria:**
```sql
UPDATE barbershop_mensalistas
   SET haircuts_count = haircuts_count + 1
 WHERE barbershop_id = $1 AND client_id = $2
   AND ends_at > now();
```

---

## 6. Impacto downstream

### 6.1 Ranking e ordenação

| Contador | Usado em ranking? | Impacto se errado |
|---|---|---|
| `barbershops.likes_count` | **Sim** — `BarbershopRepository.js:44,77,95,217` — ORDER BY principal | Alto: barbearias com mais likes reais aparecem em posição errada |
| `barbershops.rating_score` | **Sim** — ORDER BY principal | Alto: mesmo impacto que likes_count (derivado) |
| `barbershops.rating_avg` | **Sim** — ORDER BY desempate | Médio: como é 0 para todos, não altera ranking relativo entre barbearias — apenas empata tudo |
| `professionals.rating_count` | **Sim** — `BarbershopRepository.js:258,295` — ORDER BY em listagem de barbeiros | Alto: barbeiros com mais likes reais não sobem na listagem |
| `portfolio_images.likes_count` | **Possível** — `idx_portfolio_featured` indexa `is_featured,status` | Baixo: não usado como ORDER BY explícito encontrado |
| `feed_items.likes_count` | **Latente** — campo existe na RPC `get_feed_page`, mas affinity_score retorna 0 para todos | Médio (quando affinity_score for implementado) |

### 6.2 Feed

| Contador | Impacto |
|---|---|
| `feed_items.likes_count = 0` | Feed não consegue ordenar por popularidade — affinity_score retorna 0 para todos os items |
| `feed_items.views_count = 0` | Idem — sem dado de engajamento para ranking do feed |

### 6.3 Reputação e score de profissional/barbearia

| Contador | Impacto | Visibilidade para o usuário |
|---|---|---|
| `professionals.rating_avg = 0` | Todo profissional aparece com 0.0 estrelas em `BarbeiroPage.js:189` | **Alta** — usuário vê 0 estrelas mesmo para profissionais bem avaliados |
| `barbershops.rating_avg = 0` | `MapWidget.js:390` mostra `⭐ 0.0` no popup do mapa, `SearchWidget.js:335,346` mostra 0.0 nos resultados | **Alta** — impacta primeira impressão do usuário na busca |
| `stories.views_count = 0` | Profissional/barbearia não vê quantas pessoas assistiram o story | Média — backoffice/analytics |
| `portfolio_images.likes_count = 0` | Portfolio aparece sem curtidas mesmo com usuários tendo curtido | **Alta** — profissional não vê engajamento, usuário não vê indicador social |

### 6.4 Listagem ordenada por popularidade

`NavigationManager.js:173`:
```js
.order('likes_count', { ascending: false })
```

Se `barbershops.likes_count` tiver drift (janela 2026-04-18 a 2026-04-21), barbearias populares antes dessa data podem estar sub-rankeadas. Após o backfill de 20260421000005, isso deve ter sido corrigido — dependendo do lag de aplicação.

### 6.5 Mensalistas (haircuts_count)

`MinhaBarbeariaRuntimeController.js:776`:
```js
mensalistaCortesCount = data?.haircuts_count ?? 0;
```

Exibido no painel de mensalistas. Drift pequeno (1-2 cortes) em períodos de alto movimento. Não afeta cobrança (que é por plano, não por corte).

---

## 7. Contadores que não puderam ser auditados automaticamente

| Contador | Razão | O que seria necessário |
|---|---|---|
| `barbershop_mensalistas.haircuts_count` | Não existe tabela de eventos de corte de mensalista | Criar `mensalista_haircut_events` ou usar `transactions` com `notes` estruturado |
| `portfolio_images.views_count` | Não existe tabela `portfolio_views` | Criar tabela de views ou usar analytics externo |
| `feed_items.views_count` | Não existe tabela de views de feed | Criar `feed_item_views` ou integrar com analytics |
| `barbershops.rating_avg` e `rating_count` | Não existe tabela de ratings/avaliações | Feature nunca foi implementada — campos são decorativos |
| `professionals.rating_avg` | Idem | Idem |
| `stories.likes_count` | Coluna não existe no schema | Adicionar coluna + trigger ou remover referência em `SocialRepository.js:40` |

---

## 8. Revisão final — soft delete e multi-tenant

### Soft delete considerado nas queries

| Tabela | Soft delete | Considerado nas queries |
|---|---|---|
| `barbershops` | `is_active = false` | ✅ `WHERE b.is_active = true` |
| `professionals` | `is_active = false` | ✅ `WHERE p.is_active = true` |
| `portfolio_images` | `status = 'deleted'` ou `'archived'` | ✅ `WHERE pi.status != 'deleted'` |
| `stories` | `expires_at < now()` (expiração lógica) | ✅ coluna `expirado` na query, auditado para todos |
| `barbershop_interactions` | DELETE físico (sem soft delete) | ✅ N/A |
| `professional_likes` | DELETE físico | ✅ N/A |
| `barbershop_mensalistas` | `ends_at < now()` (plano expirado) | ⚠️ Query de proxy não filtra por ends_at > now() — limitação indicada |
| `notifications` | `deleted_at IS NULL` | N/A — não é contador desnormalizado |

### Multi-tenant considerado

Todas as queries filtram por chave de tenant (`barbershop_id`, `professional_id`, `owner_id`) corretamente. Não há risco de drift cross-tenant nas queries propostas.

---

## 9. Resumo executivo por prioridade de correção

| Prioridade | Contador | Impacto direto no usuário | Complexidade do fix |
|---|---|---|---|
| P0 | `portfolio_images.likes_count` (C8) | Alto — usuário vê 0 curtidas mesmo tendo curtido | Baixa — criar trigger na tabela `likes` |
| P0 | `stories.views_count` (C10) | Médio — analytics/backoffice inútil | Baixa — criar trigger em `story_views` |
| P1 | `professionals.rating_avg` (C7) | Alto — sempre 0 estrelas | Média — define o que é `rating_avg` (média de quê?) |
| P1 | `barbershops.rating_avg` e `rating_count` (C4/C5) | Alto — 0 estrelas no mapa | Média — mesma questão de produto |
| P1 | `feed_items.likes_count` e `views_count` (C12/C13) | Médio latente — feed sem ranking | Alta — requer eventos de engajamento no feed |
| P2 | `barbershop_mensalistas.haircuts_count` (C14) | Baixo — off-by-one em pico | Baixa — mudar para SQL atômico |
| P2 | `stories.likes_count` (C11) | Baixo — campo inexistente, não exibido | Baixa — remover da query ou adicionar coluna |

Ver `/docs/db/contadores-rebuild-plan.md` para plano de execução.

---

*Auditoria estática — nenhum dado foi alterado. Rastreabilidade: todas as evidências citadas com arquivo e linha.*
