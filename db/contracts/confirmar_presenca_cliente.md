# Contrato: `confirmar_presenca_cliente`

**Migration:** `20260507000003_queue_client_confirmation.sql`  
**Camada:** `public` (PostgreSQL RPC via PostgREST)  
**Segurança:** `SECURITY DEFINER`, `GRANT TO authenticated`

---

## Assinatura

```sql
CREATE OR REPLACE FUNCTION public.confirmar_presenca_cliente(
  p_entry_id   UUID,
  p_confirmado BOOLEAN,
  p_grace_used BOOLEAN
)
RETURNS void
```

---

## Por que esta RPC existe

O cliente que entra em `in_service` precisa confirmar fisicamente que está presente na barbearia. A RPC gerencia a máquina de estados `client_confirmed` com idempotência e, no segundo "Não" (grace expirado), insere automaticamente uma notificação para o barbeiro. O `SECURITY DEFINER` é necessário porque inserir notificações para outro usuário violaria o RLS padrão.

---

## Máquina de estados `client_confirmed`

```
NULL → (p_confirmado=true)  → 'yes'
NULL → (p_confirmado=false, p_grace_used=false) → 'no_waiting'
'no_waiting' → (p_confirmado=false, p_grace_used=true) → 'absent'
```

---

## Input

| Parâmetro      | Tipo      | Obrigatório | Restrições                           |
|----------------|-----------|-------------|--------------------------------------|
| `p_entry_id`   | `UUID`    | ✅           | Deve pertencer ao `auth.uid()`       |
| `p_confirmado` | `BOOLEAN` | ✅           | true = presente, false = ausente     |
| `p_grace_used` | `BOOLEAN` | ✅           | true = 2º não (grace de 5min venceu) |

---

## Output

`void` — sem retorno estruturado.

---

## Efeitos colaterais

| Cenário                         | Efeito                                                                     |
|---------------------------------|----------------------------------------------------------------------------|
| `p_confirmado = true`           | `queue_entries SET client_confirmed='yes'`                                 |
| Primeiro "Não"                  | `queue_entries SET client_confirmed='no_waiting', first_no_at=NOW()`       |
| Segundo "Não" (grace expirado)  | `queue_entries SET client_confirmed='absent'` + `INSERT notifications(type='client_absent')` |

---

## Segurança

- Se `p_entry_id` não pertencer ao chamador ou não estiver em `status='in_service'`, a função retorna silenciosamente sem erro.
- A verificação de propriedade usa `qe.client_id = auth.uid()`.

---

## Erros

Nenhum erro lançado — a função é idempotente e silenciosa em caso de entrada inválida.

---

## Exemplo de chamada (JS)

```js
// Cliente confirma presença
await ApiService.rpc('confirmar_presenca_cliente', {
  p_entry_id:   minhaEntrada.id,
  p_confirmado: true,
  p_grace_used: false,
});

// Cliente diz "Não" (primeiro)
await ApiService.rpc('confirmar_presenca_cliente', {
  p_entry_id:   minhaEntrada.id,
  p_confirmado: false,
  p_grace_used: false,
});
```

---

## Snapshot de referência

`db/contracts/snapshots/confirmar_presenca_cliente.json`
