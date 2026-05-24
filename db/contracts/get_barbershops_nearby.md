# get_barbershops_nearby

Assinatura: `public.get_barbershops_nearby(double precision, double precision, double precision, int) returns table`

Entrada válida: `lat`, `lng`, `raio_metros`, `limit_val`.

Saída: lista ordenada por `distancia_m`, com os campos públicos de barbearia definidos em `rpc-contracts.json`.

Efeito colateral: nenhum.

Erros esperados: coordenadas com tipo inválido devem retornar erro tipado, nunca 500 genérico.
