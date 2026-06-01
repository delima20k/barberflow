# StorySection

## Responsabilidade
Contrato de extracao de stories da MinhaBarbearia: estado de cards ativos, quota diaria e ponte de midia injetada. O runtime usa `StoryBrowserMediaAdapter` como adapter browser para encapsular `MediaP2P` ate o corte completo do MediaManager.

## Estado
`StoryState` guarda `stories`, `quotaHoje`, `shop` e `perfilId` em snapshots copiados.

## Eventos publicados
`minha-barbearia.story.changed`.

## Eventos consumidos
Nenhum no contrato atual.

## Dependencias
`StoryController` recebe State, View e `mediaAdapter`. A View toca somente a regiao opcional `[data-minha-barbearia-story-section]`. O adapter browser recebe `MediaP2P` por injecao.

## Riscos e pendencias
O upload de Story ja passa pelo adapter browser, mas ainda usa `MediaP2P` por baixo. O proximo corte e trocar esse adapter pelo pipeline BFF/isomorfico sem mudar o contrato da section.
