# CLASS_REGISTRY

Catálogo de todas as classes do projeto BarberFlow.  
Atualizar sempre que uma classe for criada, renomeada ou removida.

**Legenda de camada (taxonomia DDD)**
- `domain` — entidade de domínio pura, sem dependências externas (ex.: `Cliente`, `Agendamento`)
- `application` — regras de negócio e orquestração; nunca acessa banco diretamente (ex.: `AuthService`, `PlanosService`)
- `infra` — infraestrutura transversal: acesso a dados, roteamento, cache, log, validação, guards (ex.: `ApiService`, `*Repository`, `Router`)
- `interfaces` — binding DOM, telas e componentes visuais; nunca contém regra de negócio (ex.: controllers, pages, widgets, ui helpers)

> **Casos limítrofes documentados:**
> - `NavigationViewService` → `interfaces` (manipula DOM extensivamente apesar do sufixo "Service")
> - `MonetizationGuard` → `infra` (guard de sessão transversal, sem regra de negócio)
> - `MapRotationController` → `infra` (controla estado de hardware/orientação, não UI)

---

## shared/js/

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `ApiQuery` | [shared/js/ApiService.js](shared/js/ApiService.js) | infra | Query builder thenable sobre fetch nativo (interno — use ApiService.from()) |
| `ApiService` | [shared/js/ApiService.js](shared/js/ApiService.js) | infra | Ponto único de acesso à API REST PostgREST. Substitui Supabase SDK para CRUD |
| `Agendamento` | [shared/js/Agendamento.js](shared/js/Agendamento.js) | domain | Entidade de domínio de agendamento. Inclui validar(), estados (isPendente/isConfirmado/isCancelado/isConcluido) e isFuturo() |
| `AppointmentRepository` | [shared/js/AppointmentRepository.js](shared/js/AppointmentRepository.js) | infra | CRUD de agendamentos. Valida UUIDs e aplica allowlist de campos |
| `AppState` | [shared/js/AppState.js](shared/js/AppState.js) | infra | Estado global da aplicação compartilhado entre os dois apps |
| `AuthController` | [shared/js/AuthController.js](shared/js/AuthController.js) | interfaces | Binding dos formulários de login, cadastro e recuperação de senha |
| `AuthService` | [shared/js/AuthService.js](shared/js/AuthService.js) | application | Autenticação completa via Supabase Auth (login, cadastro, logout, perfil) |
| `BarbeariaPage` | [shared/js/BarbeariaPage.js](shared/js/BarbeariaPage.js) | interfaces | Tela pública de detalhes de uma barbearia (serviços, portfólio, avaliação) |
| `BarberPole` | [shared/js/BarberPole.js](shared/js/BarberPole.js) | interfaces | Animação decorativa do poste de barbearia |
| `BarbershopRepository` | [shared/js/BarbershopRepository.js](shared/js/BarbershopRepository.js) | infra | CRUD de barbearias, interações (like/favorite), listagens por geolocalização |
| `BarbershopService` | [shared/js/BarbershopService.js](shared/js/BarbershopService.js) | application | Regras de negócio para barbearias: favoritos em cache, like/dislike, delegation |
| `CapaBarbearia` | [shared/js/CapaBarbearia.js](shared/js/CapaBarbearia.js) | interfaces | Upload e exibição da capa (cover) da barbearia |
| `DeviceCompass` | [shared/js/MapOrientationModule.js](shared/js/MapOrientationModule.js) | infra | Lê orientação do dispositivo via DeviceOrientationEvent |
| `DigText` | [shared/js/SearchWidget.js](shared/js/SearchWidget.js) | interfaces | Animação de digitação do placeholder do campo de busca |
| `FonteSalao` | [shared/js/FonteSalao.js](shared/js/FonteSalao.js) | interfaces | Seletor de fonte personalizada para o nome da barbearia |
| `FooterScrollManager` | [shared/js/FooterScrollManager.js](shared/js/FooterScrollManager.js) | interfaces | Oculta/exibe o footer conforme direção do scroll |
| `GeoService` | [shared/js/GeoService.js](shared/js/GeoService.js) | application | Geolocalização: GPS, CEP fallback, cálculo de distância |
| `GuardaIten` | [shared/js/GuardaIten.js](shared/js/GuardaIten.js) | infra | Guard de itens de menu/tela com base em role e estado do usuário |
| `GuestMode` | [shared/js/GuestMode.js](shared/js/GuestMode.js) | infra | Modo visitante — acesso parcial sem autenticação |
| `InputValidator` | [shared/js/InputValidator.js](shared/js/InputValidator.js) | infra | Validação e sanitização centralizada: email, senha, UUID, CPF, CNPJ, texto livre, payload allowlist |
| `Validator` | [shared/js/InputValidator.js](shared/js/InputValidator.js) | infra | Alias público de `InputValidator`. Use `Validator.email()`, `Validator.telefone()`, `Validator.escaparFiltroPostgREST()` etc. |
| `LgpdService` | [shared/js/LgpdService.js](shared/js/LgpdService.js) | application | Gerencia consentimento LGPD do usuário (aceite de termos) |
| `LoggerService` | [shared/js/LoggerService.js](shared/js/LoggerService.js) | infra | Logger centralizado com níveis (debug/info/warn/error) e controle de ambiente |
| `LogoGlow` | [shared/js/LogoGlow.js](shared/js/LogoGlow.js) | interfaces | Efeito de brilho (glow) animado no logotipo |
| `LogoutScreen` | [shared/js/LogoutScreen.js](shared/js/LogoutScreen.js) | interfaces | Tela de confirmação e execução de logout |
| `MapBorderFrame` | [shared/js/MapPanelModule.js](shared/js/MapPanelModule.js) | interfaces | Borda decorativa do painel de mapa |
| `MapDragHandle` | [shared/js/MapPanelModule.js](shared/js/MapPanelModule.js) | interfaces | Alça de drag do painel de mapa |
| `MapHandleButton` | [shared/js/MapPanelModule.js](shared/js/MapPanelModule.js) | interfaces | Botão de ação no painel de mapa |
| `MapOrientationModule` | [shared/js/MapOrientationModule.js](shared/js/MapOrientationModule.js) | interfaces | Orquestra bússola + rotação + UI de orientação do mapa |
| `MapOrientationUI` | [shared/js/MapOrientationModule.js](shared/js/MapOrientationModule.js) | interfaces | Indicador visual da orientação do mapa |
| `MapPanel` | [shared/js/MapPanelModule.js](shared/js/MapPanelModule.js) | interfaces | Painel deslizante que exibe resultados sobre o mapa |
| `MapRotationController` | [shared/js/MapOrientationModule.js](shared/js/MapOrientationModule.js) | infra | Controla a rotação do mapa conforme heading do dispositivo |
| `MapTextAnimation` | [shared/js/MapPanelModule.js](shared/js/MapPanelModule.js) | interfaces | Animação de texto no painel do mapa |
| `MapWidget` | [shared/js/MapWidget.js](shared/js/MapWidget.js) | interfaces | Mapa interativo com marcadores de barbearias (Leaflet) |
| `MediaP2P` | [shared/js/MediaP2P.js](shared/js/MediaP2P.js) | application | Upload e exibição de mídia (portfólio, stories) via Supabase Storage |
| `MessageService` | [shared/js/MessageService.js](shared/js/MessageService.js) | application | Mensagens em tempo real via Supabase Realtime |
| `MessagesWidget` | [shared/js/MessagesWidget.js](shared/js/MessagesWidget.js) | interfaces | Listagem e envio de mensagens na UI |
| `NavConfig` | [shared/js/NavConfig.js](shared/js/NavConfig.js) | infra | Configuração de rotas e itens de navegação do SPA |
| `NavigationViewService` | [shared/js/NavigationViewService.js](shared/js/NavigationViewService.js) | interfaces | Gerencia visibilidade da barra de navegação e transições de tela (DOM-dependent) |
| `NearbyBarbershopsWidget` | [shared/js/NearbyBarbershopsWidget.js](shared/js/NearbyBarbershopsWidget.js) | interfaces | Lista de barbearias próximas com cards e ação de favoritar |
| `NotificationService` | [shared/js/NotificationService.js](shared/js/NotificationService.js) | application | Notificações push e in-app via Supabase Realtime |
| `PaymentFlowHandler` | [shared/js/PaymentFlowHandler.js](shared/js/PaymentFlowHandler.js) | application | Fluxo de pagamento: validação, redirecionamento, confirmação |
| `PerfilEditor` | [shared/js/PerfilEditor.js](shared/js/PerfilEditor.js) | interfaces | Edição inline de campos do perfil com persistência via ProfileRepository |
| `ProfileRepository` | [shared/js/ProfileRepository.js](shared/js/ProfileRepository.js) | infra | CRUD de perfis, favoritos de barbearias e barbeiros, upload de avatar |
| `ProfessionalService` | [shared/js/ProfessionalService.js](shared/js/ProfessionalService.js) | application | Regras de negócio para profissionais: likes em cache, listing, filtros |
| `ProLandingGate` | [shared/js/ProLandingGate.js](shared/js/ProLandingGate.js) | infra | Guard de landing do app profissional (monetização/plano) |
| `QueueRepository` | [shared/js/QueueRepository.js](shared/js/QueueRepository.js) | infra | CRUD de fila de atendimento e cadeiras. Realtime via Supabase SDK |
| `Router` | [shared/js/Router.js](shared/js/Router.js) | infra | Roteador SPA base. Gerencia navegação entre telas e estado do footer |
| `SearchWidget` | [shared/js/SearchWidget.js](shared/js/SearchWidget.js) | interfaces | Campo de busca de barbearias com autocomplete e animação de placeholder |
| `SessionCache` | [shared/js/SessionCache.js](shared/js/SessionCache.js) | infra | Cache de sessão em memória para dados do usuário logado |
| `StoriesCarousel` | [shared/js/StoriesLayout.js](shared/js/StoriesLayout.js) | interfaces | Carrossel de stories no estilo Instagram |
| `StoriesLayout` | [shared/js/StoriesLayout.js](shared/js/StoriesLayout.js) | interfaces | Layout e renderização de stories de barbearias |
| `StoryProgressLayer` | [shared/js/StoryViewer.js](shared/js/StoryViewer.js) | interfaces | Barra de progresso dos stories |
| `StorySwipeTransition` | [shared/js/StoryViewer.js](shared/js/StoryViewer.js) | interfaces | Transição de swipe entre stories |
| `StoryViewer` | [shared/js/StoryViewer.js](shared/js/StoryViewer.js) | interfaces | Visualizador de stories com controles de navegação e progresso |
| `SupabaseService` | [shared/js/SupabaseService.js](shared/js/SupabaseService.js) | infra | Wrapper do Supabase SDK. Restrito a Auth, Realtime e Storage (CRUD migrado para ApiService) |

---

## apps/cliente/assets/js/

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `BarberFlowCliente` | [apps/cliente/assets/js/app.js](apps/cliente/assets/js/app.js) | infra | App raiz do cliente. Estende Router, instancia Pages, orquestra navegação |
| `AppBootstrap` | [apps/cliente/assets/js/AppBootstrap.js](apps/cliente/assets/js/AppBootstrap.js) | infra | Inicialização do app cliente: autenticação, SW, splash |
| `Cliente` | [shared/js/Cliente.js](shared/js/Cliente.js) | domain | Entidade de domínio do cliente. Encapsula dados do perfil (role='client'). Inclui validar(), nomeCompleto(), possuiLocalizacao() |
| `ClienteController` | [apps/cliente/assets/js/ClienteController.js](apps/cliente/assets/js/ClienteController.js) | interfaces | Binding de formulários e botões do perfil cliente. Delega ao ClienteService |
| `ClienteRepository` | [apps/cliente/assets/js/ClienteRepository.js](apps/cliente/assets/js/ClienteRepository.js) | infra | Acesso a dados do cliente em profiles com filtro role='client'. Valida UUIDs e allowlist |
| `ClienteService` | [apps/cliente/assets/js/ClienteService.js](apps/cliente/assets/js/ClienteService.js) | application | Regras de negócio do cliente: carregar perfil (com cache), atualizar, favoritos, histórico |
| `BarbeariasPage` | [apps/cliente/assets/js/pages/BarbeariasPage.js](apps/cliente/assets/js/pages/BarbeariasPage.js) | interfaces | Tela de listagem de barbearias no app cliente |
| `BarbeirosPage` | [apps/cliente/assets/js/pages/BarbeirosPage.js](apps/cliente/assets/js/pages/BarbeirosPage.js) | interfaces | Tela de listagem de barbeiros no app cliente |
| `DestaquesPage` | [apps/cliente/assets/js/pages/DestaquesPage.js](apps/cliente/assets/js/pages/DestaquesPage.js) | interfaces | Tela de destaques (stories, barbearias em destaque) no app cliente |
| `FavoritesPage` | [apps/cliente/assets/js/pages/FavoritesPage.js](apps/cliente/assets/js/pages/FavoritesPage.js) | interfaces | Tela de favoritos do cliente |
| `ForgotPasswordPage` | [apps/cliente/assets/js/pages/ForgotPasswordPage.js](apps/cliente/assets/js/pages/ForgotPasswordPage.js) | interfaces | Tela de recuperação de senha |
| `HomePage` | [apps/cliente/assets/js/pages/HomePage.js](apps/cliente/assets/js/pages/HomePage.js) | interfaces | Tela inicial do app cliente (mapa, barbearias próximas) |
| `LoginPage` | [apps/cliente/assets/js/pages/LoginPage.js](apps/cliente/assets/js/pages/LoginPage.js) | interfaces | Tela de login do app cliente |
| `LogoutPage` | [apps/cliente/assets/js/pages/LogoutPage.js](apps/cliente/assets/js/pages/LogoutPage.js) | interfaces | Tela de logout |
| `MessagesPage` | [apps/cliente/assets/js/pages/MessagesPage.js](apps/cliente/assets/js/pages/MessagesPage.js) | interfaces | Tela de mensagens do cliente |
| `ProfilePage` | [apps/cliente/assets/js/pages/ProfilePage.js](apps/cliente/assets/js/pages/ProfilePage.js) | interfaces | Tela de perfil do cliente: edição inline e upload de avatar |
| `RegisterPage` | [apps/cliente/assets/js/pages/RegisterPage.js](apps/cliente/assets/js/pages/RegisterPage.js) | interfaces | Tela de cadastro de novo cliente |
| `SearchPage` | [apps/cliente/assets/js/pages/SearchPage.js](apps/cliente/assets/js/pages/SearchPage.js) | interfaces | Tela de busca de barbearias |

---

## apps/profissional/assets/js/

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `MonetizationGuard` | [apps/profissional/assets/js/MonetizationGuard.js](apps/profissional/assets/js/MonetizationGuard.js) | infra | Guard de monetização: persiste tipo de usuário e plano em sessionStorage, exige plano para acesso a funcionalidades Pro |
| `BarberFlowProfissional` | [apps/profissional/assets/js/app.js](apps/profissional/assets/js/app.js) | infra | App raiz do profissional. Estende Router, orquestra Pages e navegação |
| `AppBootstrap` | [apps/profissional/assets/js/AppBootstrap.js](apps/profissional/assets/js/AppBootstrap.js) | infra | Inicialização do app profissional: autenticação, SW, splash |
| `LegalConsentService` | [apps/profissional/assets/js/LegalConsentService.js](apps/profissional/assets/js/LegalConsentService.js) | application | Gerencia aceite de termos legais (LGPD + T&C). Inclui processarAceite() — ponto único de decisão: usuário logado registra no banco, pré-cadastro salva como pendente |
| `PlanosService` | [apps/profissional/assets/js/PlanosService.js](apps/profissional/assets/js/PlanosService.js) | application | Regras de negócio para seleção de planos: selecionarTipo() e iniciarFluxo(). Delega ao MonetizationGuard e PaymentFlowHandler |
| `CadastroController` | [apps/profissional/assets/js/controllers/CadastroController.js](apps/profissional/assets/js/controllers/CadastroController.js) | interfaces | Binding do formulário de cadastro do profissional |
| `PlanosController` | [apps/profissional/assets/js/controllers/PlanosController.js](apps/profissional/assets/js/controllers/PlanosController.js) | interfaces | Binding da tela de seleção de plano |
| `TermosController` | [apps/profissional/assets/js/controllers/TermosController.js](apps/profissional/assets/js/controllers/TermosController.js) | interfaces | Binding da tela de termos legais |
| `AgendaPage` | [apps/profissional/assets/js/pages/AgendaPage.js](apps/profissional/assets/js/pages/AgendaPage.js) | interfaces | Tela de agenda do profissional: hoje/amanhã/semana/mês, atualização de status |
| `BarbeariasPage` | [apps/profissional/assets/js/pages/BarbeariasPage.js](apps/profissional/assets/js/pages/BarbeariasPage.js) | interfaces | Tela de listagem de barbearias no app profissional |
| `BarbeirosPage` | [apps/profissional/assets/js/pages/BarbeirosPage.js](apps/profissional/assets/js/pages/BarbeirosPage.js) | interfaces | Tela de listagem de barbeiros no app profissional |
| `CriarBarbeariaPage` | [apps/profissional/assets/js/pages/CriarBarbeariaPage.js](apps/profissional/assets/js/pages/CriarBarbeariaPage.js) | interfaces | Wizard de criação de barbearia pelo profissional |
| `DestaquesPage` | [apps/profissional/assets/js/pages/DestaquesPage.js](apps/profissional/assets/js/pages/DestaquesPage.js) | interfaces | Tela de destaques no app profissional |
| `FinancasPage` | [apps/profissional/assets/js/pages/FinancasPage.js](apps/profissional/assets/js/pages/FinancasPage.js) | interfaces | Tela de finanças: resumo de transações e receita |
| `GpsPage` | [apps/profissional/assets/js/pages/GpsPage.js](apps/profissional/assets/js/pages/GpsPage.js) | interfaces | Tela de configuração de localização GPS da barbearia |
| `MinhaBarbeariaPage` | [apps/profissional/assets/js/pages/MinhaBarbeariaPage.js](apps/profissional/assets/js/pages/MinhaBarbeariaPage.js) | interfaces | Tela de gerenciamento da barbearia própria (serviços, mídias, configurações) |
| `ParceriasPage` | [apps/profissional/assets/js/pages/ParceriasPage.js](apps/profissional/assets/js/pages/ParceriasPage.js) | interfaces | Tela de parcerias disponíveis para o profissional |
| `QueueWidget` | [apps/profissional/assets/js/pages/QueueWidget.js](apps/profissional/assets/js/pages/QueueWidget.js) | interfaces | Fila de atendimento em tempo real com cadeiras e status |
