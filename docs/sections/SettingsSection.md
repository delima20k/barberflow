# SettingsSection

## Responsabilidade
Contrato de settings, servicos e produtos da MinhaBarbearia. Salvar configuracoes segue preservado no runtime ate a extracao de Location/Status e MediaManager.

## Estado
`SettingsState` encapsula shop, servicos e `changedAt`.

## Eventos publicados
`minha-barbearia.settings.changed` em toda atualizacao.

## Eventos consumidos
Nenhum no contrato atual. Settings nao toca Agenda, Notification ou outras secoes diretamente.

## Dependencias
State e View injetados. A View limita o DOM a `[data-minha-barbearia-settings-section]`.

## Riscos e pendencias
Salvar configuracoes, midia, status e localizacao continuam no `MinhaBarbeariaRuntimeController` ate cortes dedicados. Mudancas de Settings devem sair por `SettingsChanged`.
