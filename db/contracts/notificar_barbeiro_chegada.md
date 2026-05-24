# notificar_barbeiro_chegada

Assinatura: `public.notificar_barbeiro_chegada(uuid, text, text, text, jsonb) returns void`

Entrada válida: profissional, tipo, título, corpo e `data` JSONB.

Saída: `null`.

Efeito colateral: insere uma linha em `notifications` para o profissional.

Erros esperados: tipos errados devem retornar erro tipado; `p_professional_id` nulo é idempotente.
