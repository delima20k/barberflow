# StorySection

## Responsabilidade
Contrato de extracao de stories da MinhaBarbearia: estado de cards ativos, quota diaria e ponte de midia injetada. O upload continua no runtime legado ate o corte do MediaManager; a secao nao duplica `MediaP2P`.

## Estado
`StoryState` guarda `stories`, `quotaHoje`, `shop` e `perfilId` em snapshots copiados.

## Eventos publicados
`minha-barbearia.story.changed`.

## Eventos consumidos
Nenhum no contrato atual.

## Dependencias
`StoryController` recebe State, View e `mediaAdapter`. A View toca somente a regiao opcional `[data-minha-barbearia-story-section]`.

## Riscos e pendencias
O upload e a renderizacao visual de stories seguem no `MinhaBarbeariaRuntimeController` ate o corte do MediaManager. Esta secao registra o contrato sem duplicar `MediaP2P`.
