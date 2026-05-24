# Contrato: `get_clientes_favoritos_modal`

**Migration:** `20260503000002_modal_rpc_functions.sql` → última redefinição: `20260507000002_restaurar_favoritos_barbearia_modal.sql`  
**Camada:** `public` (PostgreSQL RPC via PostgREST)  
**Segurança:** `SECURITY DEFINER`, `GRANT TO authenticated`  
**Language:** `sql` (reescrita em 20260507 de plpgsql para sql/STABLE)

---

## Assinatura

```sql
CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
  p_barbershop_id   UUID,
  p_professional_id UUID
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  email       TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
```

---

## Por que esta RPC existe

O modal de cadeira (in_service) precisa mostrar quem favoritou **esta barbearia** OU **este barbeiro específico**. O RLS impede acesso cruzado de dados de outros usuários, então a RPC executa como `postgres`.

---

## Fontes de dados (UNION)

```
barbershop_interactions WHERE type='favorite' AND barbershop_id=$1
  UNION
favorite_professionals WHERE professional_id=$2
```

Os resultados são `DISTINCT` por `profiles.id`.

---

## Diferença para `get_clientes_favoritos_barbearia`

| RPC                                 | Escopo                                        | Usado em          |
|-------------------------------------|-----------------------------------------------|-------------------|
| `get_clientes_favoritos_modal`      | Barbearia OU barbeiro **específico**          | Modal de cadeira  |
| `get_clientes_favoritos_barbearia`  | Barbearia OU **qualquer barbeiro** vinculado  | Mslm-card / mensalistas |

---

## Output

| Campo          | Tipo          |
|----------------|---------------|
| `id`           | `UUID`        |
| `full_name`    | `TEXT`        |
| `email`        | `TEXT`        |
| `avatar_path`  | `TEXT`        |
| `updated_at`   | `TIMESTAMPTZ` |

---

## Snapshot de referência

`db/contracts/snapshots/get_clientes_favoritos_modal.json`
