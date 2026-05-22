# QueueSection

## Responsabilidade
Contrato da fila/cadeiras e dono da ligacao com realtime compartilhado. Os fluxos de cadeira do runtime foram preservados no controlador movido para evitar corte funcional grande no mesmo deploy.

## Estado
`QueueState` guarda `barbershopId`, entradas visiveis e se realtime esta ativo.

## Eventos publicados
`minha-barbearia.queue.changed` e `minha-barbearia.queue.realtime.changed`.

## Eventos consumidos
Nenhum no contrato atual.

## Dependencias
`QueueController` recebe State, View e `QueueRealtimeClient` injetado.

## Riscos e pendencias
Os fluxos completos de cadeira/fila ainda estao preservados no `MinhaBarbeariaRuntimeController`. A extracao funcional deve ser feita em corte menor para nao alterar realtime, polling e modais de atendimento no mesmo deploy.
