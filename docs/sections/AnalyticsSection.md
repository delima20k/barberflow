# AnalyticsSection

## Responsabilidade
Placeholder de analytics desacoplado. Nao existia bloco dedicado no god-file; ele registra apenas eventos de secoes.

## Estado
`AnalyticsState` mantem a lista local de eventos observados.

## Eventos publicados
Nenhum no contrato atual.

## Eventos consumidos
Consome mudancas de Settings, Story, Portfolio, Notification e Queue via EventBus. Nao chama secoes diretamente.

## Dependencias
State e View injetados. A View renderiza somente metadado na regiao opcional de analytics.

## Riscos e pendencias
Nao havia bloco dedicado de analytics no god-file. A secao registra telemetria de eventos e deve evoluir quando os indicadores reais forem separados do runtime.
