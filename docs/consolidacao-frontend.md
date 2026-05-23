# Consolidacao frontend - god-file, scripts e MediaManager

Data: 2026-05-23.

Escopo: auditoria cruzada sem refatoracao. Fontes verificadas: `/docs/godfile-minhabarbearia.md`, `/docs/scripts-audit.md`, `/docs/mediamanager-audit.md`, `/docs/sections/*.md`, `/docs/perf/fase-*`, `apps/profissional/assets/js/pages/MinhaBarbeariaPage*`, `shared/js/SectionEventCatalog.js`, `shared/js/SectionEventBus.js`, `src/media/*` e `src/services/MediaManager.js`.

## 1. Mapa final da MinhaBarbeariaPage

| Area | Status atual | Eventos | Dependencias de service |
|---|---|---|---|
| `MinhaBarbeariaPage.js` | Shell de 13 linhas; delega tudo para `MinhaBarbeariaRuntimeController`. | Nenhum direto. | `MinhaBarbeariaRuntimeController`. |
| `MinhaBarbeariaRuntimeController.js` | Runtime legado/orquestrador com 2662 linhas. Ainda concentra DOM, dados, settings, GPS, fila, notificacoes, upload de stories e produtos. | Instancia `SectionEventBus`, atualiza sections, carrega Story/Portfolio via `import()`. | Globals legados: `SupabaseService`, `AuthService`, `BarbershopRepository`, `CadeiraService`, `NotificationService`, `StatusFechamentoModal`, `MediaP2P`, `GpsPanelMap`, `GuardaIten`, `DigText`, `ApiService`, `LoggerService`. |
| `AgendaSection` | Shim isolado com `Controller/State/View`. | Publica `minha-barbearia.agenda.ready`; consome `minha-barbearia.settings.changed`. | State/View injetados. |
| `SettingsSection` | Section isolada para snapshot de shop/servicos/settings. Salvamento real ainda fica no runtime. | Publica `minha-barbearia.settings.changed`. | State/View injetados. |
| `NotificationSection` | Section isolada para estado de notificacoes/realtime. Fluxo completo de push/modal ainda fica no runtime. | Publica `minha-barbearia.notification.changed`; consome `settings.changed` e `queue.realtime.changed`. | `QueueRealtimeClient` injetado. |
| `QueueSection` | Section isolada para fila/realtime. Fluxos completos de cadeira/fila ainda ficam no runtime. | Publica `minha-barbearia.queue.changed` e `minha-barbearia.queue.realtime.changed`. | `QueueRealtimeClient` injetado. |
| `AnalyticsSection` | Section observadora de eventos, sem chamada direta a outras sections. | Consome `agenda.ready`, `settings.changed`, `story.changed`, `portfolio.changed`, `notification.changed`, `queue.changed`. | State/View injetados. |
| `StorySection` | Lazy section com contrato de stories. Upload real passa por adapter browser injetado. | Publica `minha-barbearia.story.changed`. | Recebe `StoryBrowserMediaAdapter`, que encapsula `MediaP2P` ate o corte completo do pipeline. |
| `PortfolioSection` | Lazy placeholder; god-file nao tinha fluxo dedicado de portfolio para mover. | Publica `minha-barbearia.portfolio.changed`. | State/View injetados; adapter real ainda nao conectado. |

Catalogo atual em `shared/js/SectionEventCatalog.js`: `AGENDA_READY`, `SETTINGS_CHANGED`, `STORY_CHANGED`, `PORTFOLIO_CHANGED`, `NOTIFICATION_CHANGED`, `QUEUE_CHANGED`, `QUEUE_REALTIME_CHANGED`.

## 2. Sections isoladas

Status observado:

| Regra | Resultado |
|---|---|
| Nenhuma section importa outra direto | Atendido dentro das pastas de section. Controllers importam apenas `SectionEventCatalog`; classes `*Section` importam `PageSection`. O runtime importa/instancia sections como orquestrador. |
| Comunicacao cruzada via EventBus | Atendido para as sections extraidas. `SectionEventBus` valida catalogo em dev e entrega por `on/emit`. |
| Settings emite eventos sem tocar estado alheio | Atendido na section: `SettingsController.update()` emite `SETTINGS_CHANGED`. `AgendaController`, `NotificationController` e `AnalyticsController` reagem por assinatura. |
| Fluxos legados fora das sections | Ainda pendente. Runtime continua tocando estado/DOM de fila, notificacoes, settings, GPS, midia e servicos diretamente. |

Eventos orfaos no catalogo:

| Evento | Publisher | Consumer | Status |
|---|---|---|---|
| `minha-barbearia.agenda.ready` | `AgendaController` | `AnalyticsController` | OK |
| `minha-barbearia.settings.changed` | `SettingsController` | `AgendaController`, `NotificationController`, `AnalyticsController` | OK |
| `minha-barbearia.story.changed` | `StoryController` | `AnalyticsController` | OK |
| `minha-barbearia.portfolio.changed` | `PortfolioController` | `AnalyticsController` | OK |
| `minha-barbearia.notification.changed` | `NotificationController` | `AnalyticsController` | OK |
| `minha-barbearia.queue.changed` | `QueueController` | `AnalyticsController` | OK |
| `minha-barbearia.queue.realtime.changed` | `QueueController` | `NotificationController` | OK |

## 3. Pipeline de midia

Classes novas existem em `src/media`: `MediaUploadService`, `MediaValidator`, `ImageCompressionService`, `VideoProcessor`, `MediaPreviewRenderer`, `StoryMediaAdapter`, `PortfolioMediaAdapter`, strategies e erros tipados. `MediaManager` virou fachada parcial e delega `gerarUrlPresigned()` e `confirmarUpload()`.

Status de consistencia:

| Regra | Resultado atual | Acao humana antes de concluir |
|---|---|---|
| Story usa adapter dedicado | Parcialmente atendido. `MinhaBarbeariaRuntimeController` usa `StoryBrowserMediaAdapter` e nao chama mais `MediaP2P` cru no fluxo de Story; o adapter ainda encapsula `MediaP2P` por compatibilidade browser. | Definir contrato browser/BFF final para substituir o adapter browser por `StoryMediaAdapter` canonico/isomorfico. |
| Portfolio usa apenas `PortfolioMediaAdapter` | Nao atendido em runtime. `PortfolioSection` e placeholder e nao injeta adapter. | Confirmar se portfolio volta ao produto agora ou se permanece placeholder. |
| Nenhum consumidor chama services crus pulando adapters | Nao atendido para legado. Runtime usa `MediaP2P` e upload direto em `SupabaseService.storageBarbershops()` para imagens de servicos. Backend `MediaController` ainda usa `MediaManager` fachada. | Definir ordem de migracao: Story, produtos/servicos, avatar/barbershop image, portfolio. |
| Services de midia nao tocam DOM | Atendido em `src/media`; `MediaPreviewRenderer` e o unico renderer. | Garantir que consumidores frontend passem elemento alvo ao renderer ao migrar. |
| Transcode de video | Parcial. `VideoProcessor.enqueueTranscode()` registra TODO quando nao ha worker/fila conectada. | Decidir se integra com pipeline/worker existente ou adia transcode para fase posterior. |

Duplicacao remanescente entre adapters:

- `StoryMediaAdapter` e `PortfolioMediaAdapter` compartilham validacao, compressao e upload por injecao, mas ainda ha regras de formato/metadata parecidas nos dois.
- A duplicacao so deve ser extraida depois de migrar consumidores reais; hoje uma abstracao a mais seria especulativa.

## 4. Performance pos-Fase 3

Medicao real de Lighthouse:

| Ambiente | Mobile | Desktop | Status |
|---|---|---|---|
| Baseline original | `docs/perf/baseline/lighthouse-mobile-not-run.json` | `docs/perf/baseline/lighthouse-desktop-not-run.json` | Nao executado: Lighthouse/Chrome indisponiveis. |
| Fase 3 | `docs/perf/fase-3/lighthouse-local-not-run.json` | `docs/perf/fase-3/lighthouse-local-not-run.json` | Nao executado: Chrome/Edge indisponiveis no PATH. |

Nao ha numeros finais confiaveis de LCP, INP, CLS ou TBT no repositorio. A consolidacao nao inventa metricas sinteticas.

Comparacao estatica disponivel:

| Metrica | Baseline original | Pos-Fase 1/3 observado |
|---|---:|---:|
| Scripts auditados | 252 tags, 171 scripts unicos | Scripts externos dos dois HTMLs com `defer`; app profissional usa `type="module"` no boot. |
| Scripts externos blocking | 252 no audit original | 0 externos blocking conforme HTML atual; permanece script inline pequeno no final do profissional. |
| JS total baseline se ambos HTMLs carregassem tudo | 2517,8 KB | Vite canario empacota apenas ilha module; fallback classico ainda carrega muitos scripts. |
| Gzip estimado baseline | 692,2 KB | Chunk app Vite: 16,82 KB gzip; sections entre 0,69 e 1,57 KB gzip cada. |
| Lazy real por section | n/a | Story e Portfolio via `import()`; demais sections estaticas. |
| CSS pesado | Fora do foco do audit inicial | `map-panel-*.css` com 176,61 KB, 31,88 KB gzip. |

Metas registradas, ainda nao comprovadas em medicao real:

| Vital | Meta |
|---|---:|
| LCP mobile | < 2,5 s |
| INP | < 200 ms |
| TBT mobile | < 500 ms |
| TBT desktop | < 200 ms |
| CLS | precisa baseline real; alvo recomendado <= 0,1 |

## 5. Debitos tecnicos remanescentes priorizados

| Prioridade | Debito | Evidencia | Estimativa |
|---:|---|---|---|
| P0 | Lighthouse final indisponivel | Artefatos `*-not-run.json`; sem Chrome/Lighthouse local. | 0,5 dia para configurar CI/Chrome + salvar JSON; mais 0,5 dia para interpretar. |
| P0 | Story ainda usa adapter browser sobre `MediaP2P` | Runtime nao chama mais `MediaP2P` cru para Story, mas o adapter browser ainda depende do contrato antigo. | 1-2 dias para tornar `StoryMediaAdapter` canonico/isomorfico e trocar o contrato BFF. |
| P0 | Produtos/servicos pulam pipeline de midia | `#salvarProdutoUnico()` usa `SupabaseService.storageBarbershops().upload()` direto. | 1-2 dias para adapter/servico de item ou reutilizacao controlada do `PortfolioMediaAdapter`. |
| P1 | Runtime legado ainda e god-file real | `MinhaBarbeariaRuntimeController.js` tem 2662 linhas. | 5-8 dias em cortes pequenos: GPS/Location, Status, Produtos, Push, Cadeiras/Fila. |
| P1 | Portfolio e placeholder | Docs indicam ausencia de fluxo dedicado no god-file; adapter existe sem consumidor real. | Decisao de produto + 1-3 dias se reativar. |
| P1 | Globals sobreviveram no app profissional | `/docs/globals-allowlist.md` lista Router, Auth, Pages, SupabaseService, MediaP2P e outros. | 3-6 dias para converter services/pages principais para modules. |
| P1 | Vendor fora do pipeline | Supabase local e Leaflet CDN ainda no HTML classico/fallback. | 1-3 dias apos conversao de `SupabaseService`, `MapWidget` e GPS. |
| P2 | CSS pesado fora do split fino | `map-panel-*.css` domina bytes da Fase 3. | 1-2 dias com validacao visual. |
| P2 | Cobertura funcional visual/browser | Testes unitarios existem; fluxos reais login/agenda/story/queue/settings pedem smoke em browser. | 1-2 dias para Playwright/browser ou checklist manual assistido. |

Sections sem cobertura adequada:

| Section | Cobertura atual | Gap |
|---|---|---|
| Agenda | Unit + EventBus basico. | Reacao real do app Agenda fora do shim. |
| Settings | Unit/EventBus em `minha-barbearia-extracted-sections.test.js`. | Salvamento real ainda no runtime, nao na section. |
| Notification | EventBus com SettingsChanged. | Push/modal/realtime real ainda no runtime. |
| Queue | State/controller basico. | Fluxos de cadeira, polling e realtime real ainda no runtime. |
| Analytics | Unit de observer/eventos. | Indicadores reais ainda nao existem como section. |
| Story | Contrato/lazy section. | Upload real por adapter nao coberto em runtime. |
| Portfolio | Placeholder. | Sem fluxo funcional de produto. |

## 6. Riscos conhecidos

| Risco | Onde aparece | Mitigacao exigida |
|---|---|---|
| EventBus virar gargalo silencioso | `SectionEventBus.emit()` executa handlers sincronos em ordem de registro. Um handler lento bloqueia os demais. | Instrumentar tempo por handler, capturar erro por subscriber e considerar fila/microtask para eventos pesados. |
| Eventos de alta frequencia poluirem analytics | `AnalyticsController` grava cada evento recebido em estado local. | Definir allowlist/limite de buffer e amostragem antes de eventos frequentes de fila. |
| Lazy loading quebrar UX | Story e Portfolio carregam chunk no clique. Em rede lenta, o usuario pode clicar e esperar sem feedback se o runtime nao exibir loading especifico. | Preload no idle para chunks provaveis ou indicador visual no botao acionador. |
| Contrato de upload Story divergir | `MediaP2P` ainda usa corpo `context/confirmationToken`, enquanto backend legado usa `contexto/token`. | Congelar contrato BFF antes de migrar `StoryMediaAdapter` para browser/runtime. |
| Adapter duplicar regra de metadata | Story/Portfolio ainda podem divergir em metadata final se migrados separadamente. | Criar schema de metadata por contexto no `MediaValidator` antes de liberar producao. |
| Vendor classico mascarar ganho do Vite | HTML ainda carrega fallback e globals. | Promocao canaria com budget real e remocao gradual dos scripts classicos por pagina. |
| CSS split causar FOUC | CSS estrutural segue global/blocking. | Teste visual antes de preload/media swap. |

## 7. Monitoramento das 2 primeiras semanas pos-deploy

Metricas obrigatorias:

| Area | Metrica | Fonte sugerida |
|---|---|---|
| Boot frontend | `DOMContentLoaded -> AppBootstrap.init`, erro JS por release, taxa de tela branca. | RUM/log frontend. |
| Web vitals | LCP, INP, CLS, TBT/lab, FCP. | Lighthouse CI + RUM. |
| Lazy chunks | Tempo ate carregar Story/Portfolio, falha de `import()`, primeira acao apos clique. | Evento customizado no loader de section. |
| EventBus | Quantidade de listeners, tempo medio por evento, exceptions por handler. | Instrumentacao no `SectionEventBus`. |
| Midia | Tempo por etapa, bytes antes/depois, falha por tipo, abortos, retry, erro de validacao. | `MediaTelemetry` + logs BFF. |
| Upload | Taxa de sucesso em story/produto/avatar, 4xx/5xx por rota, expiracao de token. | BFF logs e metricas de storage. |
| Queue/Notification | Latencia realtime, fallback polling ativo, duplicidade de push/modal. | Logs de `QueueRealtimeClient` e Notification. |

Alarmes recomendados:

| Alarme | Threshold inicial |
|---|---:|
| Erro JS por sessao no canario | > 1,5x baseline por 15 min. |
| Falha de boot | > 2% das sessoes por 15 min. |
| `import()` de section falhando | > 1% dos cliques em Story/Portfolio. |
| Upload de midia 5xx | > 2% por 10 min. |
| Upload de midia 4xx inesperado | > 5% por 10 min, separado de validacao esperada. |
| LCP p75 mobile | > 2,5 s por 30 min. |
| INP p75 | > 200 ms por 30 min. |
| CLS p75 | > 0,1 por 30 min. |
| Queue realtime fallback | > 20% das sessoes de barbearia por 15 min. |

Rollback objetivo:

- Reverter para HTML/scripts classicos anteriores ou desativar canario Vite se erro JS subir acima de 1,5x baseline por 15 min.
- Desligar lazy de Story/Portfolio e voltar para carregamento estatico se falha de `import()` passar de 1% ou se p95 de carregamento do chunk passar de 2 s em rede movel.
- Voltar fluxo de upload para fachada antiga se sucesso de upload cair abaixo de 98% por 10 min ou se 5xx passar de 2%.
- Congelar rollout se qualquer vital p75 ficar fora da meta por 30 min sem causa externa identificada.

## 8. Acoes humanas antes de considerar concluido

1. Rodar Lighthouse mobile e desktop reais em CI ou maquina com Chrome e salvar JSON final em `/docs/perf/fase-3/`.
2. Decidir se `PortfolioSection` deve continuar placeholder ou voltar como produto ativo.
3. Definir se o adapter browser de Story vira ponte permanente ou se sera substituido por `StoryMediaAdapter` canonico/isomorfico.
4. Definir contrato canonico de upload browser/BFF: nomes de campos, token, confirmacao, metadata e validade.
5. Decidir destino de upload de produtos/servicos: adapter proprio, `PortfolioMediaAdapter` ou pipeline BFF dedicado.
6. Aprovar remocao gradual dos globals listados em `/docs/globals-allowlist.md`.
7. Decidir quando trocar Supabase local e Leaflet CDN por imports npm/chunks Vite.
8. Definir budget final de bundle inicial e lazy por app, com criterio bloqueante em CI.
9. Validar manualmente ou por browser automation os fluxos: login, agenda, story, produtos/settings, fila, notificacoes e GPS.
10. Configurar alarmes de canario e rollback antes do deploy que remover o fallback classico.
