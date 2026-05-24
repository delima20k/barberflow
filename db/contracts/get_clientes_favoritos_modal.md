# get_clientes_favoritos_modal

Assinatura: `public.get_clientes_favoritos_modal(uuid, uuid) returns table`

Entrada válida: `p_barbershop_id` e `p_professional_id`.

Saída: lista de clientes que favoritaram o profissional, com `id`, `full_name`, `email`, `avatar_path` e `updated_at`.

Efeito colateral: nenhum.

Erros esperados: UUID inválido deve retornar erro tipado, nunca 500 genérico.
