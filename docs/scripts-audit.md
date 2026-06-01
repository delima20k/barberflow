# Auditoria de scripts

Gerado em: 2026-05-23. Escopo estatico: `apps/cliente/index.html` e `apps/profissional/index.html`. Nenhum codigo da aplicacao foi alterado.

## Resumo

| Metrica | Valor |
|---|---:|
| Tags `<script>` auditadas | 252 |
| Scripts unicos | 171 |
| Tags blocking | 252 |
| Tags `defer`/`async`/`module` | 0 |
| Tags no app cliente | 105 |
| Tags no app profissional | 147 |
| Peso total se ambos HTMLs carregassem tudo | 2517.8 KB |
| Peso gzip estimado equivalente | 692.2 KB |

O pedido menciona ~80 blocking; a versao atual tem 252 tags e todas sao blocking. O app profissional tem mais tags por carregar as Sections de MinhaBarbearia individualmente.

## Lighthouse baseline

Nao foi possivel produzir JSON real nesta execucao: `lighthouse` nao esta instalado no repo nem no PATH, e Chrome/Edge tambem nao foram encontrados pelo PATH. A pasta `docs/perf/baseline` ja existe, mas nao criei JSON sintetico para nao mascarar a ausencia da medicao.

Comandos recomendados quando Lighthouse e um servidor estatico estiverem disponiveis:

```powershell
lighthouse http://localhost:<porta>/apps/cliente/index.html --output=json --output-path=docs/perf/baseline/cliente-mobile.json --form-factor=mobile
lighthouse http://localhost:<porta>/apps/cliente/index.html --output=json --output-path=docs/perf/baseline/cliente-desktop.json --preset=desktop
lighthouse http://localhost:<porta>/apps/profissional/index.html --output=json --output-path=docs/perf/baseline/profissional-mobile.json --form-factor=mobile
lighthouse http://localhost:<porta>/apps/profissional/index.html --output=json --output-path=docs/perf/baseline/profissional-desktop.json --preset=desktop
```

## Ordem real necessaria

| Grupo | Ordem | Motivo |
|---|---|---|
| G0 vendor base | primeiro | Expoe globals de vendor, principalmente `supabase`; Leaflet expoe `L` quando usado. |
| G1 infra API | depois de vendor | `SupabaseService` depende de `supabase.min.js`; clientes REST usam Logger/API. |
| G2 auth/router | depois de infra | Auth, sessao, guards e Router precisam de Supabase/API e validadores. |
| G3 data clients | antes de services/pages | Repositories e BFF clients sao consumidos por services e pages. |
| G4 services/controllers | depois de data clients | Orquestram regras e dependem de repositories, BFF clients, modais e Auth. |
| G5 UI components/sections | antes de pages | Pages instanciam widgets, modais, Cadeira, Map, Section/EventBus. |
| G6 pages | antes do app boot | `app.js` instancia pages e chama `bind()`. |
| G7 misc | manter proximo do consumidor | Scripts sem encaixe claro; exigem teste antes de reorder. |
| G8 app boot | ultimo | `AppBootstrap` e `app.js` inicializam a aplicacao. |
| G9 inline pos-boot | apos boot | Script inline final do profissional depende de DOM/app ja carregados. |

## Peso por grupo

| Grupo | Scripts | Tamanho | Gzip | Impacto TTI estimado |
|---|---:|---:|---:|---:|
| G0 vendor base | 1 | 183.3 KB | 47.2 KB | 247.5 |
| G1 infra API | 5 | 63.5 KB | 17.8 KB | 63.5 |
| G2 auth/router | 11 | 121.1 KB | 34.0 KB | 121.3 |
| G3 data clients | 10 | 90.8 KB | 22.8 KB | 90.9 |
| G4 services/controllers | 42 | 404.9 KB | 108.3 KB | 405.0 |
| G5 UI components/sections | 46 | 274.3 KB | 75.7 KB | 274.3 |
| G6 pages | 21 | 160.2 KB | 47.2 KB | 160.4 |
| G7 misc | 30 | 185.0 KB | 56.2 KB | 185.1 |
| G8 app boot | 4 | 19.3 KB | 6.6 KB | 21.3 |
| G9 inline pos-boot | 1 | 0.4 KB | 0.4 KB | 0.4 |

## Top 10 scripts mais caros

| # | Script | Paginas | Gzip | Impacto TTI estimado |
|---:|---|---|---:|---:|
| 1 | `/shared/js/supabase.min.js` | cliente/index.html, profissional/index.html | 47.2 KB | 247.5 |
| 2 | `assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js` | profissional/index.html | 25.3 KB | 106.4 |
| 3 | `/shared/js/BarbeariaPage.js` | cliente/index.html, profissional/index.html | 12.7 KB | 50.3 |
| 4 | `/shared/js/BarbershopService.js` | cliente/index.html, profissional/index.html | 8.5 KB | 33.3 |
| 5 | `/shared/js/NearbyBarbershopsWidget.js` | cliente/index.html, profissional/index.html | 6.6 KB | 29.9 |
| 6 | `/shared/js/StoryViewer.js` | cliente/index.html, profissional/index.html | 5.9 KB | 27 |
| 7 | `/shared/js/MapWidget.js` | cliente/index.html, profissional/index.html | 7.2 KB | 25.9 |
| 8 | `/shared/js/AuthService.js` | cliente/index.html, profissional/index.html | 6.6 KB | 25.2 |
| 9 | `/shared/js/NotificationService.js` | cliente/index.html, profissional/index.html | 6.0 KB | 24 |
| 10 | `/shared/js/SupabaseService.js` | cliente/index.html, profissional/index.html | 6.5 KB | 23.1 |

## Inventario por script

| # | Script | Paginas | Tamanho | Min | Gzip | Tipo | Estrategia | Ordem/deps | Uso real | Impacto |
|---:|---|---|---:|---|---:|---|---|---|---|---:|
| 1 | `/shared/js/supabase.min.js` | cliente/index.html<br>profissional/index.html | 183.3 KB | sim | 47.2 KB | vendor | blocking | G0 vendor base | on-demand | 247.5 |
| 2 | `/shared/js/ApiService.js` | cliente/index.html<br>profissional/index.html | 12.3 KB | nao | 3.9 KB | proprio | blocking | G1 infra API | on-demand/servico | 12.3 |
| 3 | `/shared/js/BackendApiService.js` | cliente/index.html<br>profissional/index.html | 11.7 KB | nao | 3.0 KB | proprio | blocking | G1 infra API | on-demand/servico | 11.7 |
| 4 | `/shared/js/BffApiService.js` | cliente/index.html<br>profissional/index.html | 11.9 KB | nao | 3.0 KB | proprio | blocking | G1 infra API | on-demand/servico | 11.9 |
| 5 | `/shared/js/LoggerService.js` | cliente/index.html<br>profissional/index.html | 4.5 KB | nao | 1.5 KB | proprio | blocking | G1 infra API | on-demand/servico | 4.5 |
| 6 | `/shared/js/SupabaseService.js` | cliente/index.html<br>profissional/index.html | 23.1 KB | nao | 6.5 KB | proprio | blocking | G1 infra API | boot | 23.1 |
| 7 | `/shared/js/AppState.js` | cliente/index.html<br>profissional/index.html | 10.9 KB | nao | 2.8 KB | proprio | blocking | G2 auth/router | boot | 10.9 |
| 8 | `/shared/js/AuthGuard.js` | cliente/index.html<br>profissional/index.html | 8.5 KB | nao | 2.6 KB | proprio | blocking | G2 auth/router | boot | 8.5 |
| 9 | `/shared/js/AuthService.js` | cliente/index.html<br>profissional/index.html | 25.2 KB | nao | 6.6 KB | proprio | blocking | G2 auth/router | boot | 25.2 |
| 10 | `/shared/js/AuthUI.js` | cliente/index.html<br>profissional/index.html | 15.0 KB | nao | 4.1 KB | proprio | blocking | G2 auth/router | on-demand | 15 |
| 11 | `/shared/js/GuestMode.js` | cliente/index.html<br>profissional/index.html | 3.4 KB | nao | 1.3 KB | proprio | blocking | G2 auth/router | on-demand | 3.4 |
| 12 | `/shared/js/InputValidator.js` | cliente/index.html<br>profissional/index.html | 13.2 KB | nao | 3.9 KB | proprio | blocking | G2 auth/router | on-demand | 13.2 |
| 13 | `/shared/js/NavConfig.js` | cliente/index.html<br>profissional/index.html | 6.2 KB | nao | 1.6 KB | proprio | blocking | G2 auth/router | boot | 6.2 |
| 14 | `/shared/js/NavigationViewService.js` | cliente/index.html<br>profissional/index.html | 10.1 KB | nao | 3.1 KB | proprio | blocking | G2 auth/router | on-demand/servico | 10.1 |
| 15 | `/shared/js/PermissionService.js` | cliente/index.html<br>profissional/index.html | 6.1 KB | nao | 1.7 KB | proprio | blocking | G2 auth/router | on-demand/servico | 6.1 |
| 16 | `/shared/js/Router.js` | cliente/index.html<br>profissional/index.html | 17.4 KB | nao | 4.8 KB | proprio | blocking | G2 auth/router | boot | 17.4 |
| 17 | `/shared/js/SessionCache.js` | cliente/index.html<br>profissional/index.html | 5.3 KB | nao | 1.5 KB | proprio | blocking | G2 auth/router | boot | 5.3 |
| 18 | `/shared/js/AgendaBffClient.js` | cliente/index.html | 5.8 KB | nao | 1.8 KB | proprio | blocking | G3 data clients | pagina/evento | 5.8 |
| 19 | `/shared/js/AppointmentRepository.js` | profissional/index.html | 7.6 KB | nao | 1.8 KB | proprio | blocking | G3 data clients | on-demand/servico | 7.6 |
| 20 | `/shared/js/BarbeariaApiClient.js` | cliente/index.html<br>profissional/index.html | 6.4 KB | nao | 1.8 KB | proprio | blocking | G3 data clients | on-demand/servico | 6.4 |
| 21 | `/shared/js/BarbershopRepository.js` | cliente/index.html<br>profissional/index.html | 18.2 KB | nao | 4.1 KB | proprio | blocking | G3 data clients | on-demand/servico | 18.2 |
| 22 | `/shared/js/BffAuthClient.js` | cliente/index.html<br>profissional/index.html | 5.4 KB | nao | 1.7 KB | proprio | blocking | G3 data clients | on-demand/servico | 5.4 |
| 23 | `/shared/js/FinanceiroRepository.js` | profissional/index.html | 9.8 KB | nao | 2.2 KB | proprio | blocking | G3 data clients | pagina/evento | 9.8 |
| 24 | `/shared/js/ProfileRepository.js` | cliente/index.html<br>profissional/index.html | 14.7 KB | nao | 3.5 KB | proprio | blocking | G3 data clients | pagina/evento | 14.7 |
| 25 | `/shared/js/QueueRepository.js` | cliente/index.html<br>profissional/index.html | 7.5 KB | nao | 2.0 KB | proprio | blocking | G3 data clients | pagina/evento | 7.5 |
| 26 | `/shared/js/UserRepository.js` | profissional/index.html | 10.9 KB | nao | 2.6 KB | proprio | blocking | G3 data clients | on-demand/servico | 10.9 |
| 27 | `assets/js/ClienteRepository.js` | cliente/index.html | 4.6 KB | nao | 1.3 KB | proprio | blocking | G3 data clients | on-demand/servico | 4.6 |
| 28 | `/shared/js/AnimationService.js` | cliente/index.html<br>profissional/index.html | 7.0 KB | nao | 2.3 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 7 |
| 29 | `/shared/js/AuthController.js` | profissional/index.html | 3.8 KB | nao | 1.2 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 3.8 |
| 30 | `/shared/js/AvatarService.js` | cliente/index.html<br>profissional/index.html | 6.7 KB | nao | 2.4 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 6.7 |
| 31 | `/shared/js/BarbershopAvailabilityService.js` | cliente/index.html | 6.3 KB | nao | 1.7 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 6.3 |
| 32 | `/shared/js/BarbershopService.js` | cliente/index.html<br>profissional/index.html | 33.3 KB | nao | 8.5 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 33.3 |
| 33 | `/shared/js/CadeiraConfirmacaoService.js` | cliente/index.html | 9.2 KB | nao | 2.3 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 9.2 |
| 34 | `/shared/js/CadeiraService.js` | cliente/index.html<br>profissional/index.html | 13.6 KB | nao | 4.0 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 13.6 |
| 35 | `/shared/js/ChegadaProducaoService.js` | cliente/index.html | 11.9 KB | nao | 3.0 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 11.9 |
| 36 | `/shared/js/ClienteController.js` | cliente/index.html<br>profissional/index.html | 3.8 KB | nao | 1.1 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 3.8 |
| 37 | `/shared/js/FavoritosClientesService.js` | profissional/index.html | 3.7 KB | nao | 1.2 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 3.7 |
| 38 | `/shared/js/FilaController.js` | cliente/index.html<br>profissional/index.html | 4.1 KB | nao | 1.3 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 4.1 |
| 39 | `/shared/js/FilaPresencaService.js` | cliente/index.html | 10.0 KB | nao | 2.7 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 10 |
| 40 | `/shared/js/FinanceiroService.js` | profissional/index.html | 8.1 KB | nao | 2.0 KB | proprio | blocking | G4 services/controllers | pagina/evento | 8.1 |
| 41 | `/shared/js/GeoService.js` | cliente/index.html<br>profissional/index.html | 14.4 KB | nao | 4.3 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 14.4 |
| 42 | `/shared/js/LgpdService.js` | cliente/index.html<br>profissional/index.html | 10.7 KB | nao | 2.7 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 10.7 |
| 43 | `/shared/js/MenuService.js` | cliente/index.html<br>profissional/index.html | 3.3 KB | nao | 1.1 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 3.3 |
| 44 | `/shared/js/MessageCryptoService.js` | cliente/index.html<br>profissional/index.html | 7.2 KB | nao | 2.1 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 7.2 |
| 45 | `/shared/js/MessageService.js` | cliente/index.html<br>profissional/index.html | 4.4 KB | nao | 1.2 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 4.4 |
| 46 | `/shared/js/MessageSignalingService.js` | cliente/index.html<br>profissional/index.html | 5.9 KB | nao | 1.6 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 5.9 |
| 47 | `/shared/js/ModalController.js` | cliente/index.html<br>profissional/index.html | 2.5 KB | nao | 1.0 KB | proprio | blocking | G4 services/controllers | pagina/evento | 2.5 |
| 48 | `/shared/js/NotificationService.js` | cliente/index.html<br>profissional/index.html | 24.0 KB | nao | 6.0 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 24 |
| 49 | `/shared/js/P2PMessageConnectionService.js` | cliente/index.html<br>profissional/index.html | 19.0 KB | nao | 4.2 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 19 |
| 50 | `/shared/js/ProfessionalService.js` | cliente/index.html<br>profissional/index.html | 14.5 KB | nao | 3.9 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 14.5 |
| 51 | `/shared/js/PushSubscriptionService.js` | cliente/index.html<br>profissional/index.html | 8.8 KB | nao | 2.5 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 8.8 |
| 52 | `/shared/js/QueueConfirmService.js` | cliente/index.html<br>profissional/index.html | 13.8 KB | nao | 3.7 KB | proprio | blocking | G4 services/controllers | pagina/evento | 13.8 |
| 53 | `/shared/js/QueuePositionNotificationService.js` | cliente/index.html | 5.2 KB | nao | 1.5 KB | proprio | blocking | G4 services/controllers | pagina/evento | 5.2 |
| 54 | `/shared/js/SplashService.js` | cliente/index.html<br>profissional/index.html | 2.3 KB | nao | 1.1 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 2.3 |
| 55 | `/shared/js/UserService.js` | cliente/index.html<br>profissional/index.html | 9.4 KB | nao | 2.0 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 9.4 |
| 56 | `assets/js/ClienteService.js` | cliente/index.html | 3.7 KB | nao | 0.9 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 3.7 |
| 57 | `assets/js/controllers/CadastroController.js` | profissional/index.html | 2.9 KB | nao | 1.0 KB | proprio | blocking | G4 services/controllers | pagina/evento | 2.9 |
| 58 | `assets/js/controllers/PlanosController.js` | profissional/index.html | 5.6 KB | nao | 1.8 KB | proprio | blocking | G4 services/controllers | pagina/evento | 5.6 |
| 59 | `assets/js/controllers/TermosController.js` | profissional/index.html | 2.7 KB | nao | 1.0 KB | proprio | blocking | G4 services/controllers | pagina/evento | 2.7 |
| 60 | `assets/js/LegalConsentService.js` | profissional/index.html | 8.2 KB | nao | 2.0 KB | proprio | blocking | G4 services/controllers | on-demand/servico | 8.2 |
| 61 | `assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaController.js` | profissional/index.html | 1.5 KB | nao | 0.5 KB | proprio | blocking | G4 services/controllers | pagina/evento | 1.5 |
| 62 | `assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsController.js` | profissional/index.html | 1.0 KB | nao | 0.5 KB | analytics/tracker | blocking | G4 services/controllers | pagina/evento | 1 |
| 63 | `assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js` | profissional/index.html | 106.4 KB | nao | 25.3 KB | legado | blocking | G4 services/controllers | pagina/evento | 106.4 |
| 64 | `assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationController.js` | profissional/index.html | 1.3 KB | nao | 0.5 KB | proprio | blocking | G4 services/controllers | pagina/evento | 1.3 |
| 65 | `assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioController.js` | profissional/index.html | 0.6 KB | nao | 0.3 KB | proprio | blocking | G4 services/controllers | pagina/evento | 0.6 |
| 66 | `assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueController.js` | profissional/index.html | 1.2 KB | nao | 0.4 KB | proprio | blocking | G4 services/controllers | pagina/evento | 1.2 |
| 67 | `assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsController.js` | profissional/index.html | 0.6 KB | nao | 0.3 KB | proprio | blocking | G4 services/controllers | pagina/evento | 0.6 |
| 68 | `assets/js/pages/MinhaBarbeariaPage/StorySection/StoryController.js` | profissional/index.html | 0.7 KB | nao | 0.3 KB | proprio | blocking | G4 services/controllers | pagina/evento | 0.7 |
| 69 | `assets/js/PlanosService.js` | profissional/index.html | 1.7 KB | nao | 0.7 KB | proprio | blocking | G4 services/controllers | pagina/evento | 1.7 |
| 70 | `/events/catalog.js` | profissional/index.html | 0.9 KB | nao | 0.3 KB | proprio | blocking | G5 UI components/sections | on-demand | 0.9 |
| 71 | `/shared/js/BarbeiroCard.js` | cliente/index.html<br>profissional/index.html | 3.0 KB | nao | 1.0 KB | proprio | blocking | G5 UI components/sections | on-demand | 3 |
| 72 | `/shared/js/BarberFinanceModal.js` | profissional/index.html | 7.4 KB | nao | 2.1 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 7.4 |
| 73 | `/shared/js/Cadeira.js` | cliente/index.html<br>profissional/index.html | 8.7 KB | nao | 2.7 KB | proprio | blocking | G5 UI components/sections | on-demand | 8.7 |
| 74 | `/shared/js/ClienteAusenteModal.js` | profissional/index.html | 2.7 KB | nao | 1.0 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 2.7 |
| 75 | `/shared/js/ClienteSeletorModal.js` | profissional/index.html | 21.5 KB | nao | 5.6 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 21.5 |
| 76 | `/shared/js/ConfirmacaoCorteModal.js` | cliente/index.html<br>profissional/index.html | 1.4 KB | nao | 0.7 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 1.4 |
| 77 | `/shared/js/CorteModal.js` | cliente/index.html<br>profissional/index.html | 8.4 KB | nao | 2.6 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 8.4 |
| 78 | `/shared/js/FinalizarCorteModal.js` | profissional/index.html | 4.9 KB | nao | 1.6 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 4.9 |
| 79 | `/shared/js/MapOrientationModule.js` | cliente/index.html<br>profissional/index.html | 14.5 KB | nao | 3.9 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 14.5 |
| 80 | `/shared/js/MapPanelModule.js` | cliente/index.html<br>profissional/index.html | 13.7 KB | nao | 3.4 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 13.7 |
| 81 | `/shared/js/MapWidget.js` | cliente/index.html<br>profissional/index.html | 25.9 KB | nao | 7.2 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 25.9 |
| 82 | `/shared/js/MenosPercentualModal.js` | profissional/index.html | 5.5 KB | nao | 1.7 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 5.5 |
| 83 | `/shared/js/MensalistaModal.js` | profissional/index.html | 15.5 KB | nao | 3.8 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 15.5 |
| 84 | `/shared/js/MessagesWidget.js` | cliente/index.html<br>profissional/index.html | 22.9 KB | nao | 5.5 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 22.9 |
| 85 | `/shared/js/NearbyBarbershopsWidget.js` | cliente/index.html<br>profissional/index.html | 29.9 KB | nao | 6.6 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 29.9 |
| 86 | `/shared/js/PageSection.js` | profissional/index.html | 3.2 KB | nao | 0.9 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 3.2 |
| 87 | `/shared/js/QueueModalPayloadBuilder.js` | cliente/index.html | 7.2 KB | nao | 2.0 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 7.2 |
| 88 | `/shared/js/SearchWidget.js` | cliente/index.html<br>profissional/index.html | 13.2 KB | nao | 3.7 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 13.2 |
| 89 | `/shared/js/SectionEventBus.js` | profissional/index.html | 1.4 KB | nao | 0.5 KB | proprio | blocking | G5 UI components/sections | on-demand | 1.4 |
| 90 | `/shared/js/StatusFechamentoModal.js` | cliente/index.html<br>profissional/index.html | 4.4 KB | nao | 1.4 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 4.4 |
| 91 | `/shared/js/StoriesLayout.js` | cliente/index.html<br>profissional/index.html | 7.8 KB | nao | 2.1 KB | proprio | blocking | G5 UI components/sections | on-demand | 7.8 |
| 92 | `/shared/js/StoryViewer.js` | cliente/index.html<br>profissional/index.html | 27.0 KB | nao | 5.9 KB | proprio | blocking | G5 UI components/sections | on-demand | 27 |
| 93 | `assets/js/GpsPanelMap.js` | profissional/index.html | 4.7 KB | nao | 1.7 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 4.7 |
| 94 | `assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaSection.js` | profissional/index.html | 0.7 KB | nao | 0.3 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.7 |
| 95 | `assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaState.js` | profissional/index.html | 1.2 KB | nao | 0.4 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 1.2 |
| 96 | `assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaView.js` | profissional/index.html | 0.5 KB | nao | 0.3 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.5 |
| 97 | `assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsSection.js` | profissional/index.html | 0.6 KB | nao | 0.3 KB | analytics/tracker | blocking | G5 UI components/sections | pagina/evento | 0.6 |
| 98 | `assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsState.js` | profissional/index.html | 0.4 KB | nao | 0.2 KB | analytics/tracker | blocking | G5 UI components/sections | pagina/evento | 0.4 |
| 99 | `assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsView.js` | profissional/index.html | 0.3 KB | nao | 0.2 KB | analytics/tracker | blocking | G5 UI components/sections | pagina/evento | 0.3 |
| 100 | `assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationSection.js` | profissional/index.html | 0.6 KB | nao | 0.3 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.6 |
| 101 | `assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationState.js` | profissional/index.html | 1.0 KB | nao | 0.4 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 1 |
| 102 | `assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationView.js` | profissional/index.html | 0.4 KB | nao | 0.2 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.4 |
| 103 | `assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioSection.js` | profissional/index.html | 0.6 KB | nao | 0.3 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.6 |
| 104 | `assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioState.js` | profissional/index.html | 0.7 KB | nao | 0.3 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.7 |
| 105 | `assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioView.js` | profissional/index.html | 0.3 KB | nao | 0.2 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.3 |
| 106 | `assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueSection.js` | profissional/index.html | 0.6 KB | nao | 0.3 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.6 |
| 107 | `assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueState.js` | profissional/index.html | 0.9 KB | nao | 0.3 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.9 |
| 108 | `assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueView.js` | profissional/index.html | 0.4 KB | nao | 0.2 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.4 |
| 109 | `assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsSection.js` | profissional/index.html | 0.6 KB | nao | 0.3 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.6 |
| 110 | `assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsState.js` | profissional/index.html | 0.8 KB | nao | 0.3 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.8 |
| 111 | `assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsView.js` | profissional/index.html | 0.4 KB | nao | 0.2 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.4 |
| 112 | `assets/js/pages/MinhaBarbeariaPage/StorySection/StorySection.js` | profissional/index.html | 0.6 KB | nao | 0.3 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.6 |
| 113 | `assets/js/pages/MinhaBarbeariaPage/StorySection/StoryState.js` | profissional/index.html | 1.1 KB | nao | 0.4 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 1.1 |
| 114 | `assets/js/pages/MinhaBarbeariaPage/StorySection/StoryView.js` | profissional/index.html | 0.3 KB | nao | 0.2 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 0.3 |
| 115 | `assets/js/pages/QueueWidget.js` | profissional/index.html | 5.6 KB | nao | 1.9 KB | proprio | blocking | G5 UI components/sections | pagina/evento | 5.6 |
| 116 | `/shared/js/BarbeariaPage.js` | cliente/index.html<br>profissional/index.html | 50.3 KB | nao | 12.7 KB | proprio | blocking | G6 pages | pagina/evento | 50.3 |
| 117 | `/shared/js/BarbeiroPage.js` | cliente/index.html<br>profissional/index.html | 11.7 KB | nao | 3.1 KB | proprio | blocking | G6 pages | pagina/evento | 11.7 |
| 118 | `/shared/js/TermsPage.js` | cliente/index.html<br>profissional/index.html | 2.0 KB | nao | 0.8 KB | proprio | blocking | G6 pages | pagina/evento | 2 |
| 119 | `assets/js/pages/AgendaPage.js` | profissional/index.html | 7.1 KB | nao | 2.4 KB | proprio | blocking | G6 pages | pagina/evento | 7.1 |
| 120 | `assets/js/pages/BarbeariasPage.js` | cliente/index.html<br>profissional/index.html | 6.0 KB | nao | 2.2 KB | proprio | blocking | G6 pages | pagina/evento | 6 |
| 121 | `assets/js/pages/BarbeirosPage.js` | cliente/index.html<br>profissional/index.html | 6.9 KB | nao | 2.3 KB | proprio | blocking | G6 pages | pagina/evento | 6.9 |
| 122 | `assets/js/pages/CriarBarbeariaPage.js` | profissional/index.html | 6.4 KB | nao | 2.2 KB | proprio | blocking | G6 pages | pagina/evento | 6.4 |
| 123 | `assets/js/pages/DestaquesPage.js` | cliente/index.html<br>profissional/index.html | 6.8 KB | nao | 2.4 KB | proprio | blocking | G6 pages | pagina/evento | 6.9 |
| 124 | `assets/js/pages/FavoritesPage.js` | cliente/index.html | 6.0 KB | nao | 2.0 KB | proprio | blocking | G6 pages | pagina/evento | 6 |
| 125 | `assets/js/pages/FinancasPage.js` | profissional/index.html | 13.6 KB | nao | 3.4 KB | proprio | blocking | G6 pages | pagina/evento | 13.6 |
| 126 | `assets/js/pages/ForgotPasswordPage.js` | cliente/index.html | 1.5 KB | nao | 0.6 KB | proprio | blocking | G6 pages | pagina/evento | 1.5 |
| 127 | `assets/js/pages/GpsPage.js` | profissional/index.html | 10.7 KB | nao | 3.0 KB | proprio | blocking | G6 pages | pagina/evento | 10.7 |
| 128 | `assets/js/pages/HomePage.js` | cliente/index.html | 2.0 KB | nao | 0.8 KB | proprio | blocking | G6 pages | pagina/evento | 2 |
| 129 | `assets/js/pages/LoginPage.js` | cliente/index.html | 1.6 KB | nao | 0.7 KB | proprio | blocking | G6 pages | pagina/evento | 1.6 |
| 130 | `assets/js/pages/LogoutPage.js` | cliente/index.html | 1.1 KB | nao | 0.5 KB | proprio | blocking | G6 pages | pagina/evento | 1.1 |
| 131 | `assets/js/pages/MinhaBarbeariaPage.js` | profissional/index.html | 0.4 KB | nao | 0.2 KB | proprio | blocking | G6 pages | pagina/evento | 0.4 |
| 132 | `assets/js/pages/MinhaBarbeariaPage/QueueRealtimeClient.js` | profissional/index.html | 1.4 KB | nao | 0.6 KB | proprio | blocking | G6 pages | pagina/evento | 1.4 |
| 133 | `assets/js/pages/ParceriasPage.js` | profissional/index.html | 17.8 KB | nao | 4.6 KB | proprio | blocking | G6 pages | pagina/evento | 17.8 |
| 134 | `assets/js/pages/ProfilePage.js` | cliente/index.html | 4.5 KB | nao | 1.6 KB | proprio | blocking | G6 pages | pagina/evento | 4.5 |
| 135 | `assets/js/pages/RegisterPage.js` | cliente/index.html | 1.7 KB | nao | 0.7 KB | proprio | blocking | G6 pages | pagina/evento | 1.7 |
| 136 | `assets/js/pages/SearchPage.js` | cliente/index.html | 0.8 KB | nao | 0.4 KB | proprio | blocking | G6 pages | pagina/evento | 0.8 |
| 137 | `/shared/js/Agendamento.js` | cliente/index.html | 6.2 KB | nao | 1.9 KB | proprio | blocking | G7 misc | pagina/evento | 6.2 |
| 138 | `/shared/js/BarbeariaStatusSync.js` | cliente/index.html<br>profissional/index.html | 7.0 KB | nao | 2.1 KB | proprio | blocking | G7 misc | on-demand | 7 |
| 139 | `/shared/js/BarbeiroEsperaFluxo.js` | profissional/index.html | 9.0 KB | nao | 2.5 KB | legado | blocking | G7 misc | on-demand | 9 |
| 140 | `/shared/js/BarberPole.js` | cliente/index.html<br>profissional/index.html | 4.8 KB | nao | 1.7 KB | proprio | blocking | G7 misc | on-demand | 4.8 |
| 141 | `/shared/js/CacheManager.js` | cliente/index.html<br>profissional/index.html | 3.6 KB | nao | 1.0 KB | proprio | blocking | G7 misc | on-demand | 3.6 |
| 142 | `/shared/js/CapaBarbearia.js` | cliente/index.html<br>profissional/index.html | 5.2 KB | nao | 1.3 KB | proprio | blocking | G7 misc | on-demand | 5.2 |
| 143 | `/shared/js/Cliente.js` | cliente/index.html | 4.4 KB | nao | 1.6 KB | proprio | blocking | G7 misc | on-demand/servico | 4.4 |
| 144 | `/shared/js/FluxoDeFila.js` | cliente/index.html<br>profissional/index.html | 9.1 KB | nao | 2.6 KB | legado | blocking | G7 misc | on-demand | 9.1 |
| 145 | `/shared/js/FonteSalao.js` | cliente/index.html<br>profissional/index.html | 9.5 KB | nao | 2.4 KB | proprio | blocking | G7 misc | on-demand | 9.5 |
| 146 | `/shared/js/FooterScrollManager.js` | cliente/index.html<br>profissional/index.html | 6.2 KB | nao | 1.9 KB | proprio | blocking | G7 misc | on-demand | 6.2 |
| 147 | `/shared/js/GuardaIten.js` | profissional/index.html | 6.3 KB | nao | 1.8 KB | proprio | blocking | G7 misc | on-demand | 6.3 |
| 148 | `/shared/js/HeaderScrollBehavior.js` | cliente/index.html<br>profissional/index.html | 6.8 KB | nao | 2.2 KB | proprio | blocking | G7 misc | on-demand | 6.8 |
| 149 | `/shared/js/LogoGlow.js` | cliente/index.html<br>profissional/index.html | 1.5 KB | nao | 0.7 KB | proprio | blocking | G7 misc | on-demand | 1.5 |
| 150 | `/shared/js/LogoutScreen.js` | cliente/index.html<br>profissional/index.html | 5.8 KB | nao | 1.7 KB | proprio | blocking | G7 misc | on-demand | 5.8 |
| 151 | `/shared/js/LojaMarker.js` | cliente/index.html<br>profissional/index.html | 3.1 KB | nao | 1.2 KB | proprio | blocking | G7 misc | on-demand | 3.1 |
| 152 | `/shared/js/MediaP2P.js` | profissional/index.html | 11.9 KB | nao | 3.9 KB | proprio | blocking | G7 misc | on-demand | 11.9 |
| 153 | `/shared/js/NavigationManager.js` | cliente/index.html<br>profissional/index.html | 7.3 KB | nao | 2.3 KB | proprio | blocking | G7 misc | on-demand | 7.3 |
| 154 | `/shared/js/OfflineSyncQueue.js` | cliente/index.html<br>profissional/index.html | 7.0 KB | nao | 2.0 KB | proprio | blocking | G7 misc | pagina/evento | 7 |
| 155 | `/shared/js/PaymentFlowHandler.js` | profissional/index.html | 6.8 KB | nao | 2.0 KB | proprio | blocking | G7 misc | on-demand | 6.8 |
| 156 | `/shared/js/PerfilEditor.js` | cliente/index.html<br>profissional/index.html | 13.7 KB | nao | 4.0 KB | proprio | blocking | G7 misc | on-demand | 13.7 |
| 157 | `/shared/js/ProLandingGate.js` | profissional/index.html | 4.1 KB | nao | 1.3 KB | proprio | blocking | G7 misc | on-demand | 4.1 |
| 158 | `/shared/js/PWAInstallBanner.js` | cliente/index.html<br>profissional/index.html | 10.1 KB | nao | 3.0 KB | proprio | blocking | G7 misc | on-demand | 10.1 |
| 159 | `/shared/js/QueuePoller.js` | cliente/index.html | 11.9 KB | nao | 3.8 KB | proprio | blocking | G7 misc | pagina/evento | 11.9 |
| 160 | `/shared/js/QueuePositionPresenter.js` | cliente/index.html | 5.8 KB | nao | 1.6 KB | proprio | blocking | G7 misc | pagina/evento | 5.8 |
| 161 | `/shared/js/QueueRealtimeNotifier.js` | cliente/index.html | 5.2 KB | nao | 1.5 KB | proprio | blocking | G7 misc | pagina/evento | 5.2 |
| 162 | `/shared/js/QueueStateUpdater.js` | cliente/index.html | 5.0 KB | nao | 1.4 KB | proprio | blocking | G7 misc | pagina/evento | 5 |
| 163 | `/shared/js/ResourceLoader.js` | cliente/index.html<br>profissional/index.html | 3.8 KB | nao | 1.1 KB | proprio | blocking | G7 misc | on-demand | 3.8 |
| 164 | `/shared/js/StateManager.js` | cliente/index.html<br>profissional/index.html | 2.2 KB | nao | 0.8 KB | proprio | blocking | G7 misc | on-demand | 2.2 |
| 165 | `assets/js/MonetizationGuard.js` | profissional/index.html | 1.8 KB | nao | 0.7 KB | proprio | blocking | G7 misc | on-demand | 1.8 |
| 166 | `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js` | cliente/index.html<br>profissional/index.html | 0.0 KB | n/a | 0.0 KB | vendor | blocking | G7 misc | on-demand | 0 |
| 167 | `assets/js/app.js` | cliente/index.html<br>profissional/index.html | 4.4 KB | nao | 1.5 KB | proprio | blocking | G8 app boot | boot | 4.4 |
| 168 | `assets/js/AppBootstrap.js` | cliente/index.html<br>profissional/index.html | 9.1 KB | nao | 2.9 KB | proprio | blocking | G8 app boot | boot | 11.1 |
| 169 | `assets/js/ClienteStartupSplash.js` | cliente/index.html | 3.5 KB | nao | 1.2 KB | proprio | blocking | G8 app boot | boot | 3.5 |
| 170 | `assets/js/ProfissionalStartupSplash.js` | profissional/index.html | 2.3 KB | nao | 0.9 KB | proprio | blocking | G8 app boot | boot | 2.3 |
| 171 | `(inline)` | profissional/index.html | 0.4 KB | n/a | 0.4 KB | legado | blocking | G9 inline pos-boot | boot | 0.4 |

## Scripts duplicados

Os duplicados abaixo sao compartilhados entre cliente e profissional. Nao sao duplicados no mesmo HTML, mas representam bytes repetidos entre apps e devem virar chunks compartilhados/cacheaveis na fase de build.

- `/shared/js/supabase.min.js`: cliente/index.html, profissional/index.html.
- `/shared/js/LoggerService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/ApiService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/SupabaseService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/SessionCache.js`: cliente/index.html, profissional/index.html.
- `/shared/js/NavConfig.js`: cliente/index.html, profissional/index.html.
- `/shared/js/InputValidator.js`: cliente/index.html, profissional/index.html.
- `/shared/js/AuthService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/AuthUI.js`: cliente/index.html, profissional/index.html.
- `/shared/js/LogoutScreen.js`: cliente/index.html, profissional/index.html.
- `/shared/js/AnimationService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/MenuService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/UserService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/BackendApiService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/AvatarService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/SplashService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/AppState.js`: cliente/index.html, profissional/index.html.
- `/shared/js/GuestMode.js`: cliente/index.html, profissional/index.html.
- `/shared/js/AuthGuard.js`: cliente/index.html, profissional/index.html.
- `/shared/js/PermissionService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/NavigationViewService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/Router.js`: cliente/index.html, profissional/index.html.
- `/shared/js/BarberPole.js`: cliente/index.html, profissional/index.html.
- `/shared/js/LogoGlow.js`: cliente/index.html, profissional/index.html.
- `/shared/js/StoryViewer.js`: cliente/index.html, profissional/index.html.
- `/shared/js/StoriesLayout.js`: cliente/index.html, profissional/index.html.
- `/shared/js/GeoService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/BarbershopRepository.js`: cliente/index.html, profissional/index.html.
- `/shared/js/ProfileRepository.js`: cliente/index.html, profissional/index.html.
- `/shared/js/BarbershopService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/ProfessionalService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/StatusFechamentoModal.js`: cliente/index.html, profissional/index.html.
- `/shared/js/QueueRepository.js`: cliente/index.html, profissional/index.html.
- `/shared/js/CadeiraService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/CorteModal.js`: cliente/index.html, profissional/index.html.
- `/shared/js/BarbeiroCard.js`: cliente/index.html, profissional/index.html.
- `/shared/js/Cadeira.js`: cliente/index.html, profissional/index.html.
- `/shared/js/FilaController.js`: cliente/index.html, profissional/index.html.
- `/shared/js/FluxoDeFila.js`: cliente/index.html, profissional/index.html.
- `/shared/js/ConfirmacaoCorteModal.js`: cliente/index.html, profissional/index.html.
- `/shared/js/ModalController.js`: cliente/index.html, profissional/index.html.
- `/shared/js/ClienteController.js`: cliente/index.html, profissional/index.html.
- `/shared/js/BarbeariaStatusSync.js`: cliente/index.html, profissional/index.html.
- `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js`: cliente/index.html, profissional/index.html.
- `/shared/js/BffApiService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/BffAuthClient.js`: cliente/index.html, profissional/index.html.
- `/shared/js/BarbeariaApiClient.js`: cliente/index.html, profissional/index.html.
- `/shared/js/NearbyBarbershopsWidget.js`: cliente/index.html, profissional/index.html.
- `/shared/js/LojaMarker.js`: cliente/index.html, profissional/index.html.
- `/shared/js/MapWidget.js`: cliente/index.html, profissional/index.html.
- `/shared/js/SearchWidget.js`: cliente/index.html, profissional/index.html.
- `/shared/js/FonteSalao.js`: cliente/index.html, profissional/index.html.
- `/shared/js/CapaBarbearia.js`: cliente/index.html, profissional/index.html.
- `/shared/js/MapPanelModule.js`: cliente/index.html, profissional/index.html.
- `/shared/js/MapOrientationModule.js`: cliente/index.html, profissional/index.html.
- `/shared/js/MessageService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/MessageCryptoService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/MessageSignalingService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/P2PMessageConnectionService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/MessagesWidget.js`: cliente/index.html, profissional/index.html.
- `/shared/js/NotificationService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/LgpdService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/TermsPage.js`: cliente/index.html, profissional/index.html.
- `/shared/js/PerfilEditor.js`: cliente/index.html, profissional/index.html.
- `/shared/js/FooterScrollManager.js`: cliente/index.html, profissional/index.html.
- `/shared/js/HeaderScrollBehavior.js`: cliente/index.html, profissional/index.html.
- `assets/js/pages/DestaquesPage.js`: cliente/index.html, profissional/index.html.
- `assets/js/pages/BarbeirosPage.js`: cliente/index.html, profissional/index.html.
- `assets/js/pages/BarbeariasPage.js`: cliente/index.html, profissional/index.html.
- `/shared/js/CacheManager.js`: cliente/index.html, profissional/index.html.
- `/shared/js/StateManager.js`: cliente/index.html, profissional/index.html.
- `/shared/js/ResourceLoader.js`: cliente/index.html, profissional/index.html.
- `/shared/js/NavigationManager.js`: cliente/index.html, profissional/index.html.
- `/shared/js/PushSubscriptionService.js`: cliente/index.html, profissional/index.html.
- `/shared/js/OfflineSyncQueue.js`: cliente/index.html, profissional/index.html.
- `/shared/js/BarbeariaPage.js`: cliente/index.html, profissional/index.html.
- `/shared/js/BarbeiroPage.js`: cliente/index.html, profissional/index.html.
- `/shared/js/PWAInstallBanner.js`: cliente/index.html, profissional/index.html.
- `assets/js/AppBootstrap.js`: cliente/index.html, profissional/index.html.
- `/shared/js/QueueConfirmService.js`: cliente/index.html, profissional/index.html.
- `assets/js/app.js`: cliente/index.html, profissional/index.html.

## Scripts mortos ou suspeitos

- `PortfolioSection/*` e `AnalyticsSection/*`: placeholders arquiteturais; carregam no profissional, mas nao possuem regiao DOM dedicada nem comportamento de produto ativo. Suspeitos de custo sem valor imediato ate a proxima fase de Sections.
- `AgendaSection/*`: placeholder validado; util como contrato, mas nao move agenda real para MinhaBarbearia. Pode ser lazy-loaded junto da MinhaBarbearia.
- Mensagens/P2P: `MessageCryptoService`, `MessageSignalingService`, `P2PMessageConnectionService`, `MessagesWidget` carregam em ambos os apps mesmo se o usuario nao abre mensagens. Nao marcar como morto; marcar como on-demand pesado.
- Mapa: `MapPanelModule`, `MapOrientationModule`, `MapWidget` e Leaflet carregam em ambos os apps mesmo quando mapa nao aparece no primeiro render. Nao morto, mas candidato claro a split por mapa/GPS.
- Script inline final do profissional: legado; depende de inspecao humana antes de mover para arquivo/modulo.

## Candidatos a defer sem risco baixo

- Componentes puramente visuais depois de `Router` e antes de `app.js`: `BarberPole`, `LogoGlow`, `StoryViewer`, `StoriesLayout`.
- Modais on-demand: `CorteModal`, `ConfirmacaoCorteModal`, `ClienteAusenteModal`, `MensalistaModal`, `FinalizarCorteModal`, `FluxoDeFila`.
- PWA/offline: `PWAInstallBanner`, `OfflineSyncQueue`, `PushSubscriptionService` podem ser adiados apos primeiro paint se o bootstrap checar existencia antes de usar.
- Paginas que nao sao rota inicial: `AgendaPage`, `FinancasPage`, `GpsPage`, `ParceriasPage`, `QueueWidget`, paginas auth do cliente.

## Scripts que precisam cuidado

- `supabase.min.js`, `SupabaseService.js`, `AuthService.js`, `AppState.js`, `Router.js`, `AppBootstrap.js`, `app.js`: cadeia de boot por globals.
- Leaflet + `MapWidget.js`: Leaflet precisa existir antes de inicializar mapa.
- `events/catalog.js`, `SectionEventBus.js`, `PageSection.js` e Sections: ordem atual e obrigatoria enquanto nao forem ES modules.
- Repositories/services da fila e financeiro: varias pages chamam globals diretamente. Reorder sem testes pode quebrar fluxos de cadeira, mensalista e notificacao.

## Candidatos a ES module

- Todas as novas `MinhaBarbeariaPage/*Section/*`, `PageSection`, `SectionEventBus`, `events/catalog.js`.
- Pages isoladas: `AgendaPage`, `FinancasPage`, `GpsPage`, `QueueWidget`, `ParceriasPage`, paginas do cliente.
- Services puros sem DOM: `BarbershopAvailabilityService`, `QueueModalPayloadBuilder`, `Bff*Client`, repositories.

## Candidatos a code splitting por pagina/section

- Cliente: auth pages, home/search/favorites/profile, mapa/barbearia publica, mensagens, fila.
- Profissional: dashboard/listagens, MinhaBarbearia Sections, agenda, financas, GPS, parcerias, queue widget, planos/cadastro/termos.
- Shared pesado: mapa/Leaflet, mensagens P2P, stories/media, fila/cadeiras, financeiro/modais.

## Plano de migracao

### Fase 1: defer/async + remocao de duplicados/mortos

Escopo: aplicar `defer` mantendo ordem documentada; remover placeholders ou carregar placeholders apenas quando a regiao DOM existir; adiar mapa/mensagens/PWA depois do primeiro paint.

Risco: medio, porque globals ainda dependem de ordem. Rollback: remover `defer` dos grupos G0-G8 e restaurar ordem atual.

Metricas de sucesso: reduzir blocking tags iniciais em 50%; TTI -20%; TBT -20%; LCP sem regressao.

### Fase 2: agrupar scripts proprios por section e ES modules

Escopo: transformar PageSection/EventBus/Sections e pages em imports explicitos; bundles por dominio: auth, mapa, fila, mensagens, MinhaBarbearia, financeiro.

Risco: medio/alto por quebra de globals. Rollback: manter builds UMD/globals paralelos enquanto modules estabilizam.

Metricas de sucesso: app shell inicial < 250 KB gzip por app; chunks de rota carregados on-demand; TTI p95 mobile < 3,5s em 4G medio.

### Fase 3: Vite, tree-shaking e chunks por section

Escopo: introduzir Vite com entradas separadas cliente/profissional, aliases `shared`, chunks vendor, dynamic import por page/section, sourcemaps e manifest para PWA.

Risco: alto por service worker/cache e paths absolutos. Rollback: manter HTML legado como fallback por release e feature flag de asset pipeline.

Metricas de sucesso: reduzir JS inicial gzip em 60-75%; TBT < 200 ms desktop e < 500 ms mobile; LCP mobile < 2,5s em tela inicial cacheada.

## Decisoes humanas pendentes

- Confirmar se placeholders `Agenda/Portfolio/AnalyticsSection` devem carregar no primeiro boot ou apenas com lazy import.
- Decidir se mensagens/P2P entram no shell dos dois apps ou viram feature on-demand.
- Decidir politica de provider externo: Leaflet CDN atual vs bundle local/cacheado pelo SW.
- Definir se o script inline final do profissional vira arquivo legado ou modulo de bootstrap.
- Validar quais telas realmente precisam compartilhar todos os scripts entre cliente e profissional no primeiro carregamento.
