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
| `Agendamento` | [shared/js/Agendamento.js](shared/js/Agendamento.js) | domain | Entidade de domínio de agendamento. Inclui validar(), estados (isPendente/isConfirmado/isEmAndamento/isCancelado/isConcluido/isNoShow) e isFuturo() |
| `Barbearia` | [shared/js/Barbearia.js](shared/js/Barbearia.js) | domain | Entidade de domínio de barbearia. Inclui validar(), possuiLocalizacao(), isAtiva(), toJSON() |
| `Profissional` | [shared/js/Profissional.js](shared/js/Profissional.js) | domain | Entidade de domínio de profissional. Roles: barber/owner/manager. Inclui validar(), isAtivo(), isOwner(), isManager(), isBarber(), toJSON() |
| `Servico` | [shared/js/Servico.js](shared/js/Servico.js) | domain | Entidade de domínio de serviço/tratamento. Inclui validar(), isAtivo(), temPreco(), toJSON() |
| `AppointmentRepository` | [shared/js/AppointmentRepository.js](shared/js/AppointmentRepository.js) | infra | CRUD de agendamentos. Valida UUIDs e aplica allowlist de campos |
| `AppState` | [shared/js/AppState.js](shared/js/AppState.js) | infra | Estado global da aplicação compartilhado entre os dois apps |
| `AuthController` | [shared/js/AuthController.js](shared/js/AuthController.js) | interfaces | Binding dos formulários de login, cadastro e recuperação de senha |
| `AuthService` | [shared/js/AuthService.js](shared/js/AuthService.js) | application | Autenticação completa via Supabase Auth (login, cadastro, logout, perfil) |
| `BarbeariaPage` | [shared/js/BarbeariaPage.js](shared/js/BarbeariaPage.js) | interfaces | Tela pública de detalhes de uma barbearia (serviços, portfólio, avaliação) |
| `BarbeiroPage` | [shared/js/BarbeiroPage.js](shared/js/BarbeiroPage.js) | interfaces | Tela de perfil público de um barbeiro/profissional (avatar, rating, bio) |
| `BarberPole` | [shared/js/BarberPole.js](shared/js/BarberPole.js) | interfaces | Animação decorativa do poste de barbearia |
| `BarbershopRepository` | [shared/js/BarbershopRepository.js](shared/js/BarbershopRepository.js) | infra | CRUD de barbearias, interações (like/favorite), listagens por geolocalização |
| `BarbershopService` | [shared/js/BarbershopService.js](shared/js/BarbershopService.js) | application | Regras de negócio para barbearias: favoritos em cache, like/dislike, delegation |
| `CacheManager` | [shared/js/CacheManager.js](shared/js/CacheManager.js) | infra | Cache em memória com TTL e limpeza por escopo (clearScope). Evita stale data ao trocar de contexto. |
| `CapaBarbearia` | [shared/js/CapaBarbearia.js](shared/js/CapaBarbearia.js) | interfaces | Upload e exibição da capa (cover) da barbearia |
| `DeviceCompass` | [shared/js/MapOrientationModule.js](shared/js/MapOrientationModule.js) | infra | Lê orientação do dispositivo via DeviceOrientationEvent |
| `DigText` | [shared/js/SearchWidget.js](shared/js/SearchWidget.js) | interfaces | Animação de digitação do placeholder do campo de busca |
| `FonteSalao` | [shared/js/FonteSalao.js](shared/js/FonteSalao.js) | interfaces | Seletor de fonte personalizada para o nome da barbearia |
| `FooterScrollManager` | [shared/js/FooterScrollManager.js](shared/js/FooterScrollManager.js) | interfaces | Oculta/exibe o footer conforme direção do scroll |
| `HeaderScrollBehavior` | [shared/js/HeaderScrollBehavior.js](shared/js/HeaderScrollBehavior.js) | interfaces | Oculta header ao rolar conteúdo para baixo (quando stories-scroll toca o header), exibe ao rolar para cima |
| `GeoService` | [shared/js/GeoService.js](shared/js/GeoService.js) | application | Geolocalização: GPS, CEP fallback, cálculo de distância |
| `GuardaIten` | [shared/js/GuardaIten.js](shared/js/GuardaIten.js) | infra | Guard de itens de menu/tela com base em role e estado do usuário |
| `GuestMode` | [shared/js/GuestMode.js](shared/js/GuestMode.js) | infra | Modo visitante — acesso parcial sem autenticação |
| `DataProcessor` | [shared/js/DataProcessor.js](shared/js/DataProcessor.js) | infra | Pipeline de validação, sanitização e normalização de dados: `validateCPF`, `validateEmail`, `validatePhone`, `sanitizeInput`, `sanitizeOutput`, `normalizeData`, `processInput`, `processOutput`. Delega validação ao `InputValidator`. |
| `ResourceLoader` | [shared/js/ResourceLoader.js](shared/js/ResourceLoader.js) | infra | Carregamento de recursos com cache-busting (?v=timestamp). Métodos: loadImage, loadVideo, fetchData, invalidateBust. |
| `StateManager` | [shared/js/StateManager.js](shared/js/StateManager.js) | infra | Gerenciamento do contexto ativo (ex: barbearia aberta). Ao trocar contexto: invalida CacheManager.clearScope + ResourceLoader.invalidateBust. |
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
| `AvatarService` | [shared/js/AvatarService.js](shared/js/AvatarService.js) | application | Upload e exibição do avatar do usuário. Preview local com Blob URL + upload via BFF `/api/media/upload-image?contexto=avatars`. REMOVIDO: compressão canvas e upload direto ao Supabase Storage. API: preview(input), abrirUpload(router). |
| `LazyMediaLoader` | [shared/js/LazyMediaLoader.js](shared/js/LazyMediaLoader.js) | infra | Lazy loading de mídias via IntersectionObserver. Cascata de fontes: IndexedDB → P2P WebRTC → URL direta. Atributos HTML: data-lazy-src, data-lazy-media-id, data-lazy-mime, data-lazy-poster. Métodos estáticos: iniciar(raiz?), parar(), observar(el). |
| `MediaCacheService` | [shared/js/MediaCacheService.js](shared/js/MediaCacheService.js) | infra | Cache local de ArrayBuffers via IndexedDB (barberflow-media). TTL: 24h imagens, 1h vídeos/áudio. Índice síncrono em memória (#indices Map) para temCache() sem I/O. Métodos estáticos: salvar(mediaId, buffer, {mimeType, ttlMs}), obter(mediaId) → ArrayBuffer|null, temCache(mediaId) → boolean, limpar(maxAgeMs?) → contagem, suportado() → boolean. |
| `MediaP2P` | [shared/js/MediaP2P.js](shared/js/MediaP2P.js) | application | Upload e exibição de mídia (portfólio, stories) via Supabase Storage. ADICIONADO: streamVideo(url, videoEl, mime?) — streaming progressivo com MediaSource API, buffer inicial de 3s antes de autoplay. |
| `MessageService` | [shared/js/MessageService.js](shared/js/MessageService.js) | application | Mensagens em tempo real via Supabase Realtime |
| `MessagesWidget` | [shared/js/MessagesWidget.js](shared/js/MessagesWidget.js) | interfaces | Listagem e envio de mensagens na UI |
| `NavConfig` | [shared/js/NavConfig.js](shared/js/NavConfig.js) | infra | Configuração de rotas e itens de navegação do SPA |
| `NavigationManager` | [shared/js/NavigationManager.js](shared/js/NavigationManager.js) | infra | Navegação controlada com pré-carregamento. beforeNavigate inicia preload durante a animação; awaitPreload garante dados prontos antes da renderização. |
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
| `StatusFechamentoModal` | [shared/js/StatusFechamentoModal.js](shared/js/StatusFechamentoModal.js) | interfaces | Modal de confirmação de fechamento. Retorna `Promise<'normal'\|'almoco'\|'janta'\|null>`. Expõe helpers estáticos: `labelStatus(isOpen, closeReason)`, `classeStatus(...)`, `classBadge(...)`. Reutilizável em qualquer tela que precise do fluxo de fechamento. |
| `CadeiraService` | [shared/js/CadeiraService.js](shared/js/CadeiraService.js) | application | Lógica de negócio das cadeiras da fila: `getClientesConhecidos(barbershopId)`, `getFilaAtiva(barbershopId)`, `sentar({barbershopId,professionalId,clientId,serviceIds,tipo})`, `finalizar(entradaId,barbershopId)`. Despacha `barberflow:cadeira-atualizada`. |
| `ClienteSeletorModal` | [shared/js/ClienteSeletorModal.js](shared/js/ClienteSeletorModal.js) | interfaces | Modal de seleção de cliente a partir de lista. `static abrir(clientes)` → `Promise<clienteObj\|null>`. Lista com avatar, filtro inline por nome, teclado acessível. |
| `CorteModal` | [shared/js/CorteModal.js](shared/js/CorteModal.js) | interfaces | Modal de seleção de serviços/cortes por checkboxes. `static abrir({servicos,clienteNome})` → `Promise<serviceIds[]\|null>`. Total calculado em tempo real; confirmar desabilitado sem seleção. |
| `FinalizarCorteModal` | [shared/js/FinalizarCorteModal.js](shared/js/FinalizarCorteModal.js) | interfaces | Modal de confirmação de finalização de corte. `static abrir({clienteNome,proximoNome})` → `Promise<boolean>`. Exibe nome do cliente e próximo da fila (ou "Fila vazia"). |
| `BarbeiroCard` | [shared/js/BarbeiroCard.js](shared/js/BarbeiroCard.js) | interfaces | Card visual de barbeiro: avatar circular + nome + badge "Dono". `static criar({nome,avatarPath,updatedAt,isOwner})` e `static criarSkeleton()`. Sem eventos. |
| `Cadeira` | [shared/js/Cadeira.js](shared/js/Cadeira.js) | interfaces | Componente visual de cadeira com estados `livre`/`ocupada`/`em_producao`. Recebe `podeInteragir` e `onClick` — delega role validation ao chamador (SRP). |
| `FilaController` | [shared/js/FilaController.js](shared/js/FilaController.js) | application | Gerencia entrada do cliente na fila: calcula posição, chama `QueueRepository.entrar`, persiste serviços escolhidos. `static entrarNaFila({barbershopId,clientId,professionalId?,serviceIds?})`. Zero DOM. |
| `ModalController` | [shared/js/ModalController.js](shared/js/ModalController.js) | interfaces | Adapter de modais para contexto cliente: resolve nome via `AuthService.getPerfil()` e delega a `CorteModal.abrir`. `static abrirSelecaoServicos({servicos})` → `Promise<serviceIds[]\|null>`. |
| `ClienteController` | [shared/js/ClienteController.js](shared/js/ClienteController.js) | application | Valida role (`client`) e orquestra entrada na fila. `static podeInteragir()` e `static entrarNaFila({barbershopId,professionalId?,serviceIds?})`. Profissional visitante → false. |
| `PWAInstallBanner` | [shared/js/PWAInstallBanner.js](shared/js/PWAInstallBanner.js) | interfaces | Banner flutuante de instalação PWA. Aparece em `tela-inicio` sempre que app não está em standalone. `static iconSrc`, `static nomeApp`, `static init()`. Suporta Android (`beforeinstallprompt`) e iOS (instrução manual). |
| `StoriesCarousel` | [shared/js/StoriesLayout.js](shared/js/StoriesLayout.js) | interfaces | Carrossel de stories no estilo Instagram |
| `StoriesLayout` | [shared/js/StoriesLayout.js](shared/js/StoriesLayout.js) | interfaces | Layout e renderização de stories de barbearias |
| `StoryProgressLayer` | [shared/js/StoryViewer.js](shared/js/StoryViewer.js) | interfaces | Barra de progresso dos stories |
| `StorySwipeTransition` | [shared/js/StoryViewer.js](shared/js/StoryViewer.js) | interfaces | Transição de swipe entre stories |
| `StoryViewer` | [shared/js/StoryViewer.js](shared/js/StoryViewer.js) | interfaces | Visualizador de stories com controles de navegação e progresso |
| `SupabaseService` | [shared/js/SupabaseService.js](shared/js/SupabaseService.js) | infra | Wrapper do Supabase SDK. Restrito a Auth, Realtime e Storage (CRUD migrado para ApiService) |
| `WebRTCPeerService` | [shared/js/WebRTCPeerService.js](shared/js/WebRTCPeerService.js) | application | Transferência P2P browser-to-browser via WebRTC DataChannel. iceTransportPolicy:'relay' SEMPRE (IP nunca exposto). Sinalização via Supabase Realtime broadcast 'p2p-{mediaId}'. Máx 3 peers simultâneos. Timeout 15s em receber(). Métodos estáticos: suportado(), anunciar(mediaId), receber(mediaId, opts?) → ArrayBuffer|null, enviar(mediaId, buffer). Protocolo DataChannel: chunks 16KB + chunk vazio = EOF. |

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

---

## src/entities/ (Node.js — backend)

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `Agendamento` | [src/entities/Agendamento.js](src/entities/Agendamento.js) | domain | Espelho backend de shared/js/Agendamento.js. Inclui validar(), isEmAndamento(), isNoShow() e demais estados. |
| `Barbearia` | [src/entities/Barbearia.js](src/entities/Barbearia.js) | domain | Espelho backend de shared/js/Barbearia.js. Inclui validar(), isAtiva(), possuiLocalizacao(), toJSON(). |
| `Cliente` | [src/entities/Cliente.js](src/entities/Cliente.js) | domain | Espelho backend de shared/js/Cliente.js. Representa profiles (role=client). Inclui validar(), isAtivo(), nomeCompleto(), toJSON(). |
| `Profissional` | [src/entities/Profissional.js](src/entities/Profissional.js) | domain | Espelho backend de shared/js/Profissional.js. Inclui validar(), isAtivo(), isOwner(), isManager(), isBarber(), toJSON(). |
| `Servico` | [src/entities/Servico.js](src/entities/Servico.js) | domain | Espelho backend de shared/js/Servico.js. Inclui validar(), isAtivo(), temPreco(), toJSON(). |
| `User` | [src/entities/User.js](src/entities/User.js) | domain | Entidade do usuário autenticado (auth.users + role de profiles). Campo #passwordHash armazena apenas bcrypt hash. Inclui validar(), isAtivo(), isEmailVerificado(), hasRole(), isAdmin(). toJSON() nunca serializa o hash. |

## src/infra/ (Node.js — backend)

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `R2Client` | [src/infra/R2Client.js](src/infra/R2Client.js) | infra | Cliente Cloudflare R2 (S3-compatible). Singleton via getInstance(). Gera presigned PUT URLs para upload P2P direto browser→R2. Métodos: presignedPut(), presignedGet(), putBuffer(), getBuffer(), head(), delete(), publicUrl(). |
| `SupabaseStorageClient` | [src/infra/SupabaseStorageClient.js](src/infra/SupabaseStorageClient.js) | infra | Cliente Supabase Storage para imagens estáticas (avatars, services, portfolio). Bucket público com RLS nativa. Fluxo P2P: browser faz PUT direto via URL assinada. Fluxo server-side: upload() envia buffer diretamente do servidor (usado após ImageProcessor). Métodos: presignedPut(), head(), publicUrl(), delete(), upload(). Static: BUCKET_IMAGES. Constructor recebe instância supabase-js injetada. |
| `AuthMiddleware` | [src/infra/AuthMiddleware.js](src/infra/AuthMiddleware.js) | infra | Middleware JWT. Verificação local via TokenService.verificarSupabase() (zero latência) com fallback para rede se SUPABASE_JWT_SECRET ausente. Popula req.user = { id, email }. |
| `BaseRepository` | [src/infra/BaseRepository.js](src/infra/BaseRepository.js) | infra | Classe base para todos os repositórios backend. Fornece _validarUuid, _validarEmail, _validarPayload, _validarTexto, _validarCoordenada para eliminar duplicação do padrão InputValidator. |
| `BaseService` | [src/infra/BaseService.js](src/infra/BaseService.js) | infra | Classe base para todos os services backend. Fornece _uuid, _texto, _enum, _email, _nome, _telefone, _coordenada, _erro para eliminar duplicação do padrão InputValidator nos services. |
| `PasswordService` | [src/infra/PasswordService.js](src/infra/PasswordService.js) | infra | Hashing e validação de senhas com bcryptjs. validarForca() (síncrono), hash() e verificar() (assíncronos). NUNCA retorna senha original. Rounds configuráveis via BCRYPT_ROUNDS (padrão: 12). |
| `RateLimitMiddleware` | [src/infra/RateLimitMiddleware.js](src/infra/RateLimitMiddleware.js) | infra | Rate limiting por IP. Campos estáticos: geral (300/min), auth (10/15min), escrita (60/min), p2pAnnounce (30/min). Handler privado #onLimitReached. Responde 429. |
| `TurnConfig` | [src/infra/TurnConfig.js](src/infra/TurnConfig.js) | infra | Geração de credenciais TURN efêmeras HMAC-SHA1 (compatível coturn use-auth-secret). TTL 1h. TURN_SECRET nunca exposto ao cliente. Métodos estáticos: credenciais(userId) → {username, credential}, servidoresICE(userId) → {iceServers, expiresAt}. Lança Error se TURN_SECRET ausente. Env: TURN_URL, TURNS_URL, TURN_SECRET, STUN_URL. |
| `RequestTimeoutMiddleware` | [src/infra/RequestTimeoutMiddleware.js](src/infra/RequestTimeoutMiddleware.js) | infra | Timeout por requisição. Campo estático #TIMEOUT_MS (padrão 30s via env). handle() cancela timer no finish/close. Responde 503. |
| `RoleMiddleware` | [src/infra/RoleMiddleware.js](src/infra/RoleMiddleware.js) | infra | Autorização baseada em roles. Busca profiles.role no banco se não cacheado em req.user.role. exigir(...roles) para custom, shorthands .admin/.profissional/.cliente. _comSupabase(db, ...roles) para testes. 401/403/503. |
| `TokenService` | [src/infra/TokenService.js](src/infra/TokenService.js) | infra | Geração e verificação de JWTs customizados (access: 15min, refresh: 7d) + verificação local de tokens Supabase Auth sem chamada de rede (verificarSupabase). Algoritmo fixo HS256. |
| `ValidationMiddleware` | [src/infra/ValidationMiddleware.js](src/infra/ValidationMiddleware.js) | infra | Validação declarativa de inputs por schema. corpo()/params()/query() retornam middleware. Tipos: uuid, email, nome, telefone, texto (sanitiza), enum, numero, booleano. 400 com { ok, error, erros[] } ao falhar. |

## src/repositories/ (Node.js — backend)

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `RefreshTokenRepository` | [src/repositories/RefreshTokenRepository.js](src/repositories/RefreshTokenRepository.js) | infra | Armazenamento de refresh tokens customizados. Persiste apenas SHA-256 hash (nunca o token em claro). Métodos: salvar(), buscar(), revogar(), revogarTodos(). |

## src/services/ (Node.js — backend)

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `ChunkService` | [src/services/ChunkService.js](src/services/ChunkService.js) | application | Divisão e recomposição de buffers em chunks com SHA-256 por chunk. Delega geração e validação de hashes ao HashService (SRP). Valida hashes antes do merge (anti-adulteração). Métodos: split(), merge(). Usado em conjunto com EncryptionService. |
| `HashService` | [src/services/HashService.js](src/services/HashService.js) | application | Geração e validação de hashes SHA-256. `generateHash(buffer)` → hex string (64 chars). `validateHash(buffer, expected)` → lança se mismatch (fail-fast). `check(buffer, expected)` → boolean (sem throw). timingSafeEqual em todas as comparações (anti timing-attack). Usado pelo ChunkService para integridade de chunks. |
| `EncryptionService` | [src/services/EncryptionService.js](src/services/EncryptionService.js) | application | Criptografia simétrica autenticada AES-256-GCM. Chave e IV aleatórios por arquivo (zero reutilização). Métodos: encrypt(buffer) → EncryptedResult, decrypt(EncryptedResult) → Buffer. Falha loudly se authTag, key ou IV estiverem incorretos. |
| `MediaManager` | [src/services/MediaManager.js](src/services/MediaManager.js) | application | Sistema híbrido de mídia com roteamento por contexto: imagens (avatars/services/portfolio) → Supabase Storage; vídeos (stories) → Cloudflare R2; pipeline criptografado → R2 sempre. Integra EncryptionService, ChunkService, HashService, FallbackService, CacheService, PeerHealthService e SupabaseStorageClient. Métodos: uploadMedia(), downloadMedia(), gerarUrlPresigned(), confirmarUpload(), deletar(), listar(), publicUrl(), registrarImagemProcessada(). Constructor aceita opts: { peerHealth, cache, p2pUploader, p2pDownloader, supabaseStorage }. |
| `ImageProcessor` | [src/services/ImageProcessor.js](src/services/ImageProcessor.js) | application | Otimização de imagens para web server-side. Pipeline: validar Buffer → auto-rotate EXIF → crop 1:1 central → resize 200×200 → WebP (q70→60) ou JPG (q75→65) com redução progressiva até ≤20KB. Retorna { data: Buffer, format: 'webp'\|'jpg', bytes: number }. Métodos públicos: processAvatar(buffer), processIcon(buffer). Contextos de barbearia NUNCA passam por aqui. Dependência: sharp (produção). |
| `SecureMediaAccessService` | [src/services/SecureMediaAccessService.js](src/services/SecureMediaAccessService.js) | application | Acesso seguro a mídia privada (bucket R2 privado). Valida ownership antes de gerar URL. Métodos: validateAccess(userId, fileId), generateSignedUrl(fileId, userId). URL assinada de 60s — publicUrl() NUNCA chamado. |
| `ReplicationService` | [src/services/ReplicationService.js](src/services/ReplicationService.js) | application | Replicação inteligente baseada em volume de downloads. `registerDownload(fileId)` persiste evento em `file_download_events`. `decideStrategy(fileId)` conta downloads na janela e retorna `'R2'` (baixa demanda), `'P2P'` (média) ou `'BOTH'` (alta). Thresholds e janela configuráveis via env. Getters estáticos: LOW_THRESHOLD, HIGH_THRESHOLD, WINDOW_DAYS. |
| `FallbackService` | [src/services/FallbackService.js](src/services/FallbackService.js) | application | Download com fallback em cascata: P2P → Cache → R2. Ordem nunca violada. Retry por fonte (padrão: 3×) para erros transientes; cache miss (null) avança imediatamente. `download(fileId)` → Buffer ou Error{status:502}. Providers injetáveis via construtor. |
| `HttpProbeProvider` | [src/services/PeerHealthService.js](src/services/PeerHealthService.js) | infra | Implementação padrão de probe HTTP para PeerHealthService. Envia GET /health com AbortController. Injetável para substituição em testes. |
| `PeerHealthService` | [src/services/PeerHealthService.js](src/services/PeerHealthService.js) | application | Saúde e seleção de peers P2P. `isAvailable(peerId)` → boolean (sonda com timeout). `getBestPeer(peers[])` → peerId de menor latência; ignora offline e lentos (≥ slowThreshold). Lança Error{status:503} se nenhum peer elegível. ProbeProvider injetável via construtor. |
| `MemoryCacheProvider` | [src/services/FallbackService.js](src/services/FallbackService.js) | application | Cache em memória para uso como `cacheProvider` do FallbackService. `get(fileId)` → Buffer\|null. `set/delete/has/clear/size`. Populado externamente após downloads P2P ou R2. |
| `AgendamentoService` | [src/services/AgendamentoService.js](src/services/AgendamentoService.js) | application | Regras de negócio de agendamentos. Verifica conflito de horário em criarAgendamento, ownership em atualizarStatus/cancelar, transições de status via #validarTransicao. |
| `CacheService` | [src/services/CacheService.js](src/services/CacheService.js) | infra | Cache de Buffers com TTL. Modos: 'memory' (Map em processo) e 'disk' (arquivos binários + metadados JSON, nome = sha256(key)). Métodos: get(), set(), has(), delete(), clear(), getOrFetch(key, fetchFn) (coalescing de requisições concorrentes — deduplicação de fetches em-flight). |
| `AuthService` | [src/services/AuthService.js](src/services/AuthService.js) | application | Orquestração de autenticação via Supabase Auth Admin API. login(), renovarToken(), logout() (tolerante), alterarSenha() (valida força via PasswordService), solicitarResetSenha() (anti-enumeração). |
| `BarbeariaService` | [src/services/BarbeariaService.js](src/services/BarbeariaService.js) | application | Regras de negócio de barbearias. Filtro Haversine sobre bounding-box, listagem de serviços, favoritos e interações. |
| `CadastroService` | [src/services/CadastroService.js](src/services/CadastroService.js) | application | Cadastro pós-signUp: upsert de perfil, criação de barbearia para tipo 'barbearia'. |
| `ClienteService` | [src/services/ClienteService.js](src/services/ClienteService.js) | application | Regras de negócio de clientes. Busca por ID, atualização (ownership check: id === userId), perfil público. |
| `ComunicacaoService` | [src/services/ComunicacaoService.js](src/services/ComunicacaoService.js) | application | Mensagens e notificações. Bloqueia auto-mensagem (userId === destinatarioId), valida conteúdo. |
| `FilaService` | [src/services/FilaService.js](src/services/FilaService.js) | application | Fila de espera. Entrada/saída com validação de chair_id e notes, status restrito a #STATUS_VALIDOS. |
| `LgpdService` | [src/services/LgpdService.js](src/services/LgpdService.js) | application | Conformidade LGPD: verificarConsentimento, registrarConsentimento, solicitarExclusaoDados (sanitiza motivo), registrarLogAcesso. |
| `ProfissionalService` | [src/services/ProfissionalService.js](src/services/ProfissionalService.js) | application | Regras de negócio de profissionais. Busca, listagem por barbearia, cadeiras, portfólio (add/remove). |
| `SocialService` | [src/services/SocialService.js](src/services/SocialService.js) | application | Interações sociais. Stories (CRUD), likes e favoritos via toggle. |
| `UserService` | [src/services/UserService.js](src/services/UserService.js) | application | Serviço transversal de usuário. buscarPorEmail (via RPC segura) e buscarPerfilPublico. Delega ao ClienteRepository. |

---

## src/controllers/ (Node.js — backend)

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `criarWebRTCController` | [src/controllers/WebRTCController.js](src/controllers/WebRTCController.js) | interfaces | Factory de Router Express para rotas P2P (`/api/p2p`). Rotas protegidas por JWT. POST /announce (upsert de peer com TTL 5min, rate-limit 30/min, valida UUID peerId), GET /peers/:mediaId (lista peers ativos excluindo próprio user), GET /ice-config (credenciais TURN efêmeras via TurnConfig). |

---

## server.js

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `RateLimiter` | [server.js](server.js) | infra | Controle de taxa de requisições por IP (2000 req/min). Assets estáticos isentos. `static check(ip, ext)` |
| `SecurityMiddleware` | [server.js](server.js) | infra | Headers de segurança OWASP, MIME types e proteção contra path traversal. `static dentroDoRoot()`, `static contentType()` |
| `StaticFileHandler` | [server.js](server.js) | infra | Normalização de URL e leitura de arquivo estático com MIME e cache-control. `static normalizarUrl()`, `static ler()` |
| `DevServer` | [server.js](server.js) | infra | Servidor HTTP de desenvolvimento. Orquestra os 3 middlewares. `static iniciar()` |
