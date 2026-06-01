# Contrato: `search_users`

**Migration:** `20260503000003_search_indexes_and_rpc.sql`  
**Camada:** `public` (PostgreSQL RPC via PostgREST)  
**Segurança:** `SECURITY DEFINER`, `GRANT TO authenticated`

---

## Assinatura

```sql
CREATE OR REPLACE FUNCTION public.search_users(
  p_term   TEXT    DEFAULT NULL,
  p_role   TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  full_name       TEXT,
  email           TEXT,
  role            TEXT,
  avatar_path     TEXT,
  barbershop_name TEXT,
  updated_at      TIMESTAMPTZ,
  total_count     BIGINT
)
```

---

## Por que esta RPC existe

Busca unificada em `profiles` + `barbershops` em uma única query parametrizada. Todos os filtros são parâmetros do planner — zero concatenação de string, zero SQL injection. Inclui `total_count` via window function para paginação sem round-trip extra.

---

## Input

| Parâmetro  | Tipo      | Default | Restrições                           |
|------------|-----------|---------|--------------------------------------|
| `p_term`   | `TEXT`    | NULL    | NULL = sem filtro de texto           |
| `p_role`   | `TEXT`    | NULL    | `'client'`, `'professional'` ou NULL |
| `p_limit`  | `INTEGER` | 20      | Forçado para [1, 50]                 |
| `p_offset` | `INTEGER` | 0       | Forçado para ≥ 0                     |

---

## Output

| Campo              | Tipo          | Descrição                                |
|--------------------|---------------|------------------------------------------|
| `id`               | `UUID`        | ID do perfil                             |
| `full_name`        | `TEXT`        | Nome completo                            |
| `email`            | `TEXT`        | Email do perfil                          |
| `role`             | `TEXT`        | Role: `client` ou `professional`         |
| `avatar_path`      | `TEXT`        | Caminho relativo no Storage              |
| `barbershop_name`  | `TEXT`        | Nome da barbearia (NULL se não tiver)    |
| `updated_at`       | `TIMESTAMPTZ` | Última atualização do perfil             |
| `total_count`      | `BIGINT`      | Total de resultados antes do LIMIT/OFFSET |

---

## Campos NÃO retornados (intencionalmente)

`phone`, `is_active`, `created_at`, `location`, dados sensíveis.

---

## Efeitos colaterais

Nenhum — função STABLE (leitura pura).

---

## Erros

Nenhum erro tipado. Resultado vazio se nenhum perfil ativo corresponder.

---

## Exemplo de chamada (JS)

```js
const { data, error } = await ApiService.rpc('search_users', {
  p_term:   'João',
  p_role:   'professional',
  p_limit:  10,
  p_offset: 0,
});
// data[0].total_count → total para paginação
// data → array de perfis
```

---

## Snapshot de referência

`db/contracts/snapshots/search_users.json`
