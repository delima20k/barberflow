# Contrato: `criar_agendamento_atomico`

**Migration:** `20260516000003_atomic_appointment_rpc.sql`  
**Camada:** `public` (PostgreSQL RPC via PostgREST)  
**Segurança:** `SECURITY DEFINER`, `GRANT TO authenticated`

---

## Assinatura

```sql
CREATE OR REPLACE FUNCTION public.criar_agendamento_atomico(
  p_client_id       UUID,
  p_professional_id UUID,
  p_barbershop_id   UUID,
  p_service_id      UUID,
  p_scheduled_at    TIMESTAMPTZ,
  p_duration_min    INT,
  p_notes           TEXT    DEFAULT NULL,
  p_price_charged   NUMERIC DEFAULT NULL
)
RETURNS SETOF public.appointments
```

---

## Por que esta RPC existe

A criação de agendamentos feita diretamente via INSERT + SELECT separados cria uma janela de race condition: dois clientes simultâneos passam na verificação e geram double-booking. Esta RPC serializa a criação com `pg_advisory_xact_lock` por `professional_id`, garantindo que a verificação e o insert ocorrem na mesma transação atômica.

---

## Input

| Parâmetro         | Tipo        | Obrigatório | Restrições            |
|-------------------|-------------|-------------|------------------------|
| `p_client_id`     | `UUID`      | ✅           | Usuário autenticado    |
| `p_professional_id` | `UUID`    | ✅           | Profissional ativo     |
| `p_barbershop_id` | `UUID`      | ✅           | Barbearia ativa        |
| `p_service_id`    | `UUID`      | ✅           | Serviço ativo          |
| `p_scheduled_at`  | `TIMESTAMPTZ` | ✅        | Data futura            |
| `p_duration_min`  | `INT`       | ✅           | > 0                    |
| `p_notes`         | `TEXT`      | ❌           | Livre, pode ser NULL   |
| `p_price_charged` | `NUMERIC`   | ❌           | Pode ser NULL          |

---

## Output

Retorna `SETOF public.appointments` (1 linha após insert bem-sucedido).

| Campo              | Tipo          |
|--------------------|---------------|
| `id`               | `UUID`        |
| `client_id`        | `UUID`        |
| `professional_id`  | `UUID`        |
| `barbershop_id`    | `UUID`        |
| `service_id`       | `UUID`        |
| `scheduled_at`     | `TIMESTAMPTZ` |
| `duration_min`     | `INT`         |
| `status`           | `TEXT`        |
| `price_charged`    | `NUMERIC`     |
| `notes`            | `TEXT`        |
| `created_at`       | `TIMESTAMPTZ` |
| `updated_at`       | `TIMESTAMPTZ` |

---

## Efeitos colaterais

- `INSERT` em `public.appointments` com `status = 'pending'`
- `pg_advisory_xact_lock` liberado no commit/rollback

---

## Erros

| SQLSTATE | Mensagem          | HTTP | Condição                                      |
|----------|-------------------|------|-----------------------------------------------|
| `P0001`  | `SCHEDULE_CONFLICT` | 409 | Sobreposição de horário com outro agendamento |

---

## Exemplo de chamada (JS via ApiService)

```js
const { data, error } = await ApiService.rpc('criar_agendamento_atomico', {
  p_client_id:       usuario.id,
  p_professional_id: profissional.id,
  p_barbershop_id:   barbearia.id,
  p_service_id:      servico.id,
  p_scheduled_at:    '2026-06-01T10:00:00Z',
  p_duration_min:    30,
});
// data → array com 1 appointment
// error.code === 'P0001' → SCHEDULE_CONFLICT → exibir msg ao usuário
```

---

## Snapshot de referência

`db/contracts/snapshots/criar_agendamento_atomico.json`

---

## Como atualizar este contrato

1. Modificar a function na migration
2. Executar `node scripts/db-snapshot.js`
3. Atualizar `db/contracts/snapshots/criar_agendamento_atomico.json`
4. Atualizar este arquivo `.md`
5. Rodar `npm test` — os testes de contrato devem passar
