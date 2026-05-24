# cleanup_expired_story_comments

Assinatura: `public.cleanup_expired_story_comments() returns table`

Entrada válida: sem argumentos.

Saída: objeto com `cleaned_count` e `cleaned_at`.

Efeito colateral: remove comentários expirados de stories.

Erros esperados: a chamada sem argumentos deve ser idempotente; falhas devem retornar erro tipado, nunca 500 genérico.
