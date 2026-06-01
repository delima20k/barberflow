# Contrato: `get_clientes_favoritos_barbearia`

**Migration:** `20260520000001_get_clientes_favoritos_barbearia.sql`  
**Camada:** `public` (PostgreSQL RPC via PostgREST)  
**Segurança:** `SECURITY DEFINER`, `GRANT TO authenticated`

---

## Assinatura

```sql
CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_barbearia(
  p_barbershop_id UUID
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  email       TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
```

---

## Por que esta RPC existe

Para o plano mensalista, a barbearia precisa listar todos os clientes elegíveis — aqueles que favoritaram a barbearia diretamente OU qualquer barbeiro ativo vinculado. A union com `professional_shop_links` garante que clientes fiéis a barbeiros específicos sejam incluídos.

---

## Fontes de dados (UNION)

```sql
-- Favoritos diretos da barbearia
barbershop_interactions WHERE type='favorite' AND barbershop_id=$1

UNION

-- Favoritos de barbeiros vinculados
favorite_professionals
  JOIN professional_shop_links ON professional_id=fp.professional_id
  WHERE barbershop_id=$1 AND is_active=true
```

Resultado `DISTINCT` ordenado por `full_name`.

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

## Efeitos colaterais

Nenhum — função STABLE (leitura pura).

---

## Snapshot de referência

`db/contracts/snapshots/get_clientes_favoritos_barbearia.json`
