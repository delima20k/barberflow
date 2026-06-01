# PortfolioSection

## Responsabilidade
Placeholder controlado para portfolio. O diagnostico comprovou que o god-file atual nao possui funcoes de portfolio para mover.

## Estado
`PortfolioState` guarda itens e o nome da dependencia de midia futura, sem compartilhar upload com Story.

## Eventos publicados
`minha-barbearia.portfolio.changed`.

## Eventos consumidos
Nenhum no contrato atual.

## Dependencias
State e View injetados. A resolucao da midia fica marcada para o MediaManager.

## Riscos e pendencias
O god-file mapeado nao possui fluxo dedicado de portfolio para migrar agora. A dependencia de midia deve ser resolvida junto com Story no prompt futuro do MediaManager.
