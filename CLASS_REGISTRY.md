# CLASS_REGISTRY

Catálogo de todas as classes do projeto BarberFlow.  
Atualizar sempre que uma classe for criada, renomeada ou removida.

**Legenda de camada**
- `model` — entidade de domínio pura, sem dependências externas
- `repository` — acesso a dados (ApiService / Supabase SDK)
- `service` — regras de negócio, nunca acessa banco diretamente
- `controller` — binding de eventos DOM, delega ao service
- `widget` — componente visual reutilizável (monta DOM próprio)
- `page` — gerencia uma tela específica do SPA
- `infra` — infraestrutura transversal (log, cache, router, validação)
- `ui` — utilitário de interface sem estado de negócio
- `sw` — Service Worker

---

## shared/js/

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `ApiQuery` | [shared/js/ApiService.js](shared/js/ApiService.js) | infra | Query builder thenable sobre fetch nativo (interno — use ApiService.from()) |
| `ApiService` | [shared/js/ApiService.js](shared/js/ApiService.js) | infra | Ponto único de acesso à API REST PostgREST. Substitui Supabase SDK para CRUD |
| `Agendamento` | [shared/js/Agendamento.js](shared/js/Agendamento.js) | model | Entidade de domínio de agendamento. Inclui validar(), estados (isPendente/isConfirmado/isCancelado/isConcluido) e isFuturo() |
| `AppointmentRepository` | [shared/js/AppointmentRepository.js](shared/js/AppointmentRepository.js) | repository | CRUD de agendamentos. Valida UUIDs e aplica allowlist de campos |
| `AppState` | [shared/js/AppState.js](shared/js/AppState.js) | infra | Estado global da aplicação compartilhado entre os dois apps |
| `AuthController` | [shared/js/AuthController.js](shared/js/AuthController.js) | controller | Binding dos formulários de login, cadastro e recuperação de senha |
| `AuthService` | [shared/js/AuthService.js](shared/js/AuthService.js) | service | Autenticação completa via Supabase Auth (login, cadastro, logout, perfil) |
| `BarbeariaPage` | [shared/js/BarbeariaPage.js](shared/js/BarbeariaPage.js) | page | Tela pública de detalhes de uma barbearia (serviços, portfólio, avaliação) |
| `BarberPole` | [shared/js/BarberPole.js](shared/js/BarberPole.js) | ui | Animação decorativa do poste de barbearia |
| `BarbershopRepository` | [shared/js/BarbershopRepository.js](shared/js/BarbershopRepository.js) | repository | CRUD de barbearias, interações (like/favorite), listagens por geolocalização |
| `BarbershopService` | [shared/js/BarbershopService.js](shared/js/BarbershopService.js) | service | Regras de negócio para barbearias: favoritos em cache, like/dislike, delegation |
| `CapaBarbearia` | [shared/js/CapaBarbearia.js](shared/js/CapaBarbearia.js) | ui | Upload e exibição da capa (cover) da barbearia |
| `DeviceCompass` | [shared/js/MapOrientationModule.js](shared/js/MapOrientationModule.js) | infra | Lê orientação do dispositivo via DeviceOrientationEvent |
| `DigText` | [shared/js/SearchWidget.js](shared/js/SearchWidget.js) | ui | Animação de digitação do placeholder do campo de busca |
| `FonteSalao` | [shared/js/FonteSalao.js](shared/js/FonteSalao.js) | ui | Seletor de fonte personalizada para o nome da barbearia |
| `FooterScrollManager` | [shared/js/FooterScrollManager.js](shared/js/FooterScrollManager.js) | ui | Oculta/exibe o footer conforme direção do scroll |
| `GeoService` | [shared/js/GeoService.js](shared/js/GeoService.js) | service | Geolocalização: GPS, CEP fallback, cálculo de distância |
| `GuardaIten` | [shared/js/GuardaIten.js](shared/js/GuardaIten.js) | infra | Guard de itens de menu/tela com base em role e estado do usuário |
| `GuestMode` | [shared/js/GuestMode.js](shared/js/GuestMode.js) | infra | Modo visitante — acesso parcial sem autenticação |
| `InputValidator` | [shared/js/InputValidator.js](shared/js/InputValidator.js) | infra | Validação e sanitização centralizada: email, senha, UUID, CPF, CNPJ, texto livre, payload allowlist |
| `LgpdService` | [shared/js/LgpdService.js](shared/js/LgpdService.js) | service | Gerencia consentimento LGPD do usuário (aceite de termos) |
| `LoggerService` | [shared/js/LoggerService.js](shared/js/LoggerService.js) | infra | Logger centralizado com níveis (debug/info/warn/error) e controle de ambiente |
| `LogoGlow` | [shared/js/LogoGlow.js](shared/js/LogoGlow.js) | ui | Efeito de brilho (glow) animado no logotipo |
| `LogoutScreen` | [shared/js/LogoutScreen.js](shared/js/LogoutScreen.js) | ui | Tela de confirmação e execução de logout |
| `MapBorderFrame` | [shared/js/MapPanelModule.js](shared/js/MapPanelModule.js) | ui | Borda decorativa do painel de mapa |
| `MapDragHandle` | [shared/js/MapPanelModule.js](shared/js/MapPanelModule.js) | ui | Alça de drag do painel de mapa |
| `MapHandleButton` | [shared/js/MapPanelModule.js](shared/js/MapPanelModule.js) | ui | Botão de ação no painel de mapa |
| `MapOrientationModule` | [shared/js/MapOrientationModule.js](shared/js/MapOrientationModule.js) | widget | Orquestra bússola + rotação + UI de orientação do mapa |
| `MapOrientationUI` | [shared/js/MapOrientationModule.js](shared/js/MapOrientationModule.js) | ui | Indicador visual da orientação do mapa |
| `MapPanel` | [shared/js/MapPanelModule.js](shared/js/MapPanelModule.js) | widget | Painel deslizante que exibe resultados sobre o mapa |
| `MapRotationController` | [shared/js/MapOrientationModule.js](shared/js/MapOrientationModule.js) | infra | Controla a rotação do mapa conforme heading do dispositivo |
| `MapTextAnimation` | [shared/js/MapPanelModule.js](shared/js/MapPanelModule.js) | ui | Animação de texto no painel do mapa |
| `MapWidget` | [shared/js/MapWidget.js](shared/js/MapWidget.js) | widget | Mapa interativo com marcadores de barbearias (Leaflet) |
| `MediaP2P` | [shared/js/MediaP2P.js](shared/js/MediaP2P.js) | service | Upload e exibição de mídia (portfólio, stories) via Supabase Storage |
| `MessageService` | [shared/js/MessageService.js](shared/js/MessageService.js) | service | Mensagens em tempo real via Supabase Realtime |
| `MessagesWidget` | [shared/js/MessagesWidget.js](shared/js/MessagesWidget.js) | widget | Listagem e envio de mensagens na UI |
| `NavConfig` | [shared/js/NavConfig.js](shared/js/NavConfig.js) | infra | Configuração de rotas e itens de navegação do SPA |
| `NavigationViewService` | [shared/js/NavigationViewService.js](shared/js/NavigationViewService.js) | service | Gerencia visibilidade da barra de navegação e transições de tela |
| `NearbyBarbershopsWidget` | [shared/js/NearbyBarbershopsWidget.js](shared/js/NearbyBarbershopsWidget.js) | widget | Lista de barbearias próximas com cards e ação de favoritar |
| `NotificationService` | [shared/js/NotificationService.js](shared/js/NotificationService.js) | service | Notificações push e in-app via Supabase Realtime |
| `PaymentFlowHandler` | [shared/js/PaymentFlowHandler.js](shared/js/PaymentFlowHandler.js) | service | Fluxo de pagamento: validação, redirecionamento, confirmação |
| `PerfilEditor` | [shared/js/PerfilEditor.js](shared/js/PerfilEditor.js) | ui | Edição inline de campos do perfil com persistência via ProfileRepository |
| `ProfileRepository` | [shared/js/ProfileRepository.js](shared/js/ProfileRepository.js) | repository | CRUD de perfis, favoritos de barbearias e barbeiros, upload de avatar |
| `ProfessionalService` | [shared/js/ProfessionalService.js](shared/js/ProfessionalService.js) | service | Regras de negócio para profissionais: likes em cache, listing, filtros |
| `ProLandingGate` | [shared/js/ProLandingGate.js](shared/js/ProLandingGate.js) | infra | Guard de landing do app profissional (monetização/plano) |
| `QueueRepository` | [shared/js/QueueRepository.js](shared/js/QueueRepository.js) | repository | CRUD de fila de atendimento e cadeiras. Realtime via Supabase SDK |
| `Router` | [shared/js/Router.js](shared/js/Router.js) | infra | Roteador SPA base. Gerencia navegação entre telas e estado do footer |
| `SearchWidget` | [shared/js/SearchWidget.js](shared/js/SearchWidget.js) | widget | Campo de busca de barbearias com autocomplete e animação de placeholder |
| `SessionCache` | [shared/js/SessionCache.js](shared/js/SessionCache.js) | infra | Cache de sessão em memória para dados do usuário logado |
| `StoriesCarousel` | [shared/js/StoriesLayout.js](shared/js/StoriesLayout.js) | ui | Carrossel de stories no estilo Instagram |
| `StoriesLayout` | [shared/js/StoriesLayout.js](shared/js/StoriesLayout.js) | widget | Layout e renderização de stories de barbearias |
| `StoryProgressLayer` | [shared/js/StoryViewer.js](shared/js/StoryViewer.js) | ui | Barra de progresso dos stories |
| `StorySwipeTransition` | [shared/js/StoryViewer.js](shared/js/StoryViewer.js) | ui | Transição de swipe entre stories |
| `StoryViewer` | [shared/js/StoryViewer.js](shared/js/StoryViewer.js) | widget | Visualizador de stories com controles de navegação e progresso |
| `SupabaseService` | [shared/js/SupabaseService.js](shared/js/SupabaseService.js) | infra | Wrapper do Supabase SDK. Restrito a Auth, Realtime e Storage (CRUD migrado para ApiService) |

---

## apps/cliente/assets/js/

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `BarberFlowCliente` | [apps/cliente/assets/js/app.js](apps/cliente/assets/js/app.js) | infra | App raiz do cliente. Estende Router, instancia Pages, orquestra navegação |
| `AppBootstrap` | [apps/cliente/assets/js/AppBootstrap.js](apps/cliente/assets/js/AppBootstrap.js) | infra | Inicialização do app cliente: autenticação, SW, splash |
| `Cliente` | [shared/js/Cliente.js](shared/js/Cliente.js) | model | Entidade de domínio do cliente. Encapsula dados do perfil (role='client'). Inclui validar(), nomeCompleto(), possuiLocalizacao() |
| `ClienteController` | [apps/cliente/assets/js/ClienteController.js](apps/cliente/assets/js/ClienteController.js) | controller | Binding de formulários e botões do perfil cliente. Delega ao ClienteService |
| `ClienteRepository` | [apps/cliente/assets/js/ClienteRepository.js](apps/cliente/assets/js/ClienteRepository.js) | repository | Acesso a dados do cliente em profiles com filtro role='client'. Valida UUIDs e allowlist |
| `ClienteService` | [apps/cliente/assets/js/ClienteService.js](apps/cliente/assets/js/ClienteService.js) | service | Regras de negócio do cliente: carregar perfil (com cache), atualizar, favoritos, histórico |
| `BarbeariasPage` | [apps/cliente/assets/js/pages/BarbeariasPage.js](apps/cliente/assets/js/pages/BarbeariasPage.js) | page | Tela de listagem de barbearias no app cliente |
| `BarbeirosPage` | [apps/cliente/assets/js/pages/BarbeirosPage.js](apps/cliente/assets/js/pages/BarbeirosPage.js) | page | Tela de listagem de barbeiros no app cliente |
| `DestaquesPage` | [apps/cliente/assets/js/pages/DestaquesPage.js](apps/cliente/assets/js/pages/DestaquesPage.js) | page | Tela de destaques (stories, barbearias em destaque) no app cliente |
| `FavoritesPage` | [apps/cliente/assets/js/pages/FavoritesPage.js](apps/cliente/assets/js/pages/FavoritesPage.js) | page | Tela de favoritos do cliente |
| `ForgotPasswordPage` | [apps/cliente/assets/js/pages/ForgotPasswordPage.js](apps/cliente/assets/js/pages/ForgotPasswordPage.js) | page | Tela de recuperação de senha |
| `HomePage` | [apps/cliente/assets/js/pages/HomePage.js](apps/cliente/assets/js/pages/HomePage.js) | page | Tela inicial do app cliente (mapa, barbearias próximas) |
| `LoginPage` | [apps/cliente/assets/js/pages/LoginPage.js](apps/cliente/assets/js/pages/LoginPage.js) | page | Tela de login do app cliente |
| `LogoutPage` | [apps/cliente/assets/js/pages/LogoutPage.js](apps/cliente/assets/js/pages/LogoutPage.js) | page | Tela de logout |
| `MessagesPage` | [apps/cliente/assets/js/pages/MessagesPage.js](apps/cliente/assets/js/pages/MessagesPage.js) | page | Tela de mensagens do cliente |
| `ProfilePage` | [apps/cliente/assets/js/pages/ProfilePage.js](apps/cliente/assets/js/pages/ProfilePage.js) | page | Tela de perfil do cliente: edição inline e upload de avatar |
| `RegisterPage` | [apps/cliente/assets/js/pages/RegisterPage.js](apps/cliente/assets/js/pages/RegisterPage.js) | page | Tela de cadastro de novo cliente |
| `SearchPage` | [apps/cliente/assets/js/pages/SearchPage.js](apps/cliente/assets/js/pages/SearchPage.js) | page | Tela de busca de barbearias |

---

## apps/profissional/assets/js/

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `MonetizationGuard` | [apps/profissional/assets/js/MonetizationGuard.js](apps/profissional/assets/js/MonetizationGuard.js) | infra | Guard de monetização: persiste tipo de usuário e plano em sessionStorage, exige plano para acesso a funcionalidades Pro |
| `BarberFlowProfissional` | [apps/profissional/assets/js/app.js](apps/profissional/assets/js/app.js) | infra | App raiz do profissional. Estende Router, orquestra Pages e navegação |
| `AppBootstrap` | [apps/profissional/assets/js/AppBootstrap.js](apps/profissional/assets/js/AppBootstrap.js) | infra | Inicialização do app profissional: autenticação, SW, splash |
| `LegalConsentService` | [apps/profissional/assets/js/LegalConsentService.js](apps/profissional/assets/js/LegalConsentService.js) | service | Gerencia aceite de termos legais (LGPD + T&C). Inclui processarAceite() — ponto único de decisão: usuário logado registra no banco, pré-cadastro salva como pendente |
| `PlanosService` | [apps/profissional/assets/js/PlanosService.js](apps/profissional/assets/js/PlanosService.js) | service | Regras de negócio para seleção de planos: selecionarTipo() e iniciarFluxo(). Delega ao MonetizationGuard e PaymentFlowHandler |
| `CadastroController` | [apps/profissional/assets/js/controllers/CadastroController.js](apps/profissional/assets/js/controllers/CadastroController.js) | controller | Binding do formulário de cadastro do profissional |
| `PlanosController` | [apps/profissional/assets/js/controllers/PlanosController.js](apps/profissional/assets/js/controllers/PlanosController.js) | controller | Binding da tela de seleção de plano |
| `TermosController` | [apps/profissional/assets/js/controllers/TermosController.js](apps/profissional/assets/js/controllers/TermosController.js) | controller | Binding da tela de termos legais |
| `AgendaPage` | [apps/profissional/assets/js/pages/AgendaPage.js](apps/profissional/assets/js/pages/AgendaPage.js) | page | Tela de agenda do profissional: hoje/amanhã/semana/mês, atualização de status |
| `BarbeariasPage` | [apps/profissional/assets/js/pages/BarbeariasPage.js](apps/profissional/assets/js/pages/BarbeariasPage.js) | page | Tela de listagem de barbearias no app profissional |
| `BarbeirosPage` | [apps/profissional/assets/js/pages/BarbeirosPage.js](apps/profissional/assets/js/pages/BarbeirosPage.js) | page | Tela de listagem de barbeiros no app profissional |
| `CriarBarbeariaPage` | [apps/profissional/assets/js/pages/CriarBarbeariaPage.js](apps/profissional/assets/js/pages/CriarBarbeariaPage.js) | page | Wizard de criação de barbearia pelo profissional |
| `DestaquesPage` | [apps/profissional/assets/js/pages/DestaquesPage.js](apps/profissional/assets/js/pages/DestaquesPage.js) | page | Tela de destaques no app profissional |
| `FinancasPage` | [apps/profissional/assets/js/pages/FinancasPage.js](apps/profissional/assets/js/pages/FinancasPage.js) | page | Tela de finanças: resumo de transações e receita |
| `GpsPage` | [apps/profissional/assets/js/pages/GpsPage.js](apps/profissional/assets/js/pages/GpsPage.js) | page | Tela de configuração de localização GPS da barbearia |
| `MinhaBarbeariaPage` | [apps/profissional/assets/js/pages/MinhaBarbeariaPage.js](apps/profissional/assets/js/pages/MinhaBarbeariaPage.js) | page | Tela de gerenciamento da barbearia própria (serviços, mídias, configurações) |
| `ParceriasPage` | [apps/profissional/assets/js/pages/ParceriasPage.js](apps/profissional/assets/js/pages/ParceriasPage.js) | page | Tela de parcerias disponíveis para o profissional |
| `QueueWidget` | [apps/profissional/assets/js/pages/QueueWidget.js](apps/profissional/assets/js/pages/QueueWidget.js) | widget | Fila de atendimento em tempo real com cadeiras e status |
