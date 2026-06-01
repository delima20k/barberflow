# NotificationSection

## Responsabilidade
Contrato de notificacoes da pagina e destino para o fluxo de push pendente hoje ainda executado pelo runtime migrado.

## Estado
`NotificationState` guarda notificacoes pendentes, revisao de settings e estado observado do realtime.

## Eventos publicados
`minha-barbearia.notification.changed`.

## Eventos consumidos
`minha-barbearia.settings.changed` e `minha-barbearia.queue.realtime.changed`.

## Dependencias
Recebe `QueueRealtimeClient` compartilhado com Queue, State e View. O cliente evita duas implementacoes de polling/realtime na proxima etapa do strangler.

## Riscos e pendencias
O processamento detalhado de push/modal ainda permanece no `MinhaBarbeariaRuntimeController` para preservar comportamento. A proxima etapa deve mover esse fluxo para a secao usando o cliente compartilhado.
