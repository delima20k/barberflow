# Class Registry - Analytics Admin

Registro local e isolado. Nenhuma classe deste aplicativo pertence ao runtime principal do
BarberFlow.

| Classe | Arquivo | Camada | Responsabilidade |
|---|---|---|---|
| `AdminConfig` | `config/admin-config.js` | infra | Expor configuração pública validada |
| `AdminRouter` | `js/router.js` | infra | Resolver rotas locais por hash |
| `AnalyticsAdminApp` | `js/app.js` | application | Compor e inicializar a aplicação |
| `AnalyticsEventCatalog` | `config/event-catalog.js` | domain | Catalogar eventos permitidos e futuros |
| `AnalyticsRepository` | `services/AnalyticsRepository.js` | infra | Isolar e normalizar eventos e sessões |
| `AppShell` | `components/AppShell.js` | interfaces | Controlar navegação e shell responsivo |
| `AuthService` | `services/AuthService.js` | application | Autenticar o administrador em DEMO ou Supabase |
| `CsvExporter` | `utils/CsvExporter.js` | infra | Serializar registros em CSV |
| `DashboardPage` | `pages/DashboardPage.js` | interfaces | Coordenar métricas e atividade |
| `DateRange` | `utils/DateRange.js` | domain | Resolver e testar períodos dos filtros |
| `ExcelExporter` | `utils/ExcelExporter.js` | infra | Serializar registros em SpreadsheetML |
| `ExportService` | `services/ExportService.js` | application | Coordenar downloads de CSV e Excel |
| `FilterBar` | `components/FilterBar.js` | interfaces | Controlar filtros globais |
| `Formatters` | `utils/Formatters.js` | interfaces | Formatar números, datas e duração |
| `FunnelPage` | `pages/FunnelPage.js` | interfaces | Coordenar a página de funil |
| `FunnelView` | `components/FunnelView.js` | interfaces | Renderizar funil completo ou compacto |
| `LoginPage` | `pages/LoginPage.js` | interfaces | Coordenar a tela de login |
| `MetricGrid` | `components/MetricGrid.js` | interfaces | Renderizar indicadores |
| `MetricsService` | `services/MetricsService.js` | application | Calcular indicadores, filtros e funil |
| `MockAnalyticsDataSource` | `services/MockAnalyticsDataSource.js` | infra | Fornecer dados demonstrativos |
| `OfflineState` | `components/OfflineState.js` | interfaces | Informar uso do snapshot offline |
| `PresenceService` | `services/PresenceService.js` | infra | Ler Presence no contexto administrativo |
| `RealtimeAnalyticsService` | `services/RealtimeAnalyticsService.js` | infra | Assinar novos eventos |
| `RuntimeConfigBuilder` | `scripts/configure-runtime.mjs` | infra | Gerar configuração pública no build |
| `SessionTable` | `components/SessionTable.js` | interfaces | Listar e selecionar sessões |
| `SessionTimeline` | `components/SessionTimeline.js` | interfaces | Exibir o caminho de uma sessão |
| `SessionsPage` | `pages/SessionsPage.js` | interfaces | Coordenar sessões e exportações |
| `SnapshotService` | `services/SnapshotService.js` | infra | Manter o último snapshot para uso offline |
| `SpreadsheetValueSanitizer` | `utils/SpreadsheetValueSanitizer.js` | infra | Neutralizar fórmulas em exportações |
| `StaticProjectValidator` | `scripts/validate-project.mjs` | infra | Validar build, referências, sintaxe e isolamento DEMO |
| `SupabaseClientFactory` | `services/SupabaseClientFactory.js` | infra | Carregar o SDK e criar cliente somente quando configurado |
| `ToastCenter` | `components/ToastCenter.js` | interfaces | Exibir notificações discretas |
