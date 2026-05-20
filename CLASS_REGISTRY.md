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
| `OfflineSyncQueue` | [shared/js/OfflineSyncQueue.js](shared/js/OfflineSyncQueue.js) | infra | Fila offline de requests pendentes via IndexedDB + Background Sync. Métodos: `static enqueue({tag,url,method,headers,body})`, `dequeue(tag)`, `concluir(id)`, `limparExpirados(maxAgeMs?)`. Banco: `barberflow-sync`, store: `queue`. Aciona `reg.sync.register(tag)` no enqueue. Reutilizável em ambos os apps. |
| `ApiService` | [shared/js/ApiService.js](shared/js/ApiService.js) | infra | Ponto único de acesso à API REST PostgREST. Substitui Supabase SDK para CRUD |
| `Agendamento` | [shared/js/Agendamento.js](shared/js/Agendamento.js) | domain | Entidade de domínio de agendamento. Inclui validar(), toJSON() (snake_case), estados: isPendente/isConfirmado/isEmAndamento/isCancelado/isConcluido/isNoShow, isFuturo(). `static get statusValidos` retorna cópia do array. **Fonte única — src/entities é thin wrapper.** |
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
| `TermsPage` | [shared/js/TermsPage.js](shared/js/TermsPage.js) | interfaces | Overlay informativo de Lei LGPD e direitos autorais musicais. Aberto via rodapé do menu lateral em ambos os apps. Métodos estáticos: init(), abrir(), fechar(). |
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
| `BffApiService` | [shared/js/BffApiService.js](shared/js/BffApiService.js) | infra | Cliente HTTP para a BFF (porta 3002 dev / `bff.barberflow.app` prod). Métodos estáticos: `get(path, params)` → `{ data, total, error }` (inclui Bearer quando logado); `patch(path, body)` → `{ data, error }`; `post(path, body)` → `{ data, error }`. Getter: `baseUrl`. Timeout 8s. |
| `PushService` | [barberflow-bff-api/services/PushService.js](barberflow-bff-api/services/PushService.js) | service | Envia Web Push notifications via VAPID para subscriptions de usuários (barbeiros/clientes). `async enviarAoBarbeiro({ professionalId, entradaId, barbershopId, type, clienteNome })` → `{ enviados, invalidas }`. Marca subscriptions expiradas como `is_valid=false`. BFF only. |
| `NotificacoesController` | [barberflow-bff-api/controllers/NotificacoesController.js](barberflow-bff-api/controllers/NotificacoesController.js) | infra | Handler HTTP para endpoints de notificações push da BFF. `pushBarbeiro(req, res)` valida payload, verifica propriedade da entrada e delega ao `PushService`. Estende `BaseController`. BFF only. |
| `BffAuthClient` | [shared/js/BffAuthClient.js](shared/js/BffAuthClient.js) | infra | Cliente HTTP para endpoints de auth da BFF. Métodos estáticos: `login(email,senha)`, `refresh(refreshToken)`, `logout()`, `me()`. Retorna `{ dados, erro, indisponivel }`. Fallback automático em `AuthService` quando `indisponivel=true`. Reutilizável em ambos os apps. |
| `AgendaBffClient` | [shared/js/AgendaBffClient.js](shared/js/AgendaBffClient.js) | infra | Cliente HTTP para endpoints de agendamentos da BFF. Métodos estáticos: `listar()`, `criar(payload)`, `atualizarStatus(id,status)`, `cancelar(id)`. Retorna `{ dados, erro, indisponivel }`. Usado em `ClienteService.carregarHistorico()` com fallback para `AppointmentRepository`. Apenas app cliente. |
| `BarbeariaApiClient` | [shared/js/BarbeariaApiClient.js](shared/js/BarbeariaApiClient.js) | application | Fachada de barbearias com fallback BFF→Supabase direto. Métodos: `getNearby(lat,lng,raioKm)`, `getDestaque(limit)`, `getTodas(limit)`. Consumido por `NearbyBarbershopsWidget`. |
| `NotificationService` | [shared/js/NotificationService.js](shared/js/NotificationService.js) | application | Notificações push e in-app via Supabase Realtime |
| `PushSubscriptionService` | [shared/js/PushSubscriptionService.js](shared/js/PushSubscriptionService.js) | infra | Ciclo de vida da Web Push subscription (VAPID). `static init(userId, appId)` — verifica suporte, registra/renova. `static registrar(swReg, userId, appId)` — cria subscription e salva no backend. `static renovar(swReg, userId, appId)` — atualiza se já existe. `static revogar()` — unsubscribe + DELETE no backend. Persiste `bf_device_id` em localStorage. |
| `PaymentFlowHandler` | [shared/js/PaymentFlowHandler.js](shared/js/PaymentFlowHandler.js) | application | Fluxo de pagamento: validação, redirecionamento, confirmação |
| `PerfilEditor` | [shared/js/PerfilEditor.js](shared/js/PerfilEditor.js) | interfaces | Edição inline de campos do perfil com persistência via ProfileRepository |
| `ProfileRepository` | [shared/js/ProfileRepository.js](shared/js/ProfileRepository.js) | infra | CRUD de perfis, favoritos de barbearias e barbeiros, upload de avatar |
| `ProfessionalService` | [shared/js/ProfessionalService.js](shared/js/ProfessionalService.js) | application | Regras de negócio para profissionais: likes em cache, listing, filtros |
| `ProLandingGate` | [shared/js/ProLandingGate.js](shared/js/ProLandingGate.js) | infra | Guard de landing do app profissional (monetização/plano) |
| `QueueRepository` | [shared/js/QueueRepository.js](shared/js/QueueRepository.js) | infra | CRUD de fila de atendimento e cadeiras. Realtime via Supabase SDK |
| `QueuePoller` | [shared/js/QueuePoller.js](shared/js/QueuePoller.js) | infra | Polling periódico REST (20s) da fila + som Web Audio API para alertas de posição. `static iniciar(barbershopId, clientId, onUpdate)`, `static parar()`, `static tocarSom()`. Pausa automática quando aba fica oculta. Apenas app cliente. |
| `UserRepository` | [shared/js/UserRepository.js](shared/js/UserRepository.js) | infra | Busca de usuários e favoritos direto no Supabase via `ApiService.rpc()`. Métodos estáticos: `buscarUsuarios(termo, {limit,offset,signal})` → `{data,total,error}`, `getFavoritosModal(barbershopId, professionalId)` → `{data,error}` (favoritos da barbearia OU desse barbeiro), `getFavoritosBarbearia(barbershopId)` → `{data,error}` (favoritos da barbearia OU de qualquer barbeiro vinculado). Fallback automático com UNION manual (`barbershop_interactions` + `favorite_professionals` [+ `professional_shop_links` na variante por barbearia]) quando a RPC correspondente não existe. |
| `Router` | [shared/js/Router.js](shared/js/Router.js) | infra | Roteador SPA base. Gerencia navegação entre telas e estado do footer |
| `SearchWidget` | [shared/js/SearchWidget.js](shared/js/SearchWidget.js) | interfaces | Campo de busca de barbearias com autocomplete e animação de placeholder |
| `SessionCache` | [shared/js/SessionCache.js](shared/js/SessionCache.js) | infra | Cache de sessão em memória para dados do usuário logado |
| `StatusFechamentoModal` | [shared/js/StatusFechamentoModal.js](shared/js/StatusFechamentoModal.js) | interfaces | Modal de confirmação de fechamento. Retorna `Promise<'normal'\|'almoco'\|'janta'\|null>`. Expõe helpers estáticos: `labelStatus(isOpen, closeReason)`, `classeStatus(...)`, `classBadge(...)`. Reutilizável em qualquer tela que precise do fluxo de fechamento. |
| `BarbershopAvailabilityService` | [shared/js/BarbershopAvailabilityService.js](shared/js/BarbershopAvailabilityService.js) | application | Centraliza lógica de disponibilidade da barbearia para o cliente. Métodos estáticos puros, zero DOM: `isBarbershopOpen`, `isBarbershopClosed`, `isLunchPause`, `isDinnerPause`, `canClientClickChair`, `canClientJoinQueue`, `getClosedMessage`. Usado por `BarbeariaPage.js` para bloquear interação do cliente quando barbearia está fechada ou em pausa. |
| `CadeiraService` | [shared/js/CadeiraService.js](shared/js/CadeiraService.js) | application | Lógica de negócio das cadeiras da fila: `getClientesConhecidos(barbershopId)`, `getFilaAtiva(barbershopId)`, `getClientesFavoritos(barbershopId,professionalId)` (delega a `FavoritosClientesService`), `sentar({barbershopId,professionalId,clientId,serviceIds,tipo})`, `finalizar(entradaId,barbershopId)`. Despacha `barberflow:cadeira-atualizada`. |
| `FavoritosClientesService` | [shared/js/FavoritosClientesService.js](shared/js/FavoritosClientesService.js) | application | Fonte única da regra de favoritos de cliente. Métodos estáticos: `listarPorBarbeiro(barbershopId,professionalId)` (favoritos da barbearia OU desse barbeiro — usado pela modal da cadeira), `listarPorBarbearia(barbershopId)` (favoritos da barbearia OU de qualquer barbeiro vinculado — usado no `mslm-card`). Zero DOM, zero SQL direto: delega a `UserRepository`. |
| `ClienteSeletorModal` | [shared/js/ClienteSeletorModal.js](shared/js/ClienteSeletorModal.js) | interfaces | Modal de seleção de cliente a partir de lista. `static abrir(clientes)` → `Promise<clienteObj\|null>`. Lista com avatar, filtro inline por nome, teclado acessível. |
| `CorteModal` | [shared/js/CorteModal.js](shared/js/CorteModal.js) | interfaces | Modal de seleção de serviços/cortes por checkboxes. `static abrir({servicos,clienteNome,clienteMensalista?})` → `Promise<serviceIds[]\|[]\|null>`. Array vazio = mensalista sem serviço. Card "👑 Plano Mensal" no topo quando `clienteMensalista=true`. |
| `MensalistaModal` | [shared/js/MensalistaModal.js](shared/js/MensalistaModal.js) | interfaces | Modal de gestão de mensalistas da barbearia. `static abrir({barbershopId})` → `Promise<void>`. Três seções: **Ativos** (nome + vencimento + remover), **Favoritos elegíveis** (lista automática via `BffApiService.mensalistas.favoritosElegiveis` — apenas usuários com vínculo de favorito; mensalistas ativos excluídos), **Buscar outro cliente** (busca textual via `buscarClientesDisponiveis`, exige termo não vazio). Prefixo CSS `mslm-`. |
| `FinalizarCorteModal` | [shared/js/FinalizarCorteModal.js](shared/js/FinalizarCorteModal.js) | interfaces | Modal de confirmação de finalização de corte com seleção de método de pagamento. `static abrir({clienteNome,proximoNome})` → `Promise<{confirmado:boolean, paymentMethod:'pix'\|'dinheiro'\|'credito'\|'debito'\|null}>`. Finalizar desabilitado até método selecionado. |
| `MenosPercentualModal` | [shared/js/MenosPercentualModal.js](shared/js/MenosPercentualModal.js) | interfaces | Modal para aplicar taxa de maquininha (desconto percentual). `static abrir({metodo:'credito'\|'debito', valorBruto:number})` → `Promise<{confirmado:boolean, porcentagem:number\|null}>`. Preview em tempo real do valor líquido. Valida 0 < x < 100. |
| `FinanceiroRepository` | [shared/js/FinanceiroRepository.js](shared/js/FinanceiroRepository.js) | infra | CRUD da tabela `transactions`. `criarTransacao({...})` grava `gross_amount=amount`, `getResumoPorPeriodo`, `getTotalPeriodo`, `getTransacoesBarbeiro`, `getResumoPorMetodoPagamento(shopId,{de,ate})` → breakdown por crédito/débito/pixDinheiro, `aplicarDescontoMetodo(shopId,metodo,{de,ate},pct)` → RPC batch. Valida UUIDs via InputValidator. |
| `FinanceiroService` | [shared/js/FinanceiroService.js](shared/js/FinanceiroService.js) | application | Registra corte financeiro e consultas por período. `registrarCorte`, `getResumo`, `getTransacoesBarbeiro`, `getResumoPorMetodoPagamento(shopId,periodo)` → breakdown, `aplicarDescontoMetodo(shopId,periodo,metodo,pct)` valida e chama RPC, despacha `barberflow:transacao-atualizada`. |
| `BarberFinanceModal` | [shared/js/BarberFinanceModal.js](shared/js/BarberFinanceModal.js) | interfaces | Modal de extrato financeiro de um barbeiro: avatar + nome + período + total + lista de transações (data, cliente, método, valor). `static abrir({professionalId,professionalNome,barbershopId,periodo})` → `Promise<void>`. Skeleton enquanto carrega. |
| `BarbeiroCard` | [shared/js/BarbeiroCard.js](shared/js/BarbeiroCard.js) | interfaces | Card visual de barbeiro: avatar circular + nome + badge "Dono". `static criar({nome,avatarPath,updatedAt,isOwner})` e `static criarSkeleton()`. Sem eventos. |
| `Cadeira` | [shared/js/Cadeira.js](shared/js/Cadeira.js) | interfaces | Componente visual de cadeira com estados `livre`/`ocupada`/`em_producao`. Aceita `confirmacao?: 'yes'\|'no_waiting'\|'absent'\|null` — aplica borda amarela (`cdr-cadeira--confirmada`) ou marrom (`cdr-cadeira--ausente`). |
| `FilaController` | [shared/js/FilaController.js](shared/js/FilaController.js) | application | Gerencia **entrada do cliente** na fila: calcula posição, chama `QueueRepository.entrar`, persiste serviços escolhidos. `static entrarNaFila({barbershopId,clientId,professionalId?,serviceIds?})`. Zero DOM. Leitura da fila ativa: usar `CadeiraService.getFilaAtiva()`. |
| `ModalController` | [shared/js/ModalController.js](shared/js/ModalController.js) | interfaces | Adapter de modais para contexto cliente: resolve nome via `AuthService.getPerfil()`, consulta status de mensalista via `BffApiService.mensalistas.verificar` (best-effort) e delega a `CorteModal.abrir` passando `clienteMensalista`. `static abrirSelecaoServicos({servicos, barbershopId?})` → `Promise<serviceIds[]\|null>`. |
| `ClienteController` | [shared/js/ClienteController.js](shared/js/ClienteController.js) | application | Valida role (`client`) e orquestra entrada na fila. `static podeInteragir()`, `static entrarNaFila({barbershopId,professionalId?,serviceIds?})`, `static sentar({barbershopId,professionalId,serviceIds?})` — senta diretamente em produção (in_service) para clique na cadeira de produção vazia da tela-barbearia. Profissional visitante → false. |
| `PWAInstallBanner` | [shared/js/PWAInstallBanner.js](shared/js/PWAInstallBanner.js) | interfaces | Banner flutuante de instalação PWA. Aparece em `tela-inicio` sempre que app não está em standalone. `static iconSrc`, `static nomeApp`, `static init()`. Suporta Android (`beforeinstallprompt`) e iOS (instrução manual). |
| `ConfirmacaoCorteModal` | [shared/js/ConfirmacaoCorteModal.js](shared/js/ConfirmacaoCorteModal.js) | interfaces | Wrapper fino sobre FluxoDeFila. Modal de confirmação de presença do cliente na cadeira de produção. `static abrir({clienteNome, shopLogoUrl?})` → `Promise<'sim'\|'nao'>`. |
| `ClienteAusenteModal` | [shared/js/ClienteAusenteModal.js](shared/js/ClienteAusenteModal.js) | interfaces | Wrapper fino sobre FluxoDeFila. Modal para o barbeiro quando cliente não confirmou presença. `static abrir({clienteNome, modo?})` → `Promise<'remover'\|'mensagem'\|null>`. |
| `BarbeiroEsperaFluxo` | [shared/js/BarbeiroEsperaFluxo.js](shared/js/BarbeiroEsperaFluxo.js) | application | Fluxo **persistente** de espera do barbeiro quando cliente ainda não se sentou. Singleton estático. Estado: `Map` em memória + `localStorage 'bf_espera_barbeiro'`. Timer recorrente `setInterval 5 min`. Métodos: `iniciarEspera({clienteNome,entradaId,barbershopId})`, `abrirModalCadeira({...})` → `'chegou'\|'remover'\|'aguardar'`, `finalizarEspera(entradaId)`, `estaAguardando(entradaId)`, `dadosEspera(entradaId)`, `resetarTimer(entradaId)`, `restaurar()`. Despacha `CustomEvent 'barberflow:espera-resolvida'` ao resolver. |
| `FluxoDeFila` | [shared/js/FluxoDeFila.js](shared/js/FluxoDeFila.js) | interfaces | Motor de modais push reutilizável. Padrão para toda modal push do BarberFlow. `static abrir(config)` ou `new FluxoDeFila(config).abrir()` → `Promise<string\|null>`. Config: `{id?,icone?,iconeImagem?,titulo,corpo,acoes:[{label,valor,variante}],fecharBtn?,tocarSom?}`. Variantes: primario\|secundario\|perigo\|neutro. |
| `CadeiraConfirmacaoService` | [shared/js/CadeiraConfirmacaoService.js](shared/js/CadeiraConfirmacaoService.js) | application | Orquestra confirmação de presença do cliente na cadeira de produção. `static iniciarFluxo(entradaId, clienteNome, shopLogoUrl?)` — toca som, abre modal, chama RPC `confirmar_presenca_cliente`. Grace period de 5 min após 1º “Não”. `static parar(entradaId?)` — cancela timers e limpa estado; sem parâmetro = limpa tudo (logout). `static temTimer(entradaId)`, `static _dispararGrace(entradaId, clienteNome, shopLogoUrl?)` (helpers de teste). || `QueueRealtimeNotifier` | [shared/js/QueueRealtimeNotifier.js](shared/js/QueueRealtimeNotifier.js) | infra | Gateway WebSocket para `queue_entries` por barbearia. Canal Supabase `fila-barbershop:{shopId}` ouvindo UPDATE. Re-busca via `QueueRepository.getByBarbershop()` e despacha `barberflow:fila-atualizada`. Suporta múltiplas barbearias (`Map #canais`). Idempotente. `static iniciar(barbershopId)`, `static parar(barbershopId?)`, `static estaAtivo(barbershopId)`. |
| `QueueStateUpdater` | [shared/js/QueueStateUpdater.js](shared/js/QueueStateUpdater.js) | application | Ouve `barberflow:fila-atualizada`, localiza entrada do cliente nos `waiting`, calcula rank e despacha `barberflow:fila-posicao-atualizada` **somente quando posição muda** (anti-flood). `static iniciar(clientId)`, `static parar()`, `static posicaoAtual()`. |
| `QueuePositionNotificationService` | [shared/js/QueuePositionNotificationService.js](shared/js/QueuePositionNotificationService.js) | application | Intercepta `barberflow:notificacao-nova` filtrando `type=queue_update` (emitido pelo trigger DB `trg_notify_queue_on_done`). Deduplica por `notif.id` e despacha `barberflow:fila-posicao-atualizada`. Caminho redundante com `QueueStateUpdater`. `static iniciar()`, `static parar()`. |
| `FilaPresencaService` | [shared/js/FilaPresencaService.js](shared/js/FilaPresencaService.js) | application | Orquestra confirmação de presença física do cliente ao entrar na fila (status=waiting). `static iniciarFluxo(entradaId, shopData, professionalId)` — abre modal via FluxoDeFila, persiste `client_confirmed` ('yes'\|'arriving') e notifica barbeiro via INSERT em notifications. Grace period de 5 min após "Não, estou chegando". `static parar()` — cancela timers (logout). `static _dispararGrace(entradaId, professionalId, barbershopId)` (helper de teste). Exclusivo do app cliente. |
| `ChegadaProducaoService` | [shared/js/ChegadaProducaoService.js](shared/js/ChegadaProducaoService.js) | application | Orquestra o fluxo de chegada na cadeira de produção (app cliente). Após seleção de serviço, pergunta "Já está / A caminho?" via `FluxoDeFila`. `static iniciarFluxo({barbershopId, professionalId, clientId, serviceIds, shopData, clientePerfil})` — cria entrada `in_service` via `CadeiraService.sentar`, chama `CadeiraConfirmacaoService.pular()` para evitar modal duplicado do Realtime, persiste `client_confirmed` e notifica barbeiro: `client_at_shop` ('aqui') ou `client_not_seated` ('caminho'). Exclusivo do app cliente. |
| `QueueModalPayloadBuilder` | [shared/js/QueueModalPayloadBuilder.js](shared/js/QueueModalPayloadBuilder.js) | interfaces | Fábrica de config-objects para `FluxoDeFila.abrir()`. Nunca chama o modal diretamente. `static montarPayloadPosicao(posicao, {nomeBarbearia?})` — texto diferenciado por posição (1º/2º/3º+), `static montarPayloadProximoNaFila({nomeBarbearia?})`, `static montarPayloadToast(posicao, opts)`, `static montarPayloadPresencaFisica({nomeBarbearia?,clienteNome?})` — modal de confirmação de presença física (waiting). Sanitiza via `FluxoDeFila.escapar()`. |
| `QueuePositionPresenter` | [shared/js/QueuePositionPresenter.js](shared/js/QueuePositionPresenter.js) | interfaces | Última peça do pipeline de notificação visual de fila. Ouve `barberflow:fila-posicao-atualizada`, constrói payload via `QueueModalPayloadBuilder` e abre `FluxoDeFila`. Anti-flood: descarta eventos enquanto modal está aberto. `static iniciar(nomeBarbearia?)`, `static parar()`. || `StoriesCarousel` | [shared/js/StoriesLayout.js](shared/js/StoriesLayout.js) | interfaces | Carrossel de stories no estilo Instagram |
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
| `GpsPanelMap` | [apps/profissional/assets/js/GpsPanelMap.js](apps/profissional/assets/js/GpsPanelMap.js) | interfaces | Mini-mapa Leaflet no sub-painel GPS de Minha Barbearia. Mostra TODAS as barbearias com endereço salvo. Destaca a barbearia atual com pin vermelho pulsante. Estático (Singleton). `init(containerId)`, `redimensionar()`, `carregar(lat?,lng?,nome?)`. |
| `MinhaBarbeariaPage` | [apps/profissional/assets/js/pages/MinhaBarbeariaPage.js](apps/profissional/assets/js/pages/MinhaBarbeariaPage.js) | interfaces | Tela de gerenciamento da barbearia própria (serviços, mídias, configurações) |
| `ParceriasPage` | [apps/profissional/assets/js/pages/ParceriasPage.js](apps/profissional/assets/js/pages/ParceriasPage.js) | interfaces | Tela de parcerias disponíveis para o profissional |
| `QueueWidget` | [apps/profissional/assets/js/pages/QueueWidget.js](apps/profissional/assets/js/pages/QueueWidget.js) | interfaces | Fila de atendimento em tempo real com cadeiras e status |
| `ProfissionalStartupSplash` | [apps/profissional/assets/js/ProfissionalStartupSplash.js](apps/profissional/assets/js/ProfissionalStartupSplash.js) | interfaces | Splash fullscreen de abertura do PWA profissional (session-scoped, BarberPole, auto-fecha 2.5s). Exclusivo do app profissional |

---

## src/entities/ (Node.js — thin wrappers)

> Todos os arquivos abaixo são **thin wrappers** que re-exportam a entidade canônica de `shared/js/`.
> `module.exports = require('../../shared/js/X')` — código real vive apenas em `shared/js/`.

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `Agendamento` | [src/entities/Agendamento.js](src/entities/Agendamento.js) | domain | Thin wrapper → [shared/js/Agendamento.js](shared/js/Agendamento.js). |
| `Barbearia` | [src/entities/Barbearia.js](src/entities/Barbearia.js) | domain | Thin wrapper → [shared/js/Barbearia.js](shared/js/Barbearia.js). |
| `Cliente` | [src/entities/Cliente.js](src/entities/Cliente.js) | domain | Thin wrapper → [shared/js/Cliente.js](shared/js/Cliente.js). |
| `Profissional` | [src/entities/Profissional.js](src/entities/Profissional.js) | domain | Thin wrapper → [shared/js/Profissional.js](shared/js/Profissional.js). |
| `Servico` | [src/entities/Servico.js](src/entities/Servico.js) | domain | Thin wrapper → [shared/js/Servico.js](shared/js/Servico.js). |
| `User` | [src/entities/User.js](src/entities/User.js) | domain | Entidade do usuário autenticado (auth.users + role de profiles). Campo #passwordHash armazena apenas bcrypt hash. Inclui validar(), isAtivo(), isEmailVerificado(), hasRole(), isAdmin(). toJSON() nunca serializa o hash. |

## src/infra/ (Node.js — backend)

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `R2Client` | [src/infra/R2Client.js](src/infra/R2Client.js) | infra | Cliente Cloudflare R2 (S3-compatible). Singleton via getInstance(). Gera presigned PUT URLs para upload P2P direto browser→R2. Métodos: presignedPut(), presignedGet(), putBuffer(), getBuffer(), head(), delete(), publicUrl(). |
| `SupabaseStorageClient` | [src/infra/SupabaseStorageClient.js](src/infra/SupabaseStorageClient.js) | infra | Cliente Supabase Storage para imagens estáticas (avatars, services, portfolio). Bucket público com RLS nativa. Fluxo P2P: browser faz PUT direto via URL assinada. Fluxo server-side: upload() envia buffer diretamente do servidor (usado após ImageProcessor). Métodos: presignedPut(), head(), publicUrl(), delete(), upload(). Static: BUCKET_IMAGES. Constructor recebe instância supabase-js injetada. |
| `AuthMiddleware` | [src/infra/AuthMiddleware.js](src/infra/AuthMiddleware.js) | infra | Middleware JWT. Verificação local via TokenService.verificarSupabase() (zero latência) com fallback para rede se SUPABASE_JWT_SECRET ausente. Popula req.user = { id, email }. |
| `AdminAuthMiddleware` | [src/infra/AdminAuthMiddleware.js](src/infra/AdminAuthMiddleware.js) | infra | Middleware JWT exclusivo para a dashboard admin. Chama TokenService.verificarAdmin() — rejeita explicitamente tokens Supabase (type diferente). Popula req.admin = { email }. |
| `BaseRepository` | [src/infra/BaseRepository.js](src/infra/BaseRepository.js) | infra | Classe base para todos os repositórios backend. Fornece _validarUuid, _validarEmail, _validarPayload, _validarTexto, _validarCoordenada para eliminar duplicação do padrão InputValidator. |
| `BaseService` | [src/infra/BaseService.js](src/infra/BaseService.js) | infra | Classe base para todos os services backend. Fornece _uuid, _texto, _enum, _email, _nome, _telefone, _coordenada, _erro para eliminar duplicação do padrão InputValidator nos services. |
| `PasswordService` | [src/infra/PasswordService.js](src/infra/PasswordService.js) | infra | Hashing e validação de senhas com bcryptjs. validarForca() (síncrono), hash() e verificar() (assíncronos). NUNCA retorna senha original. Rounds configuráveis via BCRYPT_ROUNDS (padrão: 12). |
| `RateLimitMiddleware` | [src/infra/RateLimitMiddleware.js](src/infra/RateLimitMiddleware.js) | infra | Rate limiting por IP. Campos estáticos: geral (300/min), auth (10/15min), escrita (60/min), p2pAnnounce (30/min). Handler privado #onLimitReached. Responde 429. |
| `TurnConfig` | [src/infra/TurnConfig.js](src/infra/TurnConfig.js) | infra | Geração de credenciais TURN efêmeras HMAC-SHA1 (compatível coturn use-auth-secret). TTL 1h. TURN_SECRET nunca exposto ao cliente. Métodos estáticos: credenciais(userId) → {username, credential}, servidoresICE(userId) → {iceServers, expiresAt}. Lança Error se TURN_SECRET ausente. Env: TURN_URL, TURNS_URL, TURN_SECRET, STUN_URL. |
| `RequestTimeoutMiddleware` | [src/infra/RequestTimeoutMiddleware.js](src/infra/RequestTimeoutMiddleware.js) | infra | Timeout por requisição. Campo estático #TIMEOUT_MS (padrão 30s via env). handle() cancela timer no finish/close. Responde 503. |
| `RoleMiddleware` | [src/infra/RoleMiddleware.js](src/infra/RoleMiddleware.js) | infra | Autorização baseada em roles. Busca profiles.role no banco se não cacheado em req.user.role. exigir(...roles) para custom, shorthands .admin/.profissional/.cliente. _comSupabase(db, ...roles) para testes. 401/403/503. |
| `TokenService` | [src/infra/TokenService.js](src/infra/TokenService.js) | infra | Geração e verificação de JWTs customizados (access: 15min, refresh: 7d) + verificação local de tokens Supabase Auth sem chamada de rede (verificarSupabase) + tokens admin dashboard (gerarAdmin/verificarAdmin, 4h, secret próprio ADMIN_JWT_SECRET). Algoritmo fixo HS256. |
| `ValidationMiddleware` | [src/infra/ValidationMiddleware.js](src/infra/ValidationMiddleware.js) | infra | Validação declarativa de inputs por schema. corpo()/params()/query() retornam middleware. Tipos: uuid, email, nome, telefone, texto (sanitiza), enum, numero, booleano. 400 com { ok, error, erros[] } ao falhar. |

## src/repositories/ (Node.js — backend)

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `RefreshTokenRepository` | [src/repositories/RefreshTokenRepository.js](src/repositories/RefreshTokenRepository.js) | infra | Armazenamento de refresh tokens customizados. Persiste apenas SHA-256 hash (nunca o token em claro). Métodos: salvar(), buscar(), revogar(), revogarTodos(). |
| `AdminRepository` | [src/repositories/AdminRepository.js](src/repositories/AdminRepository.js) | infra | Repositório de operações administrativas via service_role. Métodos: getTotais(), listarUsuarios(filtros), criarUsuario(dados), excluirUsuario(userId), criarSubscription(dados), listarFinanceiro(filtros), atualizarPlano(subId, campos). Reutilizável em qualquer dashboard admin. |
| `SearchRepository` | [src/repositories/SearchRepository.js](src/repositories/SearchRepository.js) | infra | Busca de usuários via RPC PostgreSQL. `searchUsers({ term, role, limit, offset })` → RPC `search_users` (JOIN profiles + barbershops, 1 query parametrizada, zero SQL injection). `getFavoriteClients(barbershopId, professionalId)` → RPC `get_clientes_favoritos_modal`. Reutilizável em qualquer módulo que precise buscar usuários. |

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
| `AdminService` | [src/services/AdminService.js](src/services/AdminService.js) | application | Lógica de negócio da dashboard administrativa. login() com bcrypt e JWT admin, getTotais(), listarUsuarios(), criarUsuario(), excluirUsuario(), criarBarbeiro(), excluirBarbeiro(), listarFinanceiro(), atualizarPlano(). Credenciais lidas de ADMIN_EMAIL + ADMIN_PASSWORD_HASH em tempo de chamada. |
| `BarbeariaService` | [src/services/BarbeariaService.js](src/services/BarbeariaService.js) | application | Regras de negócio de barbearias. Filtro Haversine sobre bounding-box, listagem de serviços, favoritos e interações. |
| `CadastroService` | [src/services/CadastroService.js](src/services/CadastroService.js) | application | Cadastro pós-signUp: upsert de perfil, criação de barbearia para tipo 'barbearia'. |
| `ClienteService` | [src/services/ClienteService.js](src/services/ClienteService.js) | application | Regras de negócio de clientes. Busca por ID, atualização (ownership check: id === userId), perfil público. |
| `ComunicacaoService` | [src/services/ComunicacaoService.js](src/services/ComunicacaoService.js) | application | Mensagens e notificações. Bloqueia auto-mensagem (userId === destinatarioId), valida conteúdo. |
| `FilaService` | [src/services/FilaService.js](src/services/FilaService.js) | application | Fila de espera. Entrada/saída com validação de chair_id e notes, status restrito a #STATUS_VALIDOS. |
| `LgpdService` | [src/services/LgpdService.js](src/services/LgpdService.js) | application | Conformidade LGPD: verificarConsentimento, registrarConsentimento, solicitarExclusaoDados (sanitiza motivo), registrarLogAcesso. |
| `ProfissionalService` | [src/services/ProfissionalService.js](src/services/ProfissionalService.js) | application | Regras de negócio de profissionais. Busca, listagem por barbearia, cadeiras, portfólio (add/remove). |
| `SocialService` | [src/services/SocialService.js](src/services/SocialService.js) | application | Interações sociais. Stories (CRUD), likes e favoritos via toggle. |
| `UserService` | [src/services/UserService.js](src/services/UserService.js) | application | Serviço transversal de usuário. `buscarPorEmail` (RPC segura), `buscarPerfilPublico`, `buscarPorNome`, `getClientesFavoritosModal` e `searchUsers({ term, role, limit, offset, barbershopId, professionalId })` — busca unificada com fallback para favoritos quando sem termo. Delega a ClienteRepository e SearchRepository. |

---

## src/controllers/ (Node.js — backend)

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `criarWebRTCController` | [src/controllers/WebRTCController.js](src/controllers/WebRTCController.js) | interfaces | Factory de Router Express para rotas P2P (`/api/p2p`). Rotas protegidas por JWT. POST /announce (upsert de peer com TTL 5min, rate-limit 30/min, valida UUID peerId), GET /peers/:mediaId (lista peers ativos excluindo próprio user), GET /ice-config (credenciais TURN efêmeras via TurnConfig). |
| `criarAdminController` | [src/controllers/AdminController.js](src/controllers/AdminController.js) | interfaces | Factory de Router Express para `/api/admin`. POST /login (público, rate-limit 5/min), GET /totais, GET /usuarios, POST /usuarios, DELETE /usuarios/:id, POST /barbeiros, DELETE /barbeiros/:id, GET /financeiro, PATCH /financeiro/:id. Todas as rotas exceto login protegidas por AdminAuthMiddleware. |

---

## server.js

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `RateLimiter` | [server.js](server.js) | infra | Controle de taxa de requisições por IP (2000 req/min). Assets estáticos isentos. `static check(ip, ext)` |
| `SecurityMiddleware` | [server.js](server.js) | infra | Headers de segurança OWASP, MIME types e proteção contra path traversal. `static dentroDoRoot()`, `static contentType()` |
| `StaticFileHandler` | [server.js](server.js) | infra | Normalização de URL e leitura de arquivo estático com MIME e cache-control. `static normalizarUrl()`, `static ler()` |
| `DevServer` | [server.js](server.js) | infra | Servidor HTTP de desenvolvimento. Orquestra os 3 middlewares. `static iniciar()` |
| ``ClienteStartupSplash`` | [apps/cliente/assets/js/ClienteStartupSplash.js](apps/cliente/assets/js/ClienteStartupSplash.js) | UI / Presentation | Splash fullscreen de abertura do app cliente: fundo imgFundoSplash, logo, BarberPole, boas-vindas. `static init()`, `static limparSessao()`. Exibido uma vez por sessao (sessionStorage). | App cliente apenas |
| ``PWAInstallBanner`` | [shared/js/PWAInstallBanner.js](shared/js/PWAInstallBanner.js) | UI / Presentation | Banner de instalacao PWA: injeta proprio DOM, captura beforeinstallprompt, suporta iOS. static init(), static iconSrc, static nomeApp. | Ambos os apps |

---

## barberflow-bff-api/ (Node.js — API central compartilhada)

Servidor Express separado (porta 3002). API central para app cliente **e** app profissional.
Completamente independente do backend `src/` (porta 3001).
Toda nova funcionalidade backend deve ser adicionada SOMENTE aqui — nunca dentro dos apps.

### Utils

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `AppError` | [barberflow-bff-api/utils/AppError.js](barberflow-bff-api/utils/AppError.js) | infra | Erro HTTP estruturado com `#status` e `#isOperacional`. Factory methods: `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `unprocessable`, `tooMany`, `internal`, `unavailable`. |
| `ApiResponse` | [barberflow-bff-api/utils/ApiResponse.js](barberflow-bff-api/utils/ApiResponse.js) | infra | Formatos padronizados de resposta. Métodos estáticos: `success(res, dados, meta)`, `created(res, dados)`, `noContent(res)`, `fail(res, err, isProd)`, `notFound(res, msg)`, `badRequest(res, msg)`, `unauthorized(res, msg)`. |
| `RetryHelper` | [barberflow-bff-api/utils/RetryHelper.js](barberflow-bff-api/utils/RetryHelper.js) | infra | Retry com backoff exponencial e jitter. `static async withRetry(fn, opts)`. Opções: `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `jitter`, `shouldRetry`. |
| `SupabaseClient` | [barberflow-bff-api/utils/SupabaseClient.js](barberflow-bff-api/utils/SupabaseClient.js) | infra | Singleton lazy do cliente Supabase `service_role` para a BFF. `static getInstance()`, `static _resetar()` (testes). |

### Validators / Base Classes

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `BaseValidator` | [barberflow-bff-api/validators/BaseValidator.js](barberflow-bff-api/validators/BaseValidator.js) | infra | Wrapper OOP sobre `shared/js/InputValidator`. Métodos estáticos que lançam `AppError(400)`: `uuid`, `email`, `texto`, `enum`, `nome`, `payload`, `coordenada`. |
| `BaseRepository` | [barberflow-bff-api/repositories/BaseRepository.js](barberflow-bff-api/repositories/BaseRepository.js) | infra | Classe base para repositórios da BFF. `#db` (Supabase client injetado), `#nome`. Helpers: `_uuid`, `_email`, `_payload`, `_texto`, `_coordenada`, `_throwDbError`, `_warn`. |
| `BaseService` | [barberflow-bff-api/services/BaseService.js](barberflow-bff-api/services/BaseService.js) | application | Classe base para serviços da BFF. Helpers: `_uuid`, `_email`, `_texto`, `_enum`, `_nome`, `_coordenada`, `_erro(msg, status)`. |
| `BaseController` | [barberflow-bff-api/controllers/BaseController.js](barberflow-bff-api/controllers/BaseController.js) | interfaces | Classe base OOP para controllers da BFF (único `BaseController` do projeto). Métodos: `success`, `created`, `noContent`, `notFound`, `fail`, `handle(res, fn)`, `_erro`. |

### Controllers

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `GeoController` | [barberflow-bff-api/controllers/GeoController.js](barberflow-bff-api/controllers/GeoController.js) | interfaces | `extends BaseController`. `GET + PATCH /api/v1/clientes/localizacao`. Auth obrigatória (`req.user.id`). Valida lat (-90 a 90) e lng (-180 a 180) no PATCH. |
| `HealthController` | [barberflow-bff-api/controllers/HealthController.js](barberflow-bff-api/controllers/HealthController.js) | interfaces | `extends BaseController`. `handle(_req, res)` → `{ status: "up", version, env, timestamp }`. Rota pública sem autenticação. |
| `BarbeariaController` | [barberflow-bff-api/controllers/BarbeariaController.js](barberflow-bff-api/controllers/BarbeariaController.js) | interfaces | `extends BaseController`. Endpoints públicos: `GET /barbearias` (proximas), `GET /barbearias/destaque`, `GET /barbearias/todas`. Autenticados: `PATCH /barbearias/minha/endereco`, `PATCH /barbearias/minha/imagem?tipo=logo\|cover` (binário → BarbeariaMediaService). |
| `AuthController` | [barberflow-bff-api/controllers/AuthController.js](barberflow-bff-api/controllers/AuthController.js) | interfaces | `extends BaseController`. Handlers: `POST /api/auth/login`, `POST /api/auth/refresh` (públicos); `POST /api/auth/logout`, `GET /api/auth/me` (autenticados via `AuthMiddleware`). |
| `AgendamentoController` | [barberflow-bff-api/controllers/AgendamentoController.js](barberflow-bff-api/controllers/AgendamentoController.js) | interfaces | `extends BaseController`. Handlers: `GET /api/agendamentos`, `POST /api/agendamentos`, `PATCH /api/agendamentos/:id`, `DELETE /api/agendamentos/:id`. Todos exigem JWT via `AuthMiddleware`. |

| `MensalistaController` | [barberflow-bff-api/controllers/MensalistaController.js](barberflow-bff-api/controllers/MensalistaController.js) | interfaces | `extends BaseController`. Handlers: `POST /mensalistas` (adicionar), `GET /mensalistas` (listar), `GET /mensalistas/verificar` (verificar), `DELETE /mensalistas/:id` (remover), `GET /mensalistas/clientes-disponiveis` (busca textual — exige `q`), `GET /mensalistas/favoritos-elegiveis` (lista automática de favoritos não-mensalistas). Todos autenticados via `AuthMiddleware`. |

### Repositories

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `BarbeariaRepository` | [barberflow-bff-api/repositories/BarbeariaRepository.js](barberflow-bff-api/repositories/BarbeariaRepository.js) | infra | `extends BaseRepository`. Tabela `barbershops`. Métodos: `getNearby(lat,lng,raioKm,limit)`, `getFeatured(limit)`, `getAll(limit)`, `getAtivaPorOwner(ownerId)`, `updateEndereco(ownerId,dados)`, `uploadImagemBarbearia(path,buffer,contentType)`, `updateImagem(ownerId,campo,path,updatedAt)`, `getBarbershopPublicUrl(path)`. |
| `GeoRepository` | [barberflow-bff-api/repositories/GeoRepository.js](barberflow-bff-api/repositories/GeoRepository.js) | infra | `extends BaseRepository`. CRUD de localização GPS em `profiles`. Métodos: `salvarLocalizacao(userId,lat,lng)` — PATCH last_lat/lng/location_at; `carregarLocalizacao(userId)` — SELECT last_lat, last_lng, last_location_at. |
| `AuthRepository` | [barberflow-bff-api/repositories/AuthRepository.js](barberflow-bff-api/repositories/AuthRepository.js) | infra | `extends BaseRepository`. Proxy da Supabase Auth REST API via `fetch` direto (sem SDK). Métodos: `signIn(email,password)`, `refreshToken(refreshToken)`, `signOut(accessToken)`, `getPerfil(userId)`. Usa `SUPABASE_ANON_KEY` server-side. |
| `AgendamentoRepository` | [barberflow-bff-api/repositories/AgendamentoRepository.js](barberflow-bff-api/repositories/AgendamentoRepository.js) | infra | `extends BaseRepository`. CRUD de agendamentos na tabela `appointments`. Métodos: `getByCliente(clientId,limit)`, `getById(id)`, `criar(dados)`, `atualizarStatus(id,status)`, `getConflitos(professionalId,inicio,fim)`. SELECT completo com joins: client, professional, service, barbershop. |
| `MensalistaRepository` | [barberflow-bff-api/repositories/MensalistaRepository.js](barberflow-bff-api/repositories/MensalistaRepository.js) | infra | `extends BaseRepository`. CRUD na tabela `barbershop_mensalistas`. Métodos: `adicionar(barbershopId,clientId)` (upsert +30d), `listar(barbershopId)` (join profiles), `verificar(barbershopId,clientId)` → boolean, `getById(id)`, `remover(id)`, `buscarClientesDisponiveis(barbershopId,q,limit)` (busca textual — exige `q` não vazio, retorna `[]` sem termo), `listarFavoritosElegiveis(barbershopId)` (chama RPC `get_clientes_favoritos_barbearia` e exclui mensalistas ativos). |

### Services

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `BarbeariaMediaService` | [barberflow-bff-api/services/BarbeariaMediaService.js](barberflow-bff-api/services/BarbeariaMediaService.js) | application | `extends BaseService`. Upload e processamento de imagens da barbearia via BFF. Valida MIME real, tamanho ≤5MB e ownership. Processa com `sharp` → WebP (logo 256×256, cover 1280px). `async salvarImagem(userId, tipo, arquivo, mime)` → `{path, publicUrl, updated_at}`. BFF only. |
| `BarbeariaService` | [barberflow-bff-api/services/BarbeariaService.js](barberflow-bff-api/services/BarbeariaService.js) | application | `extends BaseService`. Regras de negócio de barbearias: `listarProximas(lat,lng,raioKm)`, `listarDestaque(limit)`, `listarTodas(limit)`. Haversine interno enriquece `distancia_km`. |
| `GeoService (BFF)` | [barberflow-bff-api/services/GeoService.js](barberflow-bff-api/services/GeoService.js) | application | `extends BaseService`. Orquestra save/load de localização GPS do usuário logado. Métodos: `salvar(userId,lat,lng)`, `carregar(userId)` → `{lat,lng}|null` (null se ts > 1h). |
| `AuthBffService` | [barberflow-bff-api/services/AuthBffService.js](barberflow-bff-api/services/AuthBffService.js) | application | `extends BaseService`. Valida inputs, mascara dados nos logs, delega ao `AuthRepository`. Métodos: `login(email,password)`, `refresh(refreshToken)`, `logout(userId,accessToken)`, `me(user)`. |
| `AgendamentoBffService` | [barberflow-bff-api/services/AgendamentoBffService.js](barberflow-bff-api/services/AgendamentoBffService.js) | application | `extends BaseService`. Máquina de estados de agendamentos + verificação de conflitos. Métodos: `listar(clientId)`, `criar(dados,clientId)`, `atualizarStatus(id,novoStatus,userId)`, `cancelar(id,userId)`. Verifica ownership (cliente ou profissional) antes de mutações. |
| `MensalistaService` | [barberflow-bff-api/services/MensalistaService.js](barberflow-bff-api/services/MensalistaService.js) | application | `extends BaseService`. Regras de negócio de mensalistas. Verifica ownership de barbearia via `#verificarOwnership`. Métodos: `adicionar(userId,barbershopId,clientId)`, `listar(userId,barbershopId)`, `verificar(barbershopId,clientId)` (sem ownership), `remover(userId,id)`, `buscarClientesDisponiveis(userId,barbershopId,q)`, `listarFavoritosElegiveis(userId,barbershopId)`. |

### Middlewares

| Classe | Arquivo | Camada | Descrição |
|---|---|---|---|
| `CorsMiddleware` | [barberflow-bff-api/middlewares/cors.js](barberflow-bff-api/middlewares/cors.js) | infra | CORS configurado por ambiente. `#allowedOrigins` (Set). Aceita `*.vercel.app` para previews. `static handle(req, res, next)`. |
| `AuthMiddleware` | [barberflow-bff-api/middlewares/auth.js](barberflow-bff-api/middlewares/auth.js) | infra | JWT Supabase Auth. Verificação local (HS256 + `SUPABASE_JWT_SECRET`) com fallback rede. Singleton `#supabase` lazy. `static async verificar`. |
| `RateLimiterMiddleware` | [barberflow-bff-api/middlewares/rateLimiter.js](barberflow-bff-api/middlewares/rateLimiter.js) | infra | Rate limiting. `static geral` (300/min), `static auth` (10/15min), `static escrita` (60/min, skip GET/HEAD/OPTIONS). |
| `TimeoutMiddleware` | [barberflow-bff-api/middlewares/timeout.js](barberflow-bff-api/middlewares/timeout.js) | infra | Aborta requests que excedem `REQUEST_TIMEOUT_MS` (padrão 30s). `static handle`. |
| `ErrorHandler` | [barberflow-bff-api/middlewares/errorHandler.js](barberflow-bff-api/middlewares/errorHandler.js) | infra | Global 4-param Express error handler. Distingue `AppError` operacional de erros inesperados. `static handle(err, req, res, _next)`. |
