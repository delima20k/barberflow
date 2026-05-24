# Contrato: `buscar_perfis_por_nome`

**Migration:** `20260503000002_modal_rpc_functions.sql`  
**Camada:** `public` (PostgreSQL RPC via PostgREST)  
**Segurança:** `SECURITY DEFINER`, `GRANT TO authenticated`

---

## Assinatura

```sql
CREATE OR REPLACE FUNCTION public.buscar_perfis_por_nome(
  p_termo  TEXT,
  p_limite INT DEFAULT 20
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
```

---

## Por que esta RPC existe

O RLS de `profiles` impede que um profissional veja perfis de outros usuários. Esta RPC executa com permissões de `postgres` (SECURITY DEFINER), permitindo busca por nome no modal de seleção de cliente do app profissional.

---

## Input

| Parâmetro  | Tipo  | Obrigatório | Restrições                  |
|------------|-------|-------------|------------------------------|
| `p_termo`  | `TEXT`| ✅           | Busca por ILIKE `%termo%`    |
| `p_limite` | `INT` | ❌           | Forçado para [1, 50], default 20 |

---

## Output

| Campo          | Tipo          | Descrição                          |
|----------------|---------------|------------------------------------|
| `id`           | `UUID`        | ID do perfil                       |
| `full_name`    | `TEXT`        | Nome completo                      |
| `avatar_path`  | `TEXT`        | Caminho relativo no Storage        |
| `updated_at`   | `TIMESTAMPTZ` | Última atualização                 |

**Campos NÃO retornados:** `email`, `phone`, `role`, dados sensíveis.

---

## Efeitos colaterais

Nenhum — leitura pura.

---

## Snapshot de referência

`db/contracts/snapshots/buscar_perfis_por_nome.json`
