# search_users

Assinatura: `public.search_users(text, text, integer, integer) returns table`

Entrada válida: `p_term`, `p_role`, `p_limit`, `p_offset`.

Saída: lista paginada com `id`, `full_name`, `email`, `role`, `avatar_path`, `barbershop_name`, `updated_at` e `total_count`.

Efeito colateral: nenhum.

Erros esperados: tipos errados em `p_limit`/`p_offset` retornam erro tipado, nunca 500 genérico.
