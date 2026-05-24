# confirmar_presenca_cliente

Assinatura: `public.confirmar_presenca_cliente(uuid, boolean, boolean) returns void`

Entrada válida: `p_entry_id`, `p_confirmado`, `p_grace_used`.

Saída: `null`.

Efeito colateral: atualiza `queue_entries.client_confirmed` e, quando aplicável, insere notificação para o profissional.

Erros esperados: UUID inválido ou tipos errados devem retornar erro tipado do PostgREST, nunca 500 genérico.
