# Fase 2 - Grafo de modulos MinhaBarbearia

Data: 2026-05-23.

## Entry-points

| Entry | Tipo | Tamanho |
|---|---|---:|
| `apps/profissional/assets/js/app.js` | `<script type="module">` | 3.8 KB |
| `apps/profissional/assets/js/pages/MinhaBarbeariaPage.js` | importado pelo app | 333 B |
| `MinhaBarbeariaRuntimeController.js` | orquestrador de MinhaBarbearia | 109.6 KB |

## Sections

| Section | Entry-point | Tamanho total |
|---|---|---:|
| Agenda | `AgendaSection/index.js` | 4.4 KB |
| Analytics | `AnalyticsSection/index.js` | 2.7 KB |
| Notification | `NotificationSection/index.js` | 3.7 KB |
| Queue | `QueueSection/index.js` | 3.4 KB |
| Settings | `SettingsSection/index.js` | 2.8 KB |
| Story | `StorySection/index.js` | 3.1 KB |
| Portfolio | `PortfolioSection/index.js` | 2.5 KB |

## Grafo resumido

```txt
app.js
  -> MinhaBarbeariaPage.js
    -> MinhaBarbeariaRuntimeController.js
      -> events/catalog.js
      -> shared/js/SectionEventBus.js
      -> AgendaSection/index.js
      -> AnalyticsSection/index.js
      -> NotificationSection/index.js
      -> QueueSection/index.js
      -> SettingsSection/index.js
      -> QueueRealtimeClient.js
      -> import('./StorySection/index.js')       lazy
      -> import('./PortfolioSection/index.js')   lazy
```

`PageSection.js` e importado pelas classes `<Section>Section.js`. Controllers importam `SectionEventCatalog`. Nao ha ciclos no grafo local validado por teste.

## Compatibilidade de browser

Fallback `nomodule` nao foi adicionado. O audit nao apontou requisito de suporte a browser sem ES modules, e o app ja depende de APIs modernas como classes privadas, `MutationObserver`, Realtime e PWA.

## Riscos para Fase 3

- O app root ainda consome muitos globals legados; isso esta documentado em `/docs/globals-allowlist.md`.
- Sem bundler, imports dinamicos seguem baixando arquivos individuais e nao chunks otimizados.
- `MinhaBarbeariaRuntimeController.js` continua grande; a reducao real de parse/execute depende da continuidade do strangler por dominio.
- Node emite aviso `MODULE_TYPELESS_PACKAGE_JSON` em testes por `package.json` ainda nao declarar `"type": "module"`; nao altera comportamento no browser.
