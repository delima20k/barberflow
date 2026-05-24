# aplicar_desconto_metodo

Assinatura: `public.aplicar_desconto_metodo(uuid, text, timestamptz, timestamptz, numeric) returns void`

Entrada válida: `p_barbershop_id`, `p_metodo` (`credito`, `debito` ou legado `cartao`), período `p_de`/`p_ate` e `p_porcentagem` entre `0` e `100`.

Saída: `null`.

Efeito colateral: atualiza `transactions.amount` usando `gross_amount` para transações pagas do método/período.

Erros esperados: porcentagem fora de faixa, método inválido ou acesso negado devem retornar erro tipado do PostgREST, nunca 500 genérico.
