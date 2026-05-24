# buscar_perfis_por_nome

Assinatura: `public.buscar_perfis_por_nome(text, int) returns table`

Entrada válida: `p_termo` e `p_limite` entre 1 e 50.

Saída: lista de perfis mínimos com `id`, `full_name`, `avatar_path` e `updated_at`.

Efeito colateral: nenhum.

Erros esperados: limite com tipo inválido retorna erro tipado, nunca 500 genérico.
