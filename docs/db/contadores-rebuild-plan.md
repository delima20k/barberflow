# Plano de Rebuild de Contadores Desnormalizados — BarberFlow
**Data:** 2026-05-23  
**Escopo:** 14 contadores mapeados em `docs/db/contadores-audit.md`.  
**Restrição:** Nenhum dado deve ser alterado sem aprovação explícita. Este documento é planejamento; não execute sem revisar o estado atual do banco.  
**Pré-requisito:** Execute as audit queries de `docs/db/drift-report.json` em staging antes de aplicar qualquer migration aqui.

---

## Resumo executivo

| Grupo | Contadores | Ação | Estimativa de tempo (produção) |
|---|---|---|---|
| P0 — Fix imediato | C8, C10 | Criar triggers SECURITY DEFINER + backfill atômico | < 1 min cada (sem lock) |
| P1 — Fix de produto | C4, C5, C7, C12 | Decisão de produto + trigger ou remoção de coluna | Variável — ver Seção 5 |
| P2 — Fix cirúrgico | C11, C14 | Correção atômica no código (C14) e schema/query (C11) | < 5 min cada |
| P2 — Verificação | C1, C2, C3, C6 | Rodar audit query; backfill apenas se drift > 0 | < 2 min cada |
| P3 — Dependente de produto | C9, C13 | Criar tabela de eventos → trigger → backfill | Depende de decisão de produto |

---

## Dependências entre contadores

```
C1 ──┐
C2 ──┴─► C3   (C3 deriva de C1/C2 — rebuild C1 e C2 antes de verificar C3)

C8           (independente — trigger em public.likes filtrado por content_type)
C10          (independente — trigger em public.story_views)

C4, C5, C7   (órfãos sem fonte — sem dependência, decisão de produto)
C9, C13      (sem fonte — requerem tabela nova antes do trigger)

C11          (phantom column — corrigir SocialRepository.js ou adicionar coluna)
C12          (trigger em public.likes filtrado por content_type = feed_item.source_type)
C14          (mudar código BFF para SQL atômico)
```

---

## 1. P0 — C8: portfolio_images.likes_count

**Problema:** Trigger inexistente após `20260517000003_unify_portfolio_likes.sql`.  
**Impacto:** Todos os likes de portfolio após 2026-05-17 não refletem no contador.  
**Estratégia:** Criar trigger AFTER INSERT OR DELETE em `public.likes` com filtro `content_type = 'portfolio_image'`. Backfill completo em seguida, sem lock de tabela (UPDATE por batch via CTE).

### Migration: `20260524000001_fix_portfolio_likes_count.sql`

```sql
-- =============================================================================
-- Migration: 20260524000001_fix_portfolio_likes_count.sql
-- Fix C8: cria trigger em public.likes para manter portfolio_images.likes_count.
-- Reversível: DROP TRIGGER + DROP FUNCTION + recalcular backfill para 0.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_update_portfolio_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.content_type = 'portfolio_image' OR
     (TG_OP = 'DELETE' AND OLD.content_type = 'portfolio_image') THEN
    UPDATE public.portfolio_images
    SET likes_count = (
      SELECT COUNT(*)
      FROM   public.likes
      WHERE  content_id   = CASE TG_OP WHEN 'DELETE' THEN OLD.content_id ELSE NEW.content_id END
        AND  content_type = 'portfolio_image'
    )
    WHERE id = CASE TG_OP WHEN 'DELETE' THEN OLD.content_id ELSE NEW.content_id END;
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_update_portfolio_likes_count() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_portfolio_likes_count
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_portfolio_likes_count();

-- Backfill: recalcula todos sem lock de tabela
-- Executa como UPDATE simples — lê e escreve apenas a linha afetada por portfolio_image
UPDATE public.portfolio_images pi
SET    likes_count = (
  SELECT COUNT(*)
  FROM   public.likes l
  WHERE  l.content_id   = pi.id
    AND  l.content_type = 'portfolio_image'
)
WHERE pi.status != 'deleted';

COMMIT;
```

**Validação pós-aplicação:**
```sql
-- Deve retornar 0 linhas
SELECT COUNT(*) AS drift_rows
FROM public.portfolio_images pi
LEFT JOIN public.likes l ON l.content_id = pi.id AND l.content_type = 'portfolio_image'
WHERE pi.status != 'deleted'
  AND pi.likes_count != COUNT(l.id) -- agrupado externamente na versão completa
GROUP BY pi.id
HAVING pi.likes_count != COUNT(l.id);
```

**Tempo estimado em produção:** < 1 minuto. O UPDATE não adquire lock de tabela; apenas row locks nas linhas afetadas. Em tabelas com milhares de registros, rodar durante horário de baixo tráfego ou usar batch de 500 por vez com `LIMIT 500` e loop.

---

## 2. P0 — C10: stories.views_count

**Problema:** `story_views` recebe inserções corretas, mas nenhum trigger atualiza `stories.views_count`.  
**Estratégia:** Trigger AFTER INSERT em `story_views`. Backfill completo sem lock.

### Migration: `20260524000002_fix_story_views_count.sql`

```sql
-- =============================================================================
-- Migration: 20260524000002_fix_story_views_count.sql
-- Fix C10: cria trigger em public.story_views para manter stories.views_count.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_update_story_views_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.stories
  SET    views_count = (
    SELECT COUNT(*)
    FROM   public.story_views sv
    WHERE  sv.story_id = NEW.story_id
  )
  WHERE id = NEW.story_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_update_story_views_count() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_story_views_count
  AFTER INSERT ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_story_views_count();

-- Backfill: recalcula todos (inclusive expirados — para histórico correto)
UPDATE public.stories s
SET    views_count = (
  SELECT COUNT(*)
  FROM   public.story_views sv
  WHERE  sv.story_id = s.id
);

COMMIT;
```

**Validação pós-aplicação:**
```sql
SELECT COUNT(*) AS drift_rows
FROM public.stories s
LEFT JOIN public.story_views sv ON sv.story_id = s.id
GROUP BY s.id, s.views_count
HAVING s.views_count != COUNT(sv.id);
```

**Tempo estimado:** < 1 minuto (stories têm expiração — número total tende a ser pequeno).

---

## 3. P2 — C14: barbershop_mensalistas.haircuts_count (race condition)

**Problema:** `MensalistaRepository.js:232` faz read-modify-write sem lock atômico.  
**Fix:** Substituir pela expressão `haircuts_count + 1` diretamente na query SQL (incremento atômico via PostgreSQL).

### Arquivo: `barberflow-bff-api/repositories/MensalistaRepository.js`

**Linha atual (232):**
```js
.update({ haircuts_count: row.haircuts_count + 1 })
```

**Substituir por:**
```js
// haircuts_count = haircuts_count + 1 atomicamente via rpc
// Evita race condition de read-modify-write — PostgreSQL garante atomicidade do UPDATE
.rpc('increment_haircuts_count', { p_barbershop_id: barbershopId, p_client_id: clientId })
```

**Migration auxiliar (opcional mas recomendada):**
```sql
-- Migration: 20260524000003_atomic_haircuts_increment.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.increment_haircuts_count(
  p_barbershop_id uuid,
  p_client_id     uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.barbershop_mensalistas
  SET    haircuts_count = haircuts_count + 1
  WHERE  barbershop_id = p_barbershop_id
    AND  client_id     = p_client_id
    AND  ends_at       > now();
$$;

REVOKE ALL ON FUNCTION public.increment_haircuts_count(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_haircuts_count(uuid, uuid)
  TO authenticated;

COMMIT;
```

**Alternativamente** (sem RPC, mais simples): usar `.rpc('increment_haircuts_count', ...)` ou mudar para query direta via `supabase.from().update({ haircuts_count: supabase.sql`haircuts_count + 1` })` se o SDK suportar expressões SQL.

**Validação:** Criar teste concorrente que dispara 10 cortes simultâneos para o mesmo mensalista e verifica que `haircuts_count = 10`.

---

## 4. P2 — C11: stories.likes_count (phantom column)

**Problema:** `SocialRepository.js:40` seleciona `likes_count` de `stories`, mas a coluna não existe.  
**Duas opções:**

### Opção A — Remover da query (sem nova coluna)

```js
// SocialRepository.js:40 — remover likes_count da seleção
views_count, expires_at, created_at,
// Se likes de stories forem necessários, buscar via JOIN em public.likes
```

### Opção B — Adicionar coluna + trigger

```sql
-- Migration: 20260524000004_add_story_likes_count.sql
BEGIN;

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.fn_update_story_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.content_type = 'story' OR
     (TG_OP = 'DELETE' AND OLD.content_type = 'story') THEN
    UPDATE public.stories
    SET likes_count = (
      SELECT COUNT(*)
      FROM   public.likes
      WHERE  content_id   = CASE TG_OP WHEN 'DELETE' THEN OLD.content_id ELSE NEW.content_id END
        AND  content_type = 'story'
    )
    WHERE id = CASE TG_OP WHEN 'DELETE' THEN OLD.content_id ELSE NEW.content_id END;
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_update_story_likes_count() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_story_likes_count
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_story_likes_count();

-- Backfill
UPDATE public.stories s
SET    likes_count = (
  SELECT COUNT(*) FROM public.likes l
  WHERE  l.content_id = s.id AND l.content_type = 'story'
);

COMMIT;
```

**Recomendação:** Opção B se likes de stories são exibidos na UI. Opção A se a coluna é lida mas nunca exibida (confirmar com `SocialRepository.js` consumers).

---

## 5. P1 — C4, C5, C7: colunas órfãs (barbershops.rating_avg/count, professionals.rating_avg)

**Situação:** Colunas criadas para um sistema de star-rating que nunca foi implementado. Sempre 0.

**Decisão de produto necessária (única neste plano):** Implementar o star-rating original ou deprecar as colunas?

### Opção A — Deprecar (remover ou ocultar)

```sql
-- Remover colunas (irreversível sem rollback)
ALTER TABLE public.barbershops DROP COLUMN IF EXISTS rating_avg;
ALTER TABLE public.barbershops DROP COLUMN IF EXISTS rating_count;
ALTER TABLE public.professionals DROP COLUMN IF EXISTS rating_avg;
```

Antes de remover: atualizar `MapWidget.js:390`, `CapaBarbearia.js:68`, `BarbershopRepository.js:94-96`, `NearbyBarbershopsWidget.js:593`, `BarbeiroPage.js:189` para não referenciar estas colunas.

### Opção B — Ativar star-rating real

Criar tabela `barbershop_ratings` (`id, barbershop_id, rater_id, rating INT CHECK 1-5, created_at`), trigger SECURITY DEFINER calculando `AVG(rating)` e `COUNT(*)`, backfill zerado (ou migrar avaliações de outra fonte).

**Estimativa Opção B:** 3-4 migrations + testes + UI — sprint de 2-3 dias.

### Interim (sem decisão de produto)

Remover as colunas dos ORDER BY clauses em `BarbershopRepository.js` para que o ranking não empate todos em 0. `rating_score` (C3) já resolve o ranking de popularidade corretamente.

---

## 6. P1 — C12: feed_items.likes_count

**Problema:** `SupabaseFeedRepository.saveItem()` não persiste contadores; sem trigger.  
**Fix em duas partes:**

### 6.1 — Trigger em public.likes para feed_items

```sql
-- Migration: 20260524000005_fix_feed_items_likes_count.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_update_feed_items_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_content_id   uuid;
  v_content_type text;
BEGIN
  v_content_id   := CASE TG_OP WHEN 'DELETE' THEN OLD.content_id   ELSE NEW.content_id   END;
  v_content_type := CASE TG_OP WHEN 'DELETE' THEN OLD.content_type ELSE NEW.content_type END;

  UPDATE public.feed_items fi
  SET    likes_count = (
    SELECT COUNT(*)
    FROM   public.likes l
    WHERE  l.content_id   = fi.source_id
      AND  l.content_type = fi.source_type
  )
  WHERE fi.source_id   = v_content_id
    AND fi.source_type = v_content_type;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_update_feed_items_likes_count() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_feed_items_likes_count
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_feed_items_likes_count();

-- Backfill
UPDATE public.feed_items fi
SET    likes_count = (
  SELECT COUNT(*)
  FROM   public.likes l
  WHERE  l.content_id   = fi.source_id
    AND  l.content_type = fi.source_type
);

COMMIT;
```

**Nota:** O trigger de C8, C11 e C12 todos disparam em `AFTER INSERT OR DELETE ON public.likes`. São funções separadas em triggers separados — cada um atualiza apenas sua tabela. Não há conflito.

### 6.2 — Corrigir SupabaseFeedRepository.saveItem()

O INSERT em `feed_items` não precisa receber `likes_count` explicitamente após o trigger estar ativo (default 0 é correto no momento da criação). Nenhuma mudança no código BFF é necessária para novos items.

---

## 7. P3 — C9, C13: contadores sem fonte

**Situação:** `portfolio_images.views_count` e `feed_items.views_count` não têm tabela de eventos.

**Pré-requisito obrigatório:** Criar tabelas de eventos ANTES de criar triggers.

```sql
-- portfolio_images.views_count — criar tabela de eventos
CREATE TABLE IF NOT EXISTS public.portfolio_views (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id     uuid        NOT NULL REFERENCES public.portfolio_images(id) ON DELETE CASCADE,
  viewer_id        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  viewed_at        timestamptz NOT NULL DEFAULT now(),
  ip_hash          text,
  CONSTRAINT uniq_portfolio_view_per_session UNIQUE (portfolio_id, viewer_id)
);
ALTER TABLE public.portfolio_views ENABLE ROW LEVEL SECURITY;
```

```sql
-- feed_items.views_count — criar tabela de eventos
CREATE TABLE IF NOT EXISTS public.feed_item_views (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id uuid       NOT NULL REFERENCES public.feed_items(id) ON DELETE CASCADE,
  viewer_id   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  viewed_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feed_item_views ENABLE ROW LEVEL SECURITY;
```

Após criar as tabelas: seguir o mesmo padrão de trigger das seções 1 e 2 (AFTER INSERT, SECURITY DEFINER, recalcula COUNT(*)).

**Estimativa:** 1 migration por tabela + trigger + policies RLS + código de aplicação para registrar visualizações.

---

## 8. Verificação de backfill residual (C1, C2, C3, C6)

Para os contadores com trigger saudável mas janela de corrupção histórica (2026-04-18 a 2026-04-21), execute as audit queries do `drift-report.json` em staging antes de decidir se backfill adicional é necessário.

**Se drift > 0 for encontrado:**

```sql
-- Backfill forçado de C1/C2/C3 (sem mudar triggers — apenas recalcula stored)
UPDATE public.barbershops b
SET
  likes_count    = (SELECT COUNT(*) FROM public.barbershop_interactions bi WHERE bi.barbershop_id = b.id AND bi.type = 'like'),
  dislikes_count = (SELECT COUNT(*) FROM public.barbershop_interactions bi WHERE bi.barbershop_id = b.id AND bi.type = 'dislike'),
  rating_score   = (
    WITH s AS (
      SELECT
        COUNT(*) FILTER (WHERE type = 'like')    AS lk,
        COUNT(*) FILTER (WHERE type = 'dislike') AS dl
      FROM public.barbershop_interactions
      WHERE barbershop_id = b.id
    )
    SELECT CASE WHEN (s.lk + s.dl) = 0 THEN 0.0
           ELSE ROUND((3.0*5 + ((s.lk*5.0 + s.dl*1.0)/(s.lk+s.dl))*(s.lk+s.dl)) / (5+(s.lk+s.dl)), 1)
           END FROM s
  )
WHERE b.is_active = true;

-- Backfill forçado de C6
UPDATE public.professionals p
SET    rating_count = (SELECT COUNT(*) FROM public.professional_likes pl WHERE pl.professional_id = p.id)
WHERE  p.is_active = true;
```

---

## 9. Ordem de execução recomendada

```
Semana 1 — Fixes sem decisão de produto (baixo risco)
  ├─ 20260524000001: Fix C8 (portfolio_images.likes_count) — P0
  ├─ 20260524000002: Fix C10 (stories.views_count) — P0
  ├─ 20260524000003: Fix C14 (haircuts_count atômico) — P2 código BFF
  └─ 20260524000004: Fix C11 (story.likes_count — Opção A ou B) — P2

Semana 2 — Feed e backfill
  ├─ 20260524000005: Fix C12 (feed_items.likes_count) — P1
  ├─ Verificação backfill C1/C2/C3/C6 (audit queries em staging)
  └─ Backfill de C1/C2/C3/C6 se drift > 0

Semana 3+ — Decisão de produto
  ├─ C4/C5/C7: Deprecar ou implementar star-rating
  └─ C9/C13: Criar tabelas de views + triggers + código de aplicação
```

---

## 10. Estratégia de execução sem lock (no-lock)

Todos os backfills acima usam `UPDATE ... WHERE is_active = true` sem `LOCK TABLE`. O PostgreSQL adquire apenas row locks — a tabela permanece acessível para leituras e escritas concorrentes.

**Para tabelas com volume alto (> 100k rows):** executar backfill em batches:

```sql
-- Backfill em batch de 500 para tables grandes
DO $$
DECLARE
  v_last_id uuid := '00000000-0000-0000-0000-000000000000';
  v_rows    integer;
BEGIN
  LOOP
    UPDATE public.portfolio_images pi
    SET    likes_count = (
      SELECT COUNT(*) FROM public.likes l
      WHERE  l.content_id = pi.id AND l.content_type = 'portfolio_image'
    )
    WHERE pi.id > v_last_id
      AND pi.status != 'deleted'
    ORDER BY pi.id
    LIMIT 500
    RETURNING id INTO v_last_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXIT WHEN v_rows = 0;
    PERFORM pg_sleep(0.05); -- 50ms entre batches — respira o banco
  END LOOP;
END;
$$;
```

**Janela recomendada:** Executar backfills durante horário de baixo tráfego (01h-06h local).

---

## 11. Critérios de validação pós-rebuild

Execute estas queries após cada migration. **Resultado esperado: 0 linhas com drift.**

```sql
-- C8: portfolio_images.likes_count
SELECT pi.id, pi.likes_count, COUNT(l.id) AS real_count
FROM public.portfolio_images pi
LEFT JOIN public.likes l ON l.content_id = pi.id AND l.content_type = 'portfolio_image'
WHERE pi.status != 'deleted'
GROUP BY pi.id, pi.likes_count
HAVING pi.likes_count != COUNT(l.id);

-- C10: stories.views_count
SELECT s.id, s.views_count, COUNT(sv.id) AS real_count
FROM public.stories s
LEFT JOIN public.story_views sv ON sv.story_id = s.id
GROUP BY s.id, s.views_count
HAVING s.views_count != COUNT(sv.id);

-- C12: feed_items.likes_count
SELECT fi.id, fi.likes_count, COUNT(l.id) AS real_count
FROM public.feed_items fi
LEFT JOIN public.likes l ON l.content_id = fi.source_id AND l.content_type = fi.source_type
GROUP BY fi.id, fi.likes_count
HAVING fi.likes_count != COUNT(l.id);

-- C1/C2: barbershops.likes_count e dislikes_count
SELECT b.id, b.likes_count, COUNT(bi.id) FILTER (WHERE bi.type='like') AS real_likes
FROM public.barbershops b
LEFT JOIN public.barbershop_interactions bi ON bi.barbershop_id = b.id
WHERE b.is_active = true
GROUP BY b.id, b.likes_count
HAVING b.likes_count != COUNT(bi.id) FILTER (WHERE bi.type='like');
```

---

*Plano gerado após auditoria estática completa. Consultar `docs/db/contadores-audit.md` para análise detalhada e `docs/db/drift-report.json` para queries de auditoria por contador.*
