# criar_agendamento_atomico

Assinatura: `public.criar_agendamento_atomico(uuid, uuid, uuid, uuid, timestamptz, int, text, numeric) returns setof public.appointments`

Entrada válida: cliente, profissional, barbearia, serviço, horário, duração, observação opcional e preço opcional.

Saída: linha de `appointments` com exatamente os campos registrados no contrato JSON.

Efeito colateral: insere um agendamento `pending` de forma atômica, usando advisory lock por profissional.

Erros esperados: conflito de agenda retorna `SCHEDULE_CONFLICT`; tipos errados ou campos ausentes retornam erro tipado, nunca 500 genérico.
