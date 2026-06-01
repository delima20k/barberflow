# Contrato: `notificar_barbeiro_chegada`

**Migration:** `20260513000001_notificar_barbeiro_rpc.sql`  
**Camada:** `public` (PostgreSQL RPC via PostgREST)  
**Segurança:** `SECURITY DEFINER`, `GRANT TO authenticated`

---

## Assinatura

```sql
CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
  p_professional_id UUID,
  p_type            TEXT,
  p_title           TEXT,
  p_body            TEXT,
  p_data            JSONB
)
RETURNS void
```

---

## Por que esta RPC existe

O app cliente precisa notificar o barbeiro quando confirma chegada. O INSERT direto em `notifications` violaria o RLS (o cliente só pode inserir notificações para si mesmo). A RPC executa como `postgres` com controle interno.

---

## Input

| Parâmetro            | Tipo    | Obrigatório | Restrições                                 |
|----------------------|---------|-------------|---------------------------------------------|
| `p_professional_id`  | `UUID`  | ✅           | NULL retorna sem erro (noop)                |
| `p_type`             | `TEXT`  | ✅           | Tipo da notificação (ex: `client_arriving`) |
| `p_title`            | `TEXT`  | ✅           | Título exibido                              |
| `p_body`             | `TEXT`  | ✅           | Corpo. NULL → `''`                          |
| `p_data`             | `JSONB` | ✅           | Payload. NULL → `{}`                        |

---

## Output

`void` — sem retorno estruturado.

---

## Efeitos colaterais

- `INSERT` em `public.notifications` se `p_professional_id` não for NULL.
- `body` normalizado: `COALESCE(p_body, '')`.
- `data` normalizado: `COALESCE(p_data, '{}')`.

---

## Segurança

- `p_professional_id IS NULL` → retorna sem inserir (proteção contra NULL traversal).
- O chamador pode passar qualquer `p_title` / `p_body` — validação de conteúdo deve ser feita no cliente ou por trigger na tabela `notifications`.

---

## Snapshot de referência

`db/contracts/snapshots/notificar_barbeiro_chegada.json`
