# Auditoria de Scripts

Gerado em 2026-05-22T16:11:42.532Z. Auditoria sem alteracao de codigo da aplicacao.

## Metodo

- HTMLs auditados: `admin.html`, `index.html`, `cliente.html`, `profissional.html`, `apps/profissional/index.html`, `apps/cliente/index.html`.
- Tamanho nao-minificado: bytes reais do arquivo local.
- Tamanho minificado: estimativa local por remocao simples de comentarios/espacos quando nao ha artefato minificado. Para vendor externo sem arquivo local fica `n/d`.
- Gzip: `zlib.gzipSync` sobre o arquivo local atual.
- Impacto TTI: heuristica `peso_da_estrategia * (gzipKB + rawKB * 0.04)`; blocking pesa 1.0, defer 0.35, module 0.30, async 0.15. Nao substitui trace real de parse/execute.
- Dependencias de ordem: inferencia estatica por globais/classes declaradas antes e referenciadas depois no mesmo HTML. Revisar manualmente antes de mudar ordem.

## Lighthouse baseline

Lighthouse nao foi executado porque o CLI nao esta instalado e `npx.cmd lighthouse --version` excedeu timeout mesmo com rede liberada. JSONs de baseline com status tecnico foram salvos em:

- `docs/perf/baseline/lighthouse-mobile-not-run.json`
- `docs/perf/baseline/lighthouse-desktop-not-run.json`

Decisao humana: permitir instalacao do Lighthouse no projeto/CI ou fornecer ambiente onde o CLI ja esteja disponivel.

## Resumo consolidado

|Metrica|Valor|
|---|---|
|Scripts totais|280|
|Scripts unicos por src/local|190|
|Scripts blocking|280|
|Peso local nao-minificado somado|2746.2 KB|
|Peso local gzip somado|758.3 KB|
|Scripts locais ausentes|0|
|Familias duplicadas/variantes|13|

## Top 10 scripts mais caros estimados

|#|Pagina|Script|Raw|Gzip|Estrategia|Impacto|Deps|
|---|---|---|---|---|---|---|---|
|29|apps/profissional/index.html:2105|/shared/js/supabase.min.js|183.3 KB|47.4 KB|blocking|54.7|-|
|176|apps/cliente/index.html:1051|/shared/js/supabase.min.js|183.3 KB|47.4 KB|blocking|54.7|-|
|159|apps/profissional/index.html:2274|assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js|106.4 KB|25.4 KB|blocking|29.68|A, Se, Re, Pr, LoggerService, ApiService, SupabaseService, URL, InputValidator, AuthService, AnimationService, BarbershopRepository|
|61|apps/profissional/index.html:2162|/shared/js/BarbeariaPage.js|50.3 KB|12.7 KB|blocking|14.76|P, Se, Re, LoggerService, ApiService, SupabaseService, InputValidator, AuthService, AppState, ID, BarbershopRepository, CacheManager|
|274|apps/cliente/index.html:1178|/shared/js/BarbeariaPage.js|50.3 KB|12.7 KB|blocking|14.76|P, Se, Re, LoggerService, ApiService, SupabaseService, InputValidator, AuthService, AppState, ID, BarbershopRepository, BarbershopService|
|65|apps/profissional/index.html:2169|/shared/js/BarbershopService.js|33.3 KB|8.5 KB|blocking|9.87|P, Se, LoggerService, SupabaseService, AuthGuard, GeoService, BarbershopRepository, ProfileRepository|
|205|apps/cliente/index.html:1101|/shared/js/BarbershopService.js|33.3 KB|8.5 KB|blocking|9.87|P, Se, LoggerService, SupabaseService, AuthGuard, GeoService, BarbershopRepository, ProfileRepository|
|94|apps/profissional/index.html:2201|/shared/js/MapWidget.js|25.9 KB|7.2 KB|blocking|8.22|A, P, Re, Rt, ApiService, URL, SessionCache, AuthService, GeoService, BarbeariaApiClient, NearbyBarbershopsWidget, LojaMarker|
|235|apps/cliente/index.html:1134|/shared/js/MapWidget.js|25.9 KB|7.2 KB|blocking|8.22|A, P, Re, Rt, ApiService, URL, SessionCache, AuthService, GeoService, BarbeariaApiClient, NearbyBarbershopsWidget, LojaMarker|
|92|apps/profissional/index.html:2199|/shared/js/NearbyBarbershopsWidget.js|29.9 KB|6.6 KB|blocking|7.83|P, Se, Rt, LoggerService, SupabaseService, URL, GeoService, BarbershopRepository, ProfileRepository, BarbershopService, ProfessionalService, StatusFechamentoModal|

## Scripts duplicados

|Familia|Variantes|
|---|---|
|logoutscreen|shared/js/LogoutScreen.js; /shared/js/LogoutScreen.js|
|animationservice|shared/js/AnimationService.js; /shared/js/AnimationService.js|
|menuservice|shared/js/MenuService.js; /shared/js/MenuService.js|
|userservice|shared/js/UserService.js; /shared/js/UserService.js|
|avatarservice|shared/js/AvatarService.js; /shared/js/AvatarService.js|
|splashservice|shared/js/SplashService.js; /shared/js/SplashService.js|
|appstate|shared/js/AppState.js; /shared/js/AppState.js|
|authguard|shared/js/AuthGuard.js; /shared/js/AuthGuard.js|
|permissionservice|shared/js/PermissionService.js; /shared/js/PermissionService.js|
|router|shared/js/Router.js; /shared/js/Router.js|
|barberpole|shared/js/BarberPole.js; /shared/js/BarberPole.js|
|perfileditor|shared/js/PerfilEditor.js; /shared/js/PerfilEditor.js|
|supabase|/shared/js/supabase.min.js; /shared/js/SupabaseService.js|

### Referencias repetidas

|Script|Referencias|
|---|---|
|shared/js/LogoutScreen.js|cliente.html:1333; profissional.html:1291|
|shared/js/AnimationService.js|cliente.html:1335; profissional.html:1293|
|shared/js/MenuService.js|cliente.html:1336; profissional.html:1294|
|shared/js/UserService.js|cliente.html:1337; profissional.html:1295|
|shared/js/AvatarService.js|cliente.html:1338; profissional.html:1296|
|shared/js/SplashService.js|cliente.html:1339; profissional.html:1297|
|shared/js/AppState.js|cliente.html:1341; profissional.html:1299|
|shared/js/AuthGuard.js|cliente.html:1343; profissional.html:1301|
|shared/js/PermissionService.js|cliente.html:1344; profissional.html:1302|
|shared/js/Router.js|cliente.html:1345; profissional.html:1303|
|shared/js/BarberPole.js|cliente.html:1346; profissional.html:1304|
|shared/js/PerfilEditor.js|cliente.html:1347; profissional.html:1305|
|(inline)|cliente.html:1348; profissional.html:1306; apps/profissional/index.html:2298|
|/shared/js/supabase.min.js|apps/profissional/index.html:2105; apps/cliente/index.html:1051|
|/shared/js/LoggerService.js|apps/profissional/index.html:2107; apps/cliente/index.html:1053|
|/shared/js/ApiService.js|apps/profissional/index.html:2109; apps/cliente/index.html:1055|
|/shared/js/SupabaseService.js|apps/profissional/index.html:2111; apps/cliente/index.html:1057|
|/shared/js/SessionCache.js|apps/profissional/index.html:2113; apps/cliente/index.html:1059|
|/shared/js/NavConfig.js|apps/profissional/index.html:2115; apps/cliente/index.html:1061|
|/shared/js/InputValidator.js|apps/profissional/index.html:2117; apps/cliente/index.html:1063|
|/shared/js/AuthService.js|apps/profissional/index.html:2119; apps/cliente/index.html:1065|
|/shared/js/AuthUI.js|apps/profissional/index.html:2120; apps/cliente/index.html:1066|
|/shared/js/LogoutScreen.js|apps/profissional/index.html:2122; apps/cliente/index.html:1068|
|/shared/js/AnimationService.js|apps/profissional/index.html:2124; apps/cliente/index.html:1070|
|/shared/js/MenuService.js|apps/profissional/index.html:2125; apps/cliente/index.html:1071|
|/shared/js/UserService.js|apps/profissional/index.html:2126; apps/cliente/index.html:1072|
|/shared/js/BackendApiService.js|apps/profissional/index.html:2127; apps/cliente/index.html:1073|
|/shared/js/AvatarService.js|apps/profissional/index.html:2128; apps/cliente/index.html:1074|
|/shared/js/SplashService.js|apps/profissional/index.html:2129; apps/cliente/index.html:1075|
|/shared/js/AppState.js|apps/profissional/index.html:2131; apps/cliente/index.html:1077|
|/shared/js/GuestMode.js|apps/profissional/index.html:2133; apps/cliente/index.html:1079|
|/shared/js/AuthGuard.js|apps/profissional/index.html:2135; apps/cliente/index.html:1081|
|/shared/js/PermissionService.js|apps/profissional/index.html:2136; apps/cliente/index.html:1082|
|/shared/js/NavigationViewService.js|apps/profissional/index.html:2138; apps/cliente/index.html:1084|
|/shared/js/Router.js|apps/profissional/index.html:2140; apps/cliente/index.html:1086|
|/shared/js/BarberPole.js|apps/profissional/index.html:2142; apps/cliente/index.html:1088|
|/shared/js/LogoGlow.js|apps/profissional/index.html:2144; apps/cliente/index.html:1090|
|/shared/js/StoryViewer.js|apps/profissional/index.html:2146; apps/cliente/index.html:1092|
|/shared/js/StoriesLayout.js|apps/profissional/index.html:2148; apps/cliente/index.html:1094|
|/shared/js/GeoService.js|apps/profissional/index.html:2150; apps/cliente/index.html:1096|
|/shared/js/BarbershopRepository.js|apps/profissional/index.html:2152; apps/cliente/index.html:1098|
|/shared/js/CacheManager.js|apps/profissional/index.html:2154; apps/cliente/index.html:1171|
|/shared/js/StateManager.js|apps/profissional/index.html:2156; apps/cliente/index.html:1172|
|/shared/js/ResourceLoader.js|apps/profissional/index.html:2158; apps/cliente/index.html:1173|
|/shared/js/NavigationManager.js|apps/profissional/index.html:2160; apps/cliente/index.html:1174|
|/shared/js/BarbeariaPage.js|apps/profissional/index.html:2162; apps/cliente/index.html:1178|
|/shared/js/BarbeiroPage.js|apps/profissional/index.html:2164; apps/cliente/index.html:1179|
|/shared/js/ProfileRepository.js|apps/profissional/index.html:2167; apps/cliente/index.html:1099|
|/shared/js/BarbershopService.js|apps/profissional/index.html:2169; apps/cliente/index.html:1101|
|/shared/js/ProfessionalService.js|apps/profissional/index.html:2170; apps/cliente/index.html:1102|
|/shared/js/StatusFechamentoModal.js|apps/profissional/index.html:2171; apps/cliente/index.html:1103|
|/shared/js/CadeiraService.js|apps/profissional/index.html:2173; apps/cliente/index.html:1106|
|/shared/js/CorteModal.js|apps/profissional/index.html:2175; apps/cliente/index.html:1107|
|/shared/js/FluxoDeFila.js|apps/profissional/index.html:2182; apps/cliente/index.html:1112|
|/shared/js/ConfirmacaoCorteModal.js|apps/profissional/index.html:2183; apps/cliente/index.html:1118|
|/shared/js/BarbeiroCard.js|apps/profissional/index.html:2186; apps/cliente/index.html:1108|
|/shared/js/Cadeira.js|apps/profissional/index.html:2187; apps/cliente/index.html:1109|
|/shared/js/FilaController.js|apps/profissional/index.html:2188; apps/cliente/index.html:1110|
|/shared/js/ModalController.js|apps/profissional/index.html:2189; apps/cliente/index.html:1121|
|/shared/js/ClienteController.js|apps/profissional/index.html:2190; apps/cliente/index.html:1122|
|/shared/js/BarbeariaStatusSync.js|apps/profissional/index.html:2191; apps/cliente/index.html:1123|
|https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js|apps/profissional/index.html:2193; apps/cliente/index.html:1125|
|/shared/js/BffApiService.js|apps/profissional/index.html:2196; apps/cliente/index.html:1128|
|/shared/js/BffAuthClient.js|apps/profissional/index.html:2197; apps/cliente/index.html:1129|
|/shared/js/BarbeariaApiClient.js|apps/profissional/index.html:2198; apps/cliente/index.html:1131|
|/shared/js/NearbyBarbershopsWidget.js|apps/profissional/index.html:2199; apps/cliente/index.html:1132|
|/shared/js/LojaMarker.js|apps/profissional/index.html:2200; apps/cliente/index.html:1133|
|/shared/js/MapWidget.js|apps/profissional/index.html:2201; apps/cliente/index.html:1134|
|/shared/js/SearchWidget.js|apps/profissional/index.html:2203; apps/cliente/index.html:1136|
|/shared/js/FonteSalao.js|apps/profissional/index.html:2205; apps/cliente/index.html:1138|
|/shared/js/CapaBarbearia.js|apps/profissional/index.html:2206; apps/cliente/index.html:1139|
|/shared/js/MapPanelModule.js|apps/profissional/index.html:2210; apps/cliente/index.html:1141|
|/shared/js/MapOrientationModule.js|apps/profissional/index.html:2212; apps/cliente/index.html:1143|
|/shared/js/MessageService.js|apps/profissional/index.html:2221; apps/cliente/index.html:1144|
|/shared/js/MessageCryptoService.js|apps/profissional/index.html:2222; apps/cliente/index.html:1145|
|/shared/js/MessageSignalingService.js|apps/profissional/index.html:2223; apps/cliente/index.html:1146|
|/shared/js/P2PMessageConnectionService.js|apps/profissional/index.html:2224; apps/cliente/index.html:1147|
|/shared/js/MessagesWidget.js|apps/profissional/index.html:2225; apps/cliente/index.html:1148|
|/shared/js/NotificationService.js|apps/profissional/index.html:2226; apps/cliente/index.html:1149|
|/shared/js/PushSubscriptionService.js|apps/profissional/index.html:2227; apps/cliente/index.html:1175|

## Scripts mortos ou suspeitos

Nenhum script local referenciado ausente foi detectado.


Observacao: detectar "nunca executado" exige coverage runtime por tela autenticada. Nesta auditoria estatica, "morto" significa referenciado e ausente ou legado/suspeito sem evidencia estatica de uso.

## Candidatos a defer sem risco aparente

|#|Pagina|Script|Uso|Impacto|
|---|---|---|---|---|
|30|apps/profissional/index.html:2107|/shared/js/LoggerService.js|boot/shared core|1.64|
|31|apps/profissional/index.html:2109|/shared/js/ApiService.js|boot/shared core|4.36|
|35|apps/profissional/index.html:2117|/shared/js/InputValidator.js|shared/on-demand|4.49|
|39|apps/profissional/index.html:2124|/shared/js/AnimationService.js|boot/shared core|2.63|
|40|apps/profissional/index.html:2125|/shared/js/MenuService.js|boot/shared core|1.28|
|51|apps/profissional/index.html:2142|/shared/js/BarberPole.js|shared/on-demand|1.88|
|52|apps/profissional/index.html:2144|/shared/js/LogoGlow.js|shared/on-demand|0.78|
|57|apps/profissional/index.html:2154|/shared/js/CacheManager.js|boot/shared core|1.17|
|98|apps/profissional/index.html:2208|/shared/js/GuardaIten.js|boot/shared core|2.09|
|104|apps/profissional/index.html:2219|assets/js/MonetizationGuard.js|boot/shared core|0.74|
|120|apps/profissional/index.html:2235|/shared/js/HeaderScrollBehavior.js|shared/on-demand|2.46|
|125|apps/profissional/index.html:2240|/events/catalog.js|shared/on-demand|0.35|
|126|apps/profissional/index.html:2241|/shared/js/SectionEventBus.js|shared/on-demand|0.56|
|127|apps/profissional/index.html:2242|/shared/js/PageSection.js|shared/on-demand|0.99|
|128|apps/profissional/index.html:2243|assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaState.js|pagina especifica|0.44|
|129|apps/profissional/index.html:2244|assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaView.js|pagina especifica|0.31|
|132|apps/profissional/index.html:2247|assets/js/pages/MinhaBarbeariaPage/StorySection/StoryState.js|pagina especifica|0.45|
|133|apps/profissional/index.html:2248|assets/js/pages/MinhaBarbeariaPage/StorySection/StoryView.js|pagina especifica|0.24|
|136|apps/profissional/index.html:2251|assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioState.js|pagina especifica|0.32|
|137|apps/profissional/index.html:2252|assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioView.js|pagina especifica|0.23|
|140|apps/profissional/index.html:2255|assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationState.js|pagina especifica|0.39|
|141|apps/profissional/index.html:2256|assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationView.js|pagina especifica|0.25|
|144|apps/profissional/index.html:2259|assets/js/pages/MinhaBarbeariaPage/QueueRealtimeClient.js|pagina especifica|0.62|
|145|apps/profissional/index.html:2260|assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueState.js|pagina especifica|0.38|
|146|apps/profissional/index.html:2261|assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueView.js|pagina especifica|0.24|
|153|apps/profissional/index.html:2268|assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsState.js|pagina especifica|0.37|
|154|apps/profissional/index.html:2269|assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsView.js|pagina especifica|0.25|
|171|apps/profissional/index.html:2287|assets/js/controllers/CadastroController.js|boot/shared core|1.12|
|177|apps/cliente/index.html:1053|/shared/js/LoggerService.js|boot/shared core|1.64|
|178|apps/cliente/index.html:1055|/shared/js/ApiService.js|boot/shared core|4.36|

## Scripts que precisam cuidado

|#|Pagina|Script|Tipo|Motivo|Impacto|
|---|---|---|---|---|---|
|1|admin.html:252|apps/profissional/assets/js/admin/AdminApiService.js|legado|global/vendor/boot|2.05|
|2|admin.html:253|apps/profissional/assets/js/admin/AdminDashboard.js|legado|AdminApiService|7.01|
|3|cliente.html:1333|shared/js/LogoutScreen.js|legado|global/vendor/boot|1.95|
|4|cliente.html:1335|shared/js/AnimationService.js|legado|global/vendor/boot|2.63|
|5|cliente.html:1336|shared/js/MenuService.js|legado|global/vendor/boot|1.28|
|6|cliente.html:1337|shared/js/UserService.js|legado|global/vendor/boot|2.38|
|7|cliente.html:1338|shared/js/AvatarService.js|legado|MenuService, UserService|2.71|
|8|cliente.html:1339|shared/js/SplashService.js|legado|global/vendor/boot|1.2|
|9|cliente.html:1341|shared/js/AppState.js|legado|global/vendor/boot|3.3|
|10|cliente.html:1343|shared/js/AuthGuard.js|legado|AppState|2.95|
|11|cliente.html:1344|shared/js/PermissionService.js|legado|AppState, AuthGuard|1.93|
|12|cliente.html:1345|shared/js/Router.js|legado|LogoutScreen, AnimationService, MenuService, AvatarService, SplashService, AppState, AuthGuard, ID|5.48|
|13|cliente.html:1346|shared/js/BarberPole.js|legado|global/vendor/boot|1.88|
|14|cliente.html:1347|shared/js/PerfilEditor.js|legado|global/vendor/boot|4.55|
|15|cliente.html:1348|(inline)|legado|Router|0.32|
|16|profissional.html:1291|shared/js/LogoutScreen.js|legado|global/vendor/boot|1.95|
|17|profissional.html:1293|shared/js/AnimationService.js|legado|global/vendor/boot|2.63|
|18|profissional.html:1294|shared/js/MenuService.js|legado|global/vendor/boot|1.28|
|19|profissional.html:1295|shared/js/UserService.js|legado|global/vendor/boot|2.38|
|20|profissional.html:1296|shared/js/AvatarService.js|legado|MenuService, UserService|2.71|
|21|profissional.html:1297|shared/js/SplashService.js|legado|global/vendor/boot|1.2|
|22|profissional.html:1299|shared/js/AppState.js|legado|global/vendor/boot|3.3|
|23|profissional.html:1301|shared/js/AuthGuard.js|legado|AppState|2.95|
|24|profissional.html:1302|shared/js/PermissionService.js|legado|AppState, AuthGuard|1.93|
|25|profissional.html:1303|shared/js/Router.js|legado|LogoutScreen, AnimationService, MenuService, AvatarService, SplashService, AppState, AuthGuard, ID|5.48|
|26|profissional.html:1304|shared/js/BarberPole.js|legado|global/vendor/boot|1.88|
|27|profissional.html:1305|shared/js/PerfilEditor.js|legado|global/vendor/boot|4.55|
|28|profissional.html:1306|(inline)|legado|Router|0.33|
|29|apps/profissional/index.html:2105|/shared/js/supabase.min.js|vendor|global/vendor/boot|54.7|
|32|apps/profissional/index.html:2111|/shared/js/SupabaseService.js|proprio|A, LoggerService, ApiService|7.45|
|33|apps/profissional/index.html:2113|/shared/js/SessionCache.js|proprio|URL|1.74|
|34|apps/profissional/index.html:2115|/shared/js/NavConfig.js|proprio|P|1.81|
|36|apps/profissional/index.html:2119|/shared/js/AuthService.js|proprio|A, Se, LoggerService, SupabaseService, URL, SessionCache, InputValidator|7.69|
|37|apps/profissional/index.html:2120|/shared/js/AuthUI.js|proprio|P, SupabaseService, URL, SessionCache, NavConfig, InputValidator, AuthService|4.68|
|38|apps/profissional/index.html:2122|/shared/js/LogoutScreen.js|proprio|P, AuthService|1.95|
|41|apps/profissional/index.html:2126|/shared/js/UserService.js|proprio|SupabaseService, AuthService|2.38|
|42|apps/profissional/index.html:2127|/shared/js/BackendApiService.js|proprio|ApiService, SupabaseService|3.49|
|43|apps/profissional/index.html:2128|/shared/js/AvatarService.js|proprio|Se, LoggerService, URL, SessionCache, MenuService, UserService, BackendApiService|2.71|
|44|apps/profissional/index.html:2129|/shared/js/SplashService.js|proprio|URL|1.2|
|45|apps/profissional/index.html:2131|/shared/js/AppState.js|proprio|LoggerService|3.3|

## Candidatos a ES module

|#|Script|Classes/globals|Uso|
|---|---|---|---|
|30|/shared/js/LoggerService.js|LoggerService|boot/shared core|
|31|/shared/js/ApiService.js|ApiQuery, ApiService|boot/shared core|
|32|/shared/js/SupabaseService.js|SupabaseService, URL, KEY|boot|
|33|/shared/js/SessionCache.js|SessionCache|shared/on-demand|
|34|/shared/js/NavConfig.js|NavConfig|boot|
|35|/shared/js/InputValidator.js|InputValidator, Validator|shared/on-demand|
|36|/shared/js/AuthService.js|AuthService|boot|
|38|/shared/js/LogoutScreen.js|LogoutScreen|on-demand/evento|
|42|/shared/js/BackendApiService.js|BackendApiService|boot/shared core|
|45|/shared/js/AppState.js|AppState|shared/on-demand|
|46|/shared/js/GuestMode.js|GuestMode|shared/on-demand|
|47|/shared/js/AuthGuard.js|AuthGuard, ID|boot/shared core|
|49|/shared/js/NavigationViewService.js|NavigationViewService|boot/shared core|
|50|/shared/js/Router.js|Router|boot|
|51|/shared/js/BarberPole.js|BarberPole, OFF|shared/on-demand|
|52|/shared/js/LogoGlow.js|LogoGlow|shared/on-demand|
|53|/shared/js/StoryViewer.js|StorySwipeTransition, StoryProgressLayer, StoryViewer|on-demand/evento|
|54|/shared/js/StoriesLayout.js|StoriesCarousel, StoriesLayout|shared/on-demand|
|55|/shared/js/GeoService.js|GeoService, TIMEOUTS, MSGS|boot/shared core|
|56|/shared/js/BarbershopRepository.js|BarbershopRepository, ALLOWED_REASONS, FIELDS|boot/shared core|
|57|/shared/js/CacheManager.js|CacheManager|boot/shared core|
|58|/shared/js/StateManager.js|StateManager|boot/shared core|
|59|/shared/js/ResourceLoader.js|ResourceLoader|shared/on-demand|
|60|/shared/js/NavigationManager.js|NavigationManager|boot/shared core|
|61|/shared/js/BarbeariaPage.js|BarbeariaPage, TEXTO_FILA|shared/on-demand|
|62|/shared/js/BarbeiroPage.js|BarbeiroPage|shared/on-demand|
|63|/shared/js/UserRepository.js|UserRepository|boot/shared core|
|64|/shared/js/ProfileRepository.js|ProfileRepository|boot/shared core|
|65|/shared/js/BarbershopService.js|BarbershopService, R, PRIOR_N|boot/shared core|
|66|/shared/js/ProfessionalService.js|ProfessionalService|boot/shared core|
|67|/shared/js/StatusFechamentoModal.js|StatusFechamentoModal|on-demand/evento|
|68|/shared/js/FavoritosClientesService.js|FavoritosClientesService|boot/shared core|
|69|/shared/js/CadeiraService.js|CadeiraService|boot/shared core|
|70|/shared/js/ClienteSeletorModal.js|ClienteSeletorModal, UUID_RE|on-demand/evento|
|71|/shared/js/CorteModal.js|CorteModal|on-demand/evento|
|72|/shared/js/MensalistaModal.js|MensalistaModal|on-demand/evento|
|73|/shared/js/FinalizarCorteModal.js|FinalizarCorteModal|on-demand/evento|
|74|/shared/js/FinanceiroRepository.js|FinanceiroRepository|boot/shared core|
|75|/shared/js/FinanceiroService.js|FinanceiroService|boot/shared core|
|76|/shared/js/BarberFinanceModal.js|BarberFinanceModal|on-demand/evento|

## Candidatos a code splitting por pagina/section

|#|Script|Referencia|Uso|Impacto|
|---|---|---|---|---|
|159|assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js|apps/profissional/index.html:2274|pagina especifica|29.68|
|61|/shared/js/BarbeariaPage.js|apps/profissional/index.html:2162|shared/on-demand|14.76|
|274|/shared/js/BarbeariaPage.js|apps/cliente/index.html:1178|shared/on-demand|14.76|
|94|/shared/js/MapWidget.js|apps/profissional/index.html:2201|on-demand/evento|8.22|
|235|/shared/js/MapWidget.js|apps/cliente/index.html:1134|on-demand/evento|8.22|
|92|/shared/js/NearbyBarbershopsWidget.js|apps/profissional/index.html:2199|on-demand/evento|7.83|
|233|/shared/js/NearbyBarbershopsWidget.js|apps/cliente/index.html:1132|on-demand/evento|7.83|
|110|/shared/js/MessagesWidget.js|apps/profissional/index.html:2225|on-demand/evento|6.47|
|245|/shared/js/MessagesWidget.js|apps/cliente/index.html:1148|on-demand/evento|6.47|
|70|/shared/js/ClienteSeletorModal.js|apps/profissional/index.html:2174|on-demand/evento|6.44|
|162|assets/js/pages/ParceriasPage.js|apps/profissional/index.html:2277|pagina especifica|5.31|
|72|/shared/js/MensalistaModal.js|apps/profissional/index.html:2176|on-demand/evento|4.4|
|95|/shared/js/SearchWidget.js|apps/profissional/index.html:2203|on-demand/evento|4.23|
|236|/shared/js/SearchWidget.js|apps/cliente/index.html:1136|on-demand/evento|4.23|
|163|assets/js/pages/FinancasPage.js|apps/profissional/index.html:2278|pagina especifica|3.96|
|62|/shared/js/BarbeiroPage.js|apps/profissional/index.html:2164|shared/on-demand|3.62|
|275|/shared/js/BarbeiroPage.js|apps/cliente/index.html:1179|shared/on-demand|3.62|
|164|assets/js/pages/GpsPage.js|apps/profissional/index.html:2279|pagina especifica|3.48|
|71|/shared/js/CorteModal.js|apps/profissional/index.html:2175|on-demand/evento|2.9|
|211|/shared/js/CorteModal.js|apps/cliente/index.html:1107|on-demand/evento|2.9|
|124|assets/js/pages/AgendaPage.js|apps/profissional/index.html:2239|pagina especifica|2.71|
|121|assets/js/pages/DestaquesPage.js|apps/profissional/index.html:2236|pagina especifica|2.68|
|264|assets/js/pages/DestaquesPage.js|apps/cliente/index.html:1168|pagina especifica|2.64|
|265|assets/js/pages/BarbeirosPage.js|apps/cliente/index.html:1169|pagina especifica|2.55|
|122|assets/js/pages/BarbeirosPage.js|apps/profissional/index.html:2237|pagina especifica|2.52|
|161|assets/js/pages/CriarBarbeariaPage.js|apps/profissional/index.html:2276|pagina especifica|2.46|
|76|/shared/js/BarberFinanceModal.js|apps/profissional/index.html:2180|on-demand/evento|2.42|
|123|assets/js/pages/BarbeariasPage.js|apps/profissional/index.html:2238|pagina especifica|2.41|
|266|assets/js/pages/BarbeariasPage.js|apps/cliente/index.html:1170|pagina especifica|2.41|
|217|/shared/js/QueueModalPayloadBuilder.js|apps/cliente/index.html:1113|on-demand/evento|2.31|
|261|assets/js/pages/FavoritesPage.js|apps/cliente/index.html:1165|pagina especifica|2.25|
|165|assets/js/pages/QueueWidget.js|apps/profissional/index.html:2280|pagina especifica|2.17|
|77|/shared/js/MenosPercentualModal.js|apps/profissional/index.html:2181|on-demand/evento|1.97|
|262|assets/js/pages/ProfilePage.js|apps/cliente/index.html:1166|pagina especifica|1.82|
|73|/shared/js/FinalizarCorteModal.js|apps/profissional/index.html:2177|on-demand/evento|1.79|
|67|/shared/js/StatusFechamentoModal.js|apps/profissional/index.html:2171|on-demand/evento|1.61|
|207|/shared/js/StatusFechamentoModal.js|apps/cliente/index.html:1103|on-demand/evento|1.61|
|85|/shared/js/ModalController.js|apps/profissional/index.html:2189|on-demand/evento|1.09|
|225|/shared/js/ModalController.js|apps/cliente/index.html:1121|on-demand/evento|1.09|
|80|/shared/js/ClienteAusenteModal.js|apps/profissional/index.html:2184|on-demand/evento|1.07|

## Ordem real necessaria por pagina

### admin.html

|Ordem|Script|Estrategia|Dependencias inferidas|
|---|---|---|---|
|1|apps/profissional/assets/js/admin/AdminApiService.js|blocking|-|
|2|apps/profissional/assets/js/admin/AdminDashboard.js|blocking|AdminApiService|

### index.html

|Ordem|Script|Estrategia|Dependencias inferidas|
|---|---|---|---|

### cliente.html

|Ordem|Script|Estrategia|Dependencias inferidas|
|---|---|---|---|
|1|shared/js/LogoutScreen.js|blocking|-|
|2|shared/js/AnimationService.js|blocking|-|
|3|shared/js/MenuService.js|blocking|-|
|4|shared/js/UserService.js|blocking|-|
|5|shared/js/AvatarService.js|blocking|MenuService, UserService|
|6|shared/js/SplashService.js|blocking|-|
|7|shared/js/AppState.js|blocking|-|
|8|shared/js/AuthGuard.js|blocking|AppState|
|9|shared/js/PermissionService.js|blocking|AppState, AuthGuard|
|10|shared/js/Router.js|blocking|LogoutScreen, AnimationService, MenuService, AvatarService, SplashService, AppState, AuthGuard, ID|
|11|shared/js/BarberPole.js|blocking|-|
|12|shared/js/PerfilEditor.js|blocking|-|
|13|(inline)|blocking|Router|

### profissional.html

|Ordem|Script|Estrategia|Dependencias inferidas|
|---|---|---|---|
|1|shared/js/LogoutScreen.js|blocking|-|
|2|shared/js/AnimationService.js|blocking|-|
|3|shared/js/MenuService.js|blocking|-|
|4|shared/js/UserService.js|blocking|-|
|5|shared/js/AvatarService.js|blocking|MenuService, UserService|
|6|shared/js/SplashService.js|blocking|-|
|7|shared/js/AppState.js|blocking|-|
|8|shared/js/AuthGuard.js|blocking|AppState|
|9|shared/js/PermissionService.js|blocking|AppState, AuthGuard|
|10|shared/js/Router.js|blocking|LogoutScreen, AnimationService, MenuService, AvatarService, SplashService, AppState, AuthGuard, ID|
|11|shared/js/BarberPole.js|blocking|-|
|12|shared/js/PerfilEditor.js|blocking|-|
|13|(inline)|blocking|Router|

### apps/profissional/index.html

|Ordem|Script|Estrategia|Dependencias inferidas|
|---|---|---|---|
|1|/shared/js/supabase.min.js|blocking|-|
|2|/shared/js/LoggerService.js|blocking|-|
|3|/shared/js/ApiService.js|blocking|-|
|4|/shared/js/SupabaseService.js|blocking|A, LoggerService, ApiService|
|5|/shared/js/SessionCache.js|blocking|URL|
|6|/shared/js/NavConfig.js|blocking|P|
|7|/shared/js/InputValidator.js|blocking|-|
|8|/shared/js/AuthService.js|blocking|A, Se, LoggerService, SupabaseService, URL, SessionCache, InputValidator|
|9|/shared/js/AuthUI.js|blocking|P, SupabaseService, URL, SessionCache, NavConfig, InputValidator, AuthService|
|10|/shared/js/LogoutScreen.js|blocking|P, AuthService|
|11|/shared/js/AnimationService.js|blocking|-|
|12|/shared/js/MenuService.js|blocking|-|
|13|/shared/js/UserService.js|blocking|SupabaseService, AuthService|
|14|/shared/js/BackendApiService.js|blocking|ApiService, SupabaseService|
|15|/shared/js/AvatarService.js|blocking|Se, LoggerService, URL, SessionCache, MenuService, UserService, BackendApiService|
|16|/shared/js/SplashService.js|blocking|URL|
|17|/shared/js/AppState.js|blocking|LoggerService|
|18|/shared/js/GuestMode.js|blocking|A, AppState|
|19|/shared/js/AuthGuard.js|blocking|A, Se, AppState|
|20|/shared/js/PermissionService.js|blocking|A, AppState, AuthGuard|
|21|/shared/js/NavigationViewService.js|blocking|GuestMode, ID|
|22|/shared/js/Router.js|blocking|A, Se, LoggerService, LogoutScreen, AnimationService, MenuService, AvatarService, SplashService, AppState, GuestMode, AuthGuard, ID|
|23|/shared/js/BarberPole.js|blocking|-|
|24|/shared/js/LogoGlow.js|blocking|-|
|25|/shared/js/StoryViewer.js|blocking|P, Pr, AuthGuard|
|26|/shared/js/StoriesLayout.js|blocking|P, StoryViewer|
|27|/shared/js/GeoService.js|blocking|P, Se, SupabaseService, ID|
|28|/shared/js/BarbershopRepository.js|blocking|Se, ApiService, InputValidator, ID|
|29|/shared/js/CacheManager.js|blocking|-|
|30|/shared/js/StateManager.js|blocking|Se, CacheManager|
|31|/shared/js/ResourceLoader.js|blocking|Se, URL, CacheManager, StateManager|
|32|/shared/js/NavigationManager.js|blocking|P, Se, LoggerService, ApiService, BarbershopRepository, CacheManager, StateManager|
|33|/shared/js/BarbeariaPage.js|blocking|P, Se, Re, LoggerService, ApiService, SupabaseService, InputValidator, AuthService, AppState, ID, BarbershopRepository, CacheManager|
|34|/shared/js/BarbeiroPage.js|blocking|P, Se, Pr, LoggerService, ApiService, SupabaseService, InputValidator, ID, BarbershopRepository, CacheManager, NavigationManager|
|35|/shared/js/UserRepository.js|blocking|ApiService, InputValidator, BackendApiService|
|36|/shared/js/ProfileRepository.js|blocking|ApiService, SupabaseService, URL, InputValidator, ID, BarbershopRepository|
|37|/shared/js/BarbershopService.js|blocking|P, Se, LoggerService, SupabaseService, AuthGuard, GeoService, BarbershopRepository, ProfileRepository|
|38|/shared/js/ProfessionalService.js|blocking|A, LoggerService, SupabaseService, AppState, AuthGuard, ProfileRepository, BarbershopService|
|39|/shared/js/StatusFechamentoModal.js|blocking|BarbeiroPage|
|40|/shared/js/FavoritosClientesService.js|blocking|InputValidator, UserRepository|
|41|/shared/js/CadeiraService.js|blocking|A, LoggerService, ApiService, SupabaseService, InputValidator, UserRepository, FavoritosClientesService|
|42|/shared/js/ClienteSeletorModal.js|blocking|SupabaseService, BackendApiService, UserRepository, CadeiraService|
|43|/shared/js/CorteModal.js|blocking|R|
|44|/shared/js/MensalistaModal.js|blocking|Se, Re, SupabaseService, R|
|45|/shared/js/FinalizarCorteModal.js|blocking|Cr, Pr|
|46|/shared/js/FinanceiroRepository.js|blocking|A, LoggerService, ApiService, InputValidator|
|47|/shared/js/FinanceiroService.js|blocking|LoggerService, ApiService, InputValidator, FinanceiroRepository|
|48|/shared/js/BarberFinanceModal.js|blocking|P, LoggerService, R, FinanceiroService|
|49|/shared/js/MenosPercentualModal.js|blocking|P, Cr, R|
|50|/shared/js/FluxoDeFila.js|blocking|T, A, P, URL|
|51|/shared/js/ConfirmacaoCorteModal.js|blocking|URL, FluxoDeFila|
|52|/shared/js/ClienteAusenteModal.js|blocking|FluxoDeFila|
|53|/shared/js/BarbeiroEsperaFluxo.js|blocking|P, FluxoDeFila|
|54|/shared/js/BarbeiroCard.js|blocking|SupabaseService, BarbeariaPage|
|55|/shared/js/Cadeira.js|blocking|SupabaseService|
|56|/shared/js/FilaController.js|blocking|LoggerService, ApiService, InputValidator, CadeiraService|
|57|/shared/js/ModalController.js|blocking|AuthService, CorteModal|
|58|/shared/js/ClienteController.js|blocking|A, AuthService, CadeiraService, FilaController|
|59|/shared/js/BarbeariaStatusSync.js|blocking|SupabaseService, BarbeariaPage, StatusFechamentoModal|
|60|https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js|blocking|-|
|61|/shared/js/BffApiService.js|blocking|SupabaseService, URL, GeoService|
|62|/shared/js/BffAuthClient.js|blocking|P, SupabaseService, AuthService|
|63|/shared/js/BarbeariaApiClient.js|blocking|Se, LoggerService, BffApiService|
|64|/shared/js/NearbyBarbershopsWidget.js|blocking|P, Se, Rt, LoggerService, SupabaseService, URL, GeoService, BarbershopRepository, ProfileRepository, BarbershopService, ProfessionalService, StatusFechamentoModal|
|65|/shared/js/LojaMarker.js|blocking|URL|
|66|/shared/js/MapWidget.js|blocking|A, P, Re, Rt, ApiService, URL, SessionCache, AuthService, GeoService, BarbeariaApiClient, NearbyBarbershopsWidget, LojaMarker|
|67|/shared/js/SearchWidget.js|blocking|P, ApiService, SupabaseService, InputValidator, ID|
|68|/shared/js/FonteSalao.js|blocking|ApiService, SupabaseService|
|69|/shared/js/CapaBarbearia.js|blocking|SupabaseService, InputValidator|
|70|/shared/js/GuardaIten.js|blocking|-|
|71|/shared/js/MapPanelModule.js|blocking|LoggerService, Router, GeoService, NearbyBarbershopsWidget, MapWidget|
|72|/shared/js/MapOrientationModule.js|blocking|Se, Re, Router, MapWidget, MapPanel|
|73|/shared/js/PaymentFlowHandler.js|blocking|P, SupabaseService, URL|
|74|/shared/js/ProLandingGate.js|blocking|P, Se, SplashService, BarberPole|
|75|assets/js/LegalConsentService.js|blocking|LoggerService, SupabaseService|
|76|assets/js/MonetizationGuard.js|blocking|-|
|77|assets/js/PlanosService.js|blocking|PaymentFlowHandler, MonetizationGuard|
|78|/shared/js/MessageService.js|blocking|LoggerService, SupabaseService, InputValidator, ID|
|79|/shared/js/MessageCryptoService.js|blocking|A, P|
|80|/shared/js/MessageSignalingService.js|blocking|SupabaseService|
|81|/shared/js/P2PMessageConnectionService.js|blocking|A, P, Se, AuthService, MessageCryptoService, MessageSignalingService|
|82|/shared/js/MessagesWidget.js|blocking|A, P, Se, SupabaseService, AnimationService, AuthGuard, ID, DigText, MessageCryptoService, MessageSignalingService, P2PMessageConnectionService|
|83|/shared/js/NotificationService.js|blocking|P, SupabaseService, AuthService, ID, Router|
|84|/shared/js/PushSubscriptionService.js|blocking|A, P, Se, Re, LoggerService, SupabaseService, ID|
|85|/shared/js/OfflineSyncQueue.js|blocking|P|
|86|/shared/js/AppointmentRepository.js|blocking|ApiService, InputValidator|
|87|/shared/js/QueueRepository.js|blocking|ApiService, SupabaseService, InputValidator|
|88|/shared/js/LgpdService.js|blocking|A, LoggerService, SupabaseService, LegalConsentService|
|89|/shared/js/TermsPage.js|blocking|P|
|90|/shared/js/PerfilEditor.js|blocking|P, LoggerService, SupabaseService, SessionCache, AuthService, ProfileRepository, NotificationService|
|91|/shared/js/FooterScrollManager.js|blocking|P, Router|
|92|/shared/js/HeaderScrollBehavior.js|blocking|-|
|93|assets/js/pages/DestaquesPage.js|blocking|LoggerService, SupabaseService, BarbershopRepository, BarbershopService, StatusFechamentoModal, DigText, FonteSalao, CapaBarbearia|
|94|assets/js/pages/BarbeirosPage.js|blocking|LoggerService, SupabaseService, BarbershopRepository, ProfileRepository, BarbershopService, ProfessionalService, DigText|
|95|assets/js/pages/BarbeariasPage.js|blocking|Pr, LoggerService, SupabaseService, BarbershopRepository, BarbershopService, StatusFechamentoModal, DigText, FonteSalao, CapaBarbearia|
|96|assets/js/pages/AgendaPage.js|blocking|LoggerService, SupabaseService, AuthService, AppState, R, NotificationService, AppointmentRepository|
|97|/events/catalog.js|blocking|-|
|98|/shared/js/SectionEventBus.js|blocking|-|
|99|/shared/js/PageSection.js|blocking|-|
|100|assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaState.js|blocking|-|
|101|assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaView.js|blocking|-|
|102|assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaController.js|blocking|SectionEventCatalog, AgendaState, AgendaView|
|103|assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaSection.js|blocking|PageSection, AgendaController|
|104|assets/js/pages/MinhaBarbeariaPage/StorySection/StoryState.js|blocking|-|
|105|assets/js/pages/MinhaBarbeariaPage/StorySection/StoryView.js|blocking|-|
|106|assets/js/pages/MinhaBarbeariaPage/StorySection/StoryController.js|blocking|SectionEventCatalog|
|107|assets/js/pages/MinhaBarbeariaPage/StorySection/StorySection.js|blocking|PageSection, StoryController|
|108|assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioState.js|blocking|-|
|109|assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioView.js|blocking|-|
|110|assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioController.js|blocking|SectionEventCatalog|
|111|assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioSection.js|blocking|PageSection, PortfolioController|
|112|assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationState.js|blocking|-|
|113|assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationView.js|blocking|-|
|114|assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationController.js|blocking|SectionEventCatalog|
|115|assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationSection.js|blocking|PageSection, NotificationController|
|116|assets/js/pages/MinhaBarbeariaPage/QueueRealtimeClient.js|blocking|-|
|117|assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueState.js|blocking|-|
|118|assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueView.js|blocking|-|
|119|assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueController.js|blocking|SectionEventCatalog, QueueRealtimeClient|
|120|assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueSection.js|blocking|PageSection, QueueController|
|121|assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsState.js|blocking|-|
|122|assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsView.js|blocking|-|
|123|assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsController.js|blocking|SectionEventCatalog|
|124|assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsSection.js|blocking|PageSection, AnalyticsController|
|125|assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsState.js|blocking|-|
|126|assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsView.js|blocking|-|
|127|assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsController.js|blocking|SectionEventCatalog|
|128|assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsSection.js|blocking|PageSection, SettingsController|
|129|/shared/js/MediaP2P.js|blocking|P, SupabaseService, URL|
|130|assets/js/GpsPanelMap.js|blocking|P|
|131|assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js|blocking|A, Se, Re, Pr, LoggerService, ApiService, SupabaseService, URL, InputValidator, AuthService, AnimationService, BarbershopRepository|
|132|assets/js/pages/MinhaBarbeariaPage.js|blocking|MinhaBarbeariaRuntimeController|
|133|assets/js/pages/CriarBarbeariaPage.js|blocking|Pr, SupabaseService, SessionCache, InputValidator, AuthService, NotificationService|
|134|assets/js/pages/ParceriasPage.js|blocking|Se, LoggerService, SupabaseService, InputValidator, AuthService, AppState, BarbershopRepository, ProfileRepository, FonteSalao, CapaBarbearia, NotificationService|
|135|assets/js/pages/FinancasPage.js|blocking|P, Cr, LoggerService, ApiService, SupabaseService, AuthService, BarbershopRepository, R, FinanceiroService, BarberFinanceModal, MenosPercentualModal, NotificationService|
|136|assets/js/pages/GpsPage.js|blocking|Pr, SupabaseService, AuthService, ID, NotificationService|
|137|assets/js/pages/QueueWidget.js|blocking|Re, LoggerService, SupabaseService, AuthService, BarbershopRepository, Cadeira, QueueRepository|
|138|/shared/js/PWAInstallBanner.js|blocking|P, Re, LoggerService, R|
|139|assets/js/ProfissionalStartupSplash.js|blocking|BarberPole|
|140|assets/js/AppBootstrap.js|blocking|Se, LoggerService, URL, AppState, GeoService, NearbyBarbershopsWidget, MapWidget, MapPanel, MapOrientationModule, ProLandingGate, MessagesWidget, NotificationService|
|141|/shared/js/AuthController.js|blocking|InputValidator, AuthService, AuthUI, MonetizationGuard|
|142|assets/js/controllers/PlanosController.js|blocking|Se, LoggerService, AuthService, ID, PlanosService, NotificationService|
|143|assets/js/controllers/CadastroController.js|blocking|-|
|144|assets/js/controllers/TermosController.js|blocking|SupabaseService, LegalConsentService, MonetizationGuard|
|145|/shared/js/QueueConfirmService.js|blocking|A, P, Se, ApiService, SupabaseService, URL, BarbershopRepository, CacheManager, ConfirmacaoCorteModal, NotificationService, MinhaBarbeariaPage|
|146|assets/js/app.js|blocking|AuthService, Router, BarbeariaPage, BarbeiroPage, MonetizationGuard, NotificationService, DestaquesPage, BarbeirosPage, BarbeariasPage, AgendaPage, MinhaBarbeariaPage, CriarBarbeariaPage|
|147|(inline)|blocking|-|

### apps/cliente/index.html

|Ordem|Script|Estrategia|Dependencias inferidas|
|---|---|---|---|
|1|/shared/js/supabase.min.js|blocking|-|
|2|/shared/js/LoggerService.js|blocking|-|
|3|/shared/js/ApiService.js|blocking|-|
|4|/shared/js/SupabaseService.js|blocking|A, LoggerService, ApiService|
|5|/shared/js/SessionCache.js|blocking|URL|
|6|/shared/js/NavConfig.js|blocking|P|
|7|/shared/js/InputValidator.js|blocking|-|
|8|/shared/js/AuthService.js|blocking|A, Se, LoggerService, SupabaseService, URL, SessionCache, InputValidator|
|9|/shared/js/AuthUI.js|blocking|P, SupabaseService, URL, SessionCache, NavConfig, InputValidator, AuthService|
|10|/shared/js/LogoutScreen.js|blocking|P, AuthService|
|11|/shared/js/AnimationService.js|blocking|-|
|12|/shared/js/MenuService.js|blocking|-|
|13|/shared/js/UserService.js|blocking|SupabaseService, AuthService|
|14|/shared/js/BackendApiService.js|blocking|ApiService, SupabaseService|
|15|/shared/js/AvatarService.js|blocking|Se, LoggerService, URL, SessionCache, MenuService, UserService, BackendApiService|
|16|/shared/js/SplashService.js|blocking|URL|
|17|/shared/js/AppState.js|blocking|LoggerService|
|18|/shared/js/GuestMode.js|blocking|A, AppState|
|19|/shared/js/AuthGuard.js|blocking|A, Se, AppState|
|20|/shared/js/PermissionService.js|blocking|A, AppState, AuthGuard|
|21|/shared/js/NavigationViewService.js|blocking|GuestMode, ID|
|22|/shared/js/Router.js|blocking|A, Se, LoggerService, LogoutScreen, AnimationService, MenuService, AvatarService, SplashService, AppState, GuestMode, AuthGuard, ID|
|23|/shared/js/BarberPole.js|blocking|-|
|24|/shared/js/LogoGlow.js|blocking|-|
|25|/shared/js/StoryViewer.js|blocking|P, Pr, AuthGuard|
|26|/shared/js/StoriesLayout.js|blocking|P, StoryViewer|
|27|/shared/js/GeoService.js|blocking|P, Se, SupabaseService, ID|
|28|/shared/js/BarbershopRepository.js|blocking|Se, ApiService, InputValidator, ID|
|29|/shared/js/ProfileRepository.js|blocking|ApiService, SupabaseService, URL, InputValidator, ID, BarbershopRepository|
|30|/shared/js/BarbershopService.js|blocking|P, Se, LoggerService, SupabaseService, AuthGuard, GeoService, BarbershopRepository, ProfileRepository|
|31|/shared/js/ProfessionalService.js|blocking|A, LoggerService, SupabaseService, AppState, AuthGuard, ProfileRepository, BarbershopService|
|32|/shared/js/StatusFechamentoModal.js|blocking|-|
|33|/shared/js/BarbershopAvailabilityService.js|blocking|A, StatusFechamentoModal|
|34|/shared/js/QueueRepository.js|blocking|ApiService, SupabaseService, InputValidator|
|35|/shared/js/CadeiraService.js|blocking|A, LoggerService, ApiService, SupabaseService, InputValidator, QueueRepository|
|36|/shared/js/CorteModal.js|blocking|R|
|37|/shared/js/BarbeiroCard.js|blocking|SupabaseService|
|38|/shared/js/Cadeira.js|blocking|SupabaseService|
|39|/shared/js/FilaController.js|blocking|LoggerService, ApiService, InputValidator, QueueRepository, CadeiraService|
|40|/shared/js/QueuePoller.js|blocking|Se, LoggerService, ApiService, URL, BackendApiService, ID, BarbershopRepository, QueueRepository|
|41|/shared/js/FluxoDeFila.js|blocking|T, A, P, URL, QueuePoller|
|42|/shared/js/QueueModalPayloadBuilder.js|blocking|A, P, URL, Cadeira, FluxoDeFila|
|43|/shared/js/QueueRealtimeNotifier.js|blocking|P, Re, LoggerService, SupabaseService, QueueRepository|
|44|/shared/js/QueueStateUpdater.js|blocking|P, LoggerService, QueueRealtimeNotifier|
|45|/shared/js/QueuePositionNotificationService.js|blocking|P, LoggerService, QueueStateUpdater|
|46|/shared/js/QueuePositionPresenter.js|blocking|P, LoggerService, URL, AuthService, FluxoDeFila, QueueModalPayloadBuilder, QueueRealtimeNotifier, QueueStateUpdater, QueuePositionNotificationService|
|47|/shared/js/ConfirmacaoCorteModal.js|blocking|URL, FluxoDeFila|
|48|/shared/js/CadeiraConfirmacaoService.js|blocking|P, LoggerService, ApiService, URL, QueuePoller, ConfirmacaoCorteModal|
|49|/shared/js/ChegadaProducaoService.js|blocking|P, LoggerService, ApiService, AuthService, QueueRepository, CadeiraService, Cadeira, FluxoDeFila, CadeiraConfirmacaoService|
|50|/shared/js/ModalController.js|blocking|AuthService, CorteModal|
|51|/shared/js/ClienteController.js|blocking|A, AuthService, CadeiraService, FilaController|
|52|/shared/js/BarbeariaStatusSync.js|blocking|SupabaseService, StatusFechamentoModal|
|53|https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js|blocking|-|
|54|/shared/js/BffApiService.js|blocking|SupabaseService, URL, GeoService|
|55|/shared/js/BffAuthClient.js|blocking|P, SupabaseService, AuthService|
|56|/shared/js/AgendaBffClient.js|blocking|P|
|57|/shared/js/BarbeariaApiClient.js|blocking|Se, LoggerService, BffApiService|
|58|/shared/js/NearbyBarbershopsWidget.js|blocking|P, Se, Rt, LoggerService, SupabaseService, URL, GeoService, BarbershopRepository, ProfileRepository, BarbershopService, ProfessionalService, StatusFechamentoModal|
|59|/shared/js/LojaMarker.js|blocking|URL|
|60|/shared/js/MapWidget.js|blocking|A, P, Re, Rt, ApiService, URL, SessionCache, AuthService, GeoService, BarbeariaApiClient, NearbyBarbershopsWidget, LojaMarker|
|61|/shared/js/SearchWidget.js|blocking|P, ApiService, SupabaseService, InputValidator, ID|
|62|/shared/js/FonteSalao.js|blocking|ApiService, SupabaseService|
|63|/shared/js/CapaBarbearia.js|blocking|SupabaseService, InputValidator|
|64|/shared/js/MapPanelModule.js|blocking|LoggerService, Router, GeoService, NearbyBarbershopsWidget, MapWidget|
|65|/shared/js/MapOrientationModule.js|blocking|Se, Re, Router, MapWidget, MapPanel|
|66|/shared/js/MessageService.js|blocking|LoggerService, SupabaseService, InputValidator, ID|
|67|/shared/js/MessageCryptoService.js|blocking|A, P|
|68|/shared/js/MessageSignalingService.js|blocking|SupabaseService|
|69|/shared/js/P2PMessageConnectionService.js|blocking|A, P, Se, AuthService, MessageCryptoService, MessageSignalingService|
|70|/shared/js/MessagesWidget.js|blocking|A, P, Se, SupabaseService, AnimationService, AuthGuard, ID, DigText, MessageCryptoService, MessageSignalingService, P2PMessageConnectionService|
|71|/shared/js/NotificationService.js|blocking|P, SupabaseService, AuthService, ID, Router, QueuePoller|
|72|/shared/js/LgpdService.js|blocking|A, LoggerService, SupabaseService|
|73|/shared/js/TermsPage.js|blocking|P|
|74|/shared/js/PerfilEditor.js|blocking|P, LoggerService, SupabaseService, SessionCache, AuthService, ProfileRepository, NotificationService|
|75|/shared/js/FooterScrollManager.js|blocking|P, Router|
|76|/shared/js/HeaderScrollBehavior.js|blocking|-|
|77|assets/js/pages/LoginPage.js|blocking|P, InputValidator, AuthService, AuthUI|
|78|assets/js/pages/RegisterPage.js|blocking|P, InputValidator, AuthService, AuthUI|
|79|assets/js/pages/ForgotPasswordPage.js|blocking|P, AuthService, AuthUI|
|80|assets/js/pages/HomePage.js|blocking|P, AuthGuard, StoryViewer, BarbershopService, MapPanel|
|81|assets/js/pages/SearchPage.js|blocking|A, P, SearchWidget|
|82|/shared/js/Cliente.js|blocking|InputValidator|
|83|/shared/js/Agendamento.js|blocking|InputValidator|
|84|assets/js/ClienteRepository.js|blocking|ApiService, InputValidator, ProfileRepository|
|85|assets/js/ClienteService.js|blocking|AgendaBffClient, Cliente, ClienteRepository|
|86|assets/js/pages/FavoritesPage.js|blocking|Se, LoggerService, SupabaseService, AuthService, AppState, ProfileRepository, DigText, CapaBarbearia|
|87|assets/js/pages/ProfilePage.js|blocking|P, SupabaseService, URL, SessionCache, Router, ProfileRepository, PerfilEditor|
|88|assets/js/pages/LogoutPage.js|blocking|A, P, Router|
|89|assets/js/pages/DestaquesPage.js|blocking|LoggerService, SupabaseService, BarbershopRepository, BarbershopService, StatusFechamentoModal, DigText, FonteSalao, CapaBarbearia|
|90|assets/js/pages/BarbeirosPage.js|blocking|LoggerService, SupabaseService, BarbershopRepository, ProfileRepository, BarbershopService, ProfessionalService, DigText|
|91|assets/js/pages/BarbeariasPage.js|blocking|Pr, LoggerService, SupabaseService, BarbershopRepository, BarbershopService, StatusFechamentoModal, DigText, FonteSalao, CapaBarbearia|
|92|/shared/js/CacheManager.js|blocking|-|
|93|/shared/js/StateManager.js|blocking|Se, CacheManager|
|94|/shared/js/ResourceLoader.js|blocking|Se, URL, CacheManager, StateManager|
|95|/shared/js/NavigationManager.js|blocking|P, Se, LoggerService, ApiService, BarbershopRepository, CacheManager, StateManager|
|96|/shared/js/PushSubscriptionService.js|blocking|A, P, Se, Re, LoggerService, SupabaseService, ID|
|97|/shared/js/OfflineSyncQueue.js|blocking|P|
|98|/shared/js/FilaPresencaService.js|blocking|P, LoggerService, ApiService, AuthService, QueueRepository, FluxoDeFila, QueueModalPayloadBuilder, ClienteController, BffApiService, NotificationService, Cliente|
|99|/shared/js/BarbeariaPage.js|blocking|P, Se, Re, LoggerService, ApiService, SupabaseService, InputValidator, AuthService, AppState, ID, BarbershopRepository, BarbershopService|
|100|/shared/js/BarbeiroPage.js|blocking|P, Se, Pr, LoggerService, ApiService, SupabaseService, InputValidator, ID, BarbershopRepository, ProfessionalService, CacheManager, NavigationManager|
|101|/shared/js/PWAInstallBanner.js|blocking|P, Re, LoggerService, R|
|102|assets/js/ClienteStartupSplash.js|blocking|P, BarberPole, Cliente|
|103|assets/js/AppBootstrap.js|blocking|LoggerService, URL, AppState, GeoService, NearbyBarbershopsWidget, MapWidget, MapPanel, MapOrientationModule, MessagesWidget, NotificationService, LgpdService, TermsPage|
|104|/shared/js/QueueConfirmService.js|blocking|A, P, Se, ApiService, SupabaseService, URL, BarbershopRepository, QueuePoller, ConfirmacaoCorteModal, CadeiraConfirmacaoService, NotificationService, Cliente|
|105|assets/js/app.js|blocking|SupabaseService, AuthService, Router, BarbershopRepository, ProfileRepository, BarbershopService, QueueRealtimeNotifier, QueueStateUpdater, QueuePositionNotificationService, QueuePositionPresenter, CadeiraConfirmacaoService, LoginPage|

## Inventario completo por script

|#|Referencia|Script|Caminho resolvido|Raw / Min est. / Gzip KB|Tipo|Estrategia|Uso real|Dependencia ordem|Impacto TTI|
|---|---|---|---|---|---|---|---|---|---|
|1|admin.html:252|apps/profissional/assets/js/admin/AdminApiService.js|apps/profissional/assets/js/admin/AdminApiService.js|6.4 / 2.5 / 1.8|legado|blocking|boot/shared core|sem dependencia detectada|2.05|
|2|admin.html:253|apps/profissional/assets/js/admin/AdminDashboard.js|apps/profissional/assets/js/admin/AdminDashboard.js|30.9 / 18.9 / 5.8|legado|blocking|shared/on-demand|AdminApiService|7.01|
|3|cliente.html:1333|shared/js/LogoutScreen.js|shared/js/LogoutScreen.js|5.8 / 2.1 / 1.7|legado|blocking|on-demand/evento|sem dependencia detectada|1.95|
|4|cliente.html:1335|shared/js/AnimationService.js|shared/js/AnimationService.js|7.0 / 3.1 / 2.4|legado|blocking|boot/shared core|sem dependencia detectada|2.63|
|5|cliente.html:1336|shared/js/MenuService.js|shared/js/MenuService.js|3.3 / 1.5 / 1.1|legado|blocking|boot/shared core|sem dependencia detectada|1.28|
|6|cliente.html:1337|shared/js/UserService.js|shared/js/UserService.js|9.4 / 2.1 / 2.0|legado|blocking|boot/shared core|sem dependencia detectada|2.38|
|7|cliente.html:1338|shared/js/AvatarService.js|shared/js/AvatarService.js|6.7 / 3.1 / 2.4|legado|blocking|boot/shared core|MenuService, UserService|2.71|
|8|cliente.html:1339|shared/js/SplashService.js|shared/js/SplashService.js|2.3 / 1.1 / 1.1|legado|blocking|boot/shared core|sem dependencia detectada|1.2|
|9|cliente.html:1341|shared/js/AppState.js|shared/js/AppState.js|10.9 / 2.7 / 2.9|legado|blocking|shared/on-demand|sem dependencia detectada|3.3|
|10|cliente.html:1343|shared/js/AuthGuard.js|shared/js/AuthGuard.js|8.5 / 4.2 / 2.6|legado|blocking|boot/shared core|AppState|2.95|
|11|cliente.html:1344|shared/js/PermissionService.js|shared/js/PermissionService.js|6.1 / 1.5 / 1.7|legado|blocking|boot/shared core|AppState, AuthGuard|1.93|
|12|cliente.html:1345|shared/js/Router.js|shared/js/Router.js|17.4 / 6.3 / 4.8|legado|blocking|boot|LogoutScreen, AnimationService, MenuService, AvatarService, SplashService, AppState, AuthGuard, ID|5.48|
|13|cliente.html:1346|shared/js/BarberPole.js|shared/js/BarberPole.js|4.8 / 2.5 / 1.7|legado|blocking|shared/on-demand|sem dependencia detectada|1.88|
|14|cliente.html:1347|shared/js/PerfilEditor.js|shared/js/PerfilEditor.js|13.7 / 7.0 / 4.0|legado|blocking|shared/on-demand|sem dependencia detectada|4.55|
|15|cliente.html:1348|(inline)|inline|0.5 / 0.3 / 0.3|legado|blocking|boot inline|Router|0.32|
|16|profissional.html:1291|shared/js/LogoutScreen.js|shared/js/LogoutScreen.js|5.8 / 2.1 / 1.7|legado|blocking|on-demand/evento|sem dependencia detectada|1.95|
|17|profissional.html:1293|shared/js/AnimationService.js|shared/js/AnimationService.js|7.0 / 3.1 / 2.4|legado|blocking|boot/shared core|sem dependencia detectada|2.63|
|18|profissional.html:1294|shared/js/MenuService.js|shared/js/MenuService.js|3.3 / 1.5 / 1.1|legado|blocking|boot/shared core|sem dependencia detectada|1.28|
|19|profissional.html:1295|shared/js/UserService.js|shared/js/UserService.js|9.4 / 2.1 / 2.0|legado|blocking|boot/shared core|sem dependencia detectada|2.38|
|20|profissional.html:1296|shared/js/AvatarService.js|shared/js/AvatarService.js|6.7 / 3.1 / 2.4|legado|blocking|boot/shared core|MenuService, UserService|2.71|
|21|profissional.html:1297|shared/js/SplashService.js|shared/js/SplashService.js|2.3 / 1.1 / 1.1|legado|blocking|boot/shared core|sem dependencia detectada|1.2|
|22|profissional.html:1299|shared/js/AppState.js|shared/js/AppState.js|10.9 / 2.7 / 2.9|legado|blocking|shared/on-demand|sem dependencia detectada|3.3|
|23|profissional.html:1301|shared/js/AuthGuard.js|shared/js/AuthGuard.js|8.5 / 4.2 / 2.6|legado|blocking|boot/shared core|AppState|2.95|
|24|profissional.html:1302|shared/js/PermissionService.js|shared/js/PermissionService.js|6.1 / 1.5 / 1.7|legado|blocking|boot/shared core|AppState, AuthGuard|1.93|
|25|profissional.html:1303|shared/js/Router.js|shared/js/Router.js|17.4 / 6.3 / 4.8|legado|blocking|boot|LogoutScreen, AnimationService, MenuService, AvatarService, SplashService, AppState, AuthGuard, ID|5.48|
|26|profissional.html:1304|shared/js/BarberPole.js|shared/js/BarberPole.js|4.8 / 2.5 / 1.7|legado|blocking|shared/on-demand|sem dependencia detectada|1.88|
|27|profissional.html:1305|shared/js/PerfilEditor.js|shared/js/PerfilEditor.js|13.7 / 7.0 / 4.0|legado|blocking|shared/on-demand|sem dependencia detectada|4.55|
|28|profissional.html:1306|(inline)|inline|0.5 / 0.3 / 0.3|legado|blocking|boot inline|Router|0.33|
|29|apps/profissional/index.html:2105|/shared/js/supabase.min.js|shared/js/supabase.min.js|183.3 / 99.3 / 47.4|vendor|blocking|shared/on-demand|sem dependencia detectada|54.7|
|30|apps/profissional/index.html:2107|/shared/js/LoggerService.js|shared/js/LoggerService.js|4.5 / 0.8 / 1.5|proprio|blocking|boot/shared core|sem dependencia detectada|1.64|
|31|apps/profissional/index.html:2109|/shared/js/ApiService.js|shared/js/ApiService.js|12.3 / 5.5 / 3.9|proprio|blocking|boot/shared core|sem dependencia detectada|4.36|
|32|apps/profissional/index.html:2111|/shared/js/SupabaseService.js|shared/js/SupabaseService.js|23.1 / 10.7 / 6.5|proprio|blocking|boot|A, LoggerService, ApiService|7.45|
|33|apps/profissional/index.html:2113|/shared/js/SessionCache.js|shared/js/SessionCache.js|5.3 / 1.7 / 1.5|proprio|blocking|shared/on-demand|URL|1.74|
|34|apps/profissional/index.html:2115|/shared/js/NavConfig.js|shared/js/NavConfig.js|6.2 / 2.6 / 1.6|proprio|blocking|boot|P|1.81|
|35|apps/profissional/index.html:2117|/shared/js/InputValidator.js|shared/js/InputValidator.js|13.2 / 4.6 / 4.0|proprio|blocking|shared/on-demand|sem dependencia detectada|4.49|
|36|apps/profissional/index.html:2119|/shared/js/AuthService.js|shared/js/AuthService.js|25.2 / 10.4 / 6.7|proprio|blocking|boot|A, Se, LoggerService, SupabaseService, URL, SessionCache, InputValidator|7.69|
|37|apps/profissional/index.html:2120|/shared/js/AuthUI.js|shared/js/AuthUI.js|15.0 / 6.8 / 4.1|proprio|blocking|shared/on-demand|P, SupabaseService, URL, SessionCache, NavConfig, InputValidator, AuthService|4.68|
|38|apps/profissional/index.html:2122|/shared/js/LogoutScreen.js|shared/js/LogoutScreen.js|5.8 / 2.1 / 1.7|proprio|blocking|on-demand/evento|P, AuthService|1.95|
|39|apps/profissional/index.html:2124|/shared/js/AnimationService.js|shared/js/AnimationService.js|7.0 / 3.1 / 2.4|proprio|blocking|boot/shared core|sem dependencia detectada|2.63|
|40|apps/profissional/index.html:2125|/shared/js/MenuService.js|shared/js/MenuService.js|3.3 / 1.5 / 1.1|proprio|blocking|boot/shared core|sem dependencia detectada|1.28|
|41|apps/profissional/index.html:2126|/shared/js/UserService.js|shared/js/UserService.js|9.4 / 2.1 / 2.0|proprio|blocking|boot/shared core|SupabaseService, AuthService|2.38|
|42|apps/profissional/index.html:2127|/shared/js/BackendApiService.js|shared/js/BackendApiService.js|11.7 / 5.5 / 3.0|proprio|blocking|boot/shared core|ApiService, SupabaseService|3.49|
|43|apps/profissional/index.html:2128|/shared/js/AvatarService.js|shared/js/AvatarService.js|6.7 / 3.1 / 2.4|proprio|blocking|boot/shared core|Se, LoggerService, URL, SessionCache, MenuService, UserService, BackendApiService|2.71|
|44|apps/profissional/index.html:2129|/shared/js/SplashService.js|shared/js/SplashService.js|2.3 / 1.1 / 1.1|proprio|blocking|boot/shared core|URL|1.2|
|45|apps/profissional/index.html:2131|/shared/js/AppState.js|shared/js/AppState.js|10.9 / 2.7 / 2.9|proprio|blocking|shared/on-demand|LoggerService|3.3|
|46|apps/profissional/index.html:2133|/shared/js/GuestMode.js|shared/js/GuestMode.js|3.4 / 1.2 / 1.3|proprio|blocking|shared/on-demand|A, AppState|1.42|
|47|apps/profissional/index.html:2135|/shared/js/AuthGuard.js|shared/js/AuthGuard.js|8.5 / 4.2 / 2.6|proprio|blocking|boot/shared core|A, Se, AppState|2.95|
|48|apps/profissional/index.html:2136|/shared/js/PermissionService.js|shared/js/PermissionService.js|6.1 / 1.5 / 1.7|proprio|blocking|boot/shared core|A, AppState, AuthGuard|1.93|
|49|apps/profissional/index.html:2138|/shared/js/NavigationViewService.js|shared/js/NavigationViewService.js|10.1 / 3.5 / 3.1|proprio|blocking|boot/shared core|GuestMode, ID|3.47|
|50|apps/profissional/index.html:2140|/shared/js/Router.js|shared/js/Router.js|17.4 / 6.3 / 4.8|proprio|blocking|boot|A, Se, LoggerService, LogoutScreen, AnimationService, MenuService, AvatarService, SplashService, AppState, GuestMode, AuthGuard, ID|5.48|
|51|apps/profissional/index.html:2142|/shared/js/BarberPole.js|shared/js/BarberPole.js|4.8 / 2.5 / 1.7|proprio|blocking|shared/on-demand|sem dependencia detectada|1.88|
|52|apps/profissional/index.html:2144|/shared/js/LogoGlow.js|shared/js/LogoGlow.js|1.5 / 0.6 / 0.7|proprio|blocking|shared/on-demand|sem dependencia detectada|0.78|
|53|apps/profissional/index.html:2146|/shared/js/StoryViewer.js|shared/js/StoryViewer.js|27.0 / 19.5 / 5.9|proprio|blocking|on-demand/evento|P, Pr, AuthGuard|7|
|54|apps/profissional/index.html:2148|/shared/js/StoriesLayout.js|shared/js/StoriesLayout.js|7.8 / 2.6 / 2.1|proprio|blocking|shared/on-demand|P, StoryViewer|2.45|
|55|apps/profissional/index.html:2150|/shared/js/GeoService.js|shared/js/GeoService.js|14.4 / 6.6 / 4.3|proprio|blocking|boot/shared core|P, Se, SupabaseService, ID|4.85|
|56|apps/profissional/index.html:2152|/shared/js/BarbershopRepository.js|shared/js/BarbershopRepository.js|18.2 / 9.4 / 4.1|proprio|blocking|boot/shared core|Se, ApiService, InputValidator, ID|4.84|
|57|apps/profissional/index.html:2154|/shared/js/CacheManager.js|shared/js/CacheManager.js|3.6 / 0.7 / 1.0|proprio|blocking|boot/shared core|sem dependencia detectada|1.17|
|58|apps/profissional/index.html:2156|/shared/js/StateManager.js|shared/js/StateManager.js|2.2 / 0.5 / 0.8|proprio|blocking|boot/shared core|Se, CacheManager|0.85|
|59|apps/profissional/index.html:2158|/shared/js/ResourceLoader.js|shared/js/ResourceLoader.js|3.8 / 0.8 / 1.1|proprio|blocking|shared/on-demand|Se, URL, CacheManager, StateManager|1.28|
|60|apps/profissional/index.html:2160|/shared/js/NavigationManager.js|shared/js/NavigationManager.js|7.3 / 2.1 / 2.3|proprio|blocking|boot/shared core|P, Se, LoggerService, ApiService, BarbershopRepository, CacheManager, StateManager|2.62|
|61|apps/profissional/index.html:2162|/shared/js/BarbeariaPage.js|shared/js/BarbeariaPage.js|50.3 / 26.2 / 12.7|proprio|blocking|shared/on-demand|P, Se, Re, LoggerService, ApiService, SupabaseService, InputValidator, AuthService, AppState, ID, BarbershopRepository, CacheManager|14.76|
|62|apps/profissional/index.html:2164|/shared/js/BarbeiroPage.js|shared/js/BarbeiroPage.js|11.7 / 5.5 / 3.1|proprio|blocking|shared/on-demand|P, Se, Pr, LoggerService, ApiService, SupabaseService, InputValidator, ID, BarbershopRepository, CacheManager, NavigationManager|3.62|
|63|apps/profissional/index.html:2166|/shared/js/UserRepository.js|shared/js/UserRepository.js|10.9 / 3.3 / 2.6|proprio|blocking|boot/shared core|ApiService, InputValidator, BackendApiService|3.02|
|64|apps/profissional/index.html:2167|/shared/js/ProfileRepository.js|shared/js/ProfileRepository.js|14.7 / 7.1 / 3.5|proprio|blocking|boot/shared core|ApiService, SupabaseService, URL, InputValidator, ID, BarbershopRepository|4.11|
|65|apps/profissional/index.html:2169|/shared/js/BarbershopService.js|shared/js/BarbershopService.js|33.3 / 17.0 / 8.5|proprio|blocking|boot/shared core|P, Se, LoggerService, SupabaseService, AuthGuard, GeoService, BarbershopRepository, ProfileRepository|9.87|
|66|apps/profissional/index.html:2170|/shared/js/ProfessionalService.js|shared/js/ProfessionalService.js|14.5 / 7.4 / 3.9|proprio|blocking|boot/shared core|A, LoggerService, SupabaseService, AppState, AuthGuard, ProfileRepository, BarbershopService|4.46|
|67|apps/profissional/index.html:2171|/shared/js/StatusFechamentoModal.js|shared/js/StatusFechamentoModal.js|4.4 / 2.1 / 1.4|proprio|blocking|on-demand/evento|BarbeiroPage|1.61|
|68|apps/profissional/index.html:2172|/shared/js/FavoritosClientesService.js|shared/js/FavoritosClientesService.js|3.7 / 1.0 / 1.2|proprio|blocking|boot/shared core|InputValidator, UserRepository|1.32|
|69|apps/profissional/index.html:2173|/shared/js/CadeiraService.js|shared/js/CadeiraService.js|13.6 / 5.9 / 4.0|proprio|blocking|boot/shared core|A, LoggerService, ApiService, SupabaseService, InputValidator, UserRepository, FavoritosClientesService|4.51|
|70|apps/profissional/index.html:2174|/shared/js/ClienteSeletorModal.js|shared/js/ClienteSeletorModal.js|21.5 / 12.1 / 5.6|proprio|blocking|on-demand/evento|SupabaseService, BackendApiService, UserRepository, CadeiraService|6.44|
|71|apps/profissional/index.html:2175|/shared/js/CorteModal.js|shared/js/CorteModal.js|8.4 / 4.8 / 2.6|proprio|blocking|on-demand/evento|R|2.9|
|72|apps/profissional/index.html:2176|/shared/js/MensalistaModal.js|shared/js/MensalistaModal.js|15.5 / 9.7 / 3.8|proprio|blocking|on-demand/evento|Se, Re, SupabaseService, R|4.4|
|73|apps/profissional/index.html:2177|/shared/js/FinalizarCorteModal.js|shared/js/FinalizarCorteModal.js|4.9 / 2.6 / 1.6|proprio|blocking|on-demand/evento|Cr, Pr|1.79|
|74|apps/profissional/index.html:2178|/shared/js/FinanceiroRepository.js|shared/js/FinanceiroRepository.js|9.8 / 4.1 / 2.2|proprio|blocking|boot/shared core|A, LoggerService, ApiService, InputValidator|2.59|
|75|apps/profissional/index.html:2179|/shared/js/FinanceiroService.js|shared/js/FinanceiroService.js|8.1 / 3.4 / 2.0|proprio|blocking|boot/shared core|LoggerService, ApiService, InputValidator, FinanceiroRepository|2.35|
|76|apps/profissional/index.html:2180|/shared/js/BarberFinanceModal.js|shared/js/BarberFinanceModal.js|7.4 / 4.2 / 2.1|proprio|blocking|on-demand/evento|P, LoggerService, R, FinanceiroService|2.42|
|77|apps/profissional/index.html:2181|/shared/js/MenosPercentualModal.js|shared/js/MenosPercentualModal.js|5.5 / 2.8 / 1.8|proprio|blocking|on-demand/evento|P, Cr, R|1.97|
|78|apps/profissional/index.html:2182|/shared/js/FluxoDeFila.js|shared/js/FluxoDeFila.js|9.1 / 3.8 / 2.6|proprio|blocking|shared/on-demand|T, A, P, URL|2.95|
|79|apps/profissional/index.html:2183|/shared/js/ConfirmacaoCorteModal.js|shared/js/ConfirmacaoCorteModal.js|1.4 / 0.5 / 0.7|proprio|blocking|on-demand/evento|URL, FluxoDeFila|0.74|
|80|apps/profissional/index.html:2184|/shared/js/ClienteAusenteModal.js|shared/js/ClienteAusenteModal.js|2.7 / 1.0 / 1.0|proprio|blocking|on-demand/evento|FluxoDeFila|1.07|
|81|apps/profissional/index.html:2185|/shared/js/BarbeiroEsperaFluxo.js|shared/js/BarbeiroEsperaFluxo.js|9.0 / 4.7 / 2.5|proprio|blocking|shared/on-demand|P, FluxoDeFila|2.87|
|82|apps/profissional/index.html:2186|/shared/js/BarbeiroCard.js|shared/js/BarbeiroCard.js|3.0 / 1.3 / 1.0|proprio|blocking|shared/on-demand|SupabaseService, BarbeariaPage|1.14|
|83|apps/profissional/index.html:2187|/shared/js/Cadeira.js|shared/js/Cadeira.js|8.7 / 4.4 / 2.7|proprio|blocking|shared/on-demand|SupabaseService|3.06|
|84|apps/profissional/index.html:2188|/shared/js/FilaController.js|shared/js/FilaController.js|4.1 / 1.4 / 1.3|proprio|blocking|boot/shared core|LoggerService, ApiService, InputValidator, CadeiraService|1.47|
|85|apps/profissional/index.html:2189|/shared/js/ModalController.js|shared/js/ModalController.js|2.5 / 0.7 / 1.0|proprio|blocking|on-demand/evento|AuthService, CorteModal|1.09|
|86|apps/profissional/index.html:2190|/shared/js/ClienteController.js|shared/js/ClienteController.js|3.8 / 0.9 / 1.1|proprio|blocking|boot/shared core|A, AuthService, CadeiraService, FilaController|1.27|
|87|apps/profissional/index.html:2191|/shared/js/BarbeariaStatusSync.js|shared/js/BarbeariaStatusSync.js|7.0 / 3.6 / 2.1|proprio|blocking|shared/on-demand|SupabaseService, BarbeariaPage, StatusFechamentoModal|2.42|
|88|apps/profissional/index.html:2193|https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js|externo|n/d / n/d / n/d|vendor|blocking|shared/on-demand|sem dependencia detectada|0|
|89|apps/profissional/index.html:2196|/shared/js/BffApiService.js|shared/js/BffApiService.js|11.9 / 5.6 / 3.0|proprio|blocking|boot/shared core|SupabaseService, URL, GeoService|3.48|
|90|apps/profissional/index.html:2197|/shared/js/BffAuthClient.js|shared/js/BffAuthClient.js|5.4 / 2.7 / 1.7|proprio|blocking|shared/on-demand|P, SupabaseService, AuthService|1.91|
|91|apps/profissional/index.html:2198|/shared/js/BarbeariaApiClient.js|shared/js/BarbeariaApiClient.js|6.4 / 3.1 / 1.8|proprio|blocking|shared/on-demand|Se, LoggerService, BffApiService|2.06|
|92|apps/profissional/index.html:2199|/shared/js/NearbyBarbershopsWidget.js|shared/js/NearbyBarbershopsWidget.js|29.9 / 18.1 / 6.6|proprio|blocking|on-demand/evento|P, Se, Rt, LoggerService, SupabaseService, URL, GeoService, BarbershopRepository, ProfileRepository, BarbershopService, ProfessionalService, StatusFechamentoModal|7.83|
|93|apps/profissional/index.html:2200|/shared/js/LojaMarker.js|shared/js/LojaMarker.js|3.1 / 1.4 / 1.2|proprio|blocking|shared/on-demand|URL|1.35|
|94|apps/profissional/index.html:2201|/shared/js/MapWidget.js|shared/js/MapWidget.js|25.9 / 13.3 / 7.2|proprio|blocking|on-demand/evento|A, P, Re, Rt, ApiService, URL, SessionCache, AuthService, GeoService, BarbeariaApiClient, NearbyBarbershopsWidget, LojaMarker|8.22|
|95|apps/profissional/index.html:2203|/shared/js/SearchWidget.js|shared/js/SearchWidget.js|13.2 / 6.8 / 3.7|proprio|blocking|on-demand/evento|P, ApiService, SupabaseService, InputValidator, ID|4.23|
|96|apps/profissional/index.html:2205|/shared/js/FonteSalao.js|shared/js/FonteSalao.js|9.5 / 3.9 / 2.4|proprio|blocking|shared/on-demand|ApiService, SupabaseService|2.77|
|97|apps/profissional/index.html:2206|/shared/js/CapaBarbearia.js|shared/js/CapaBarbearia.js|5.2 / 1.5 / 1.4|proprio|blocking|shared/on-demand|SupabaseService, InputValidator|1.57|
|98|apps/profissional/index.html:2208|/shared/js/GuardaIten.js|shared/js/GuardaIten.js|6.3 / 2.6 / 1.8|proprio|blocking|boot/shared core|sem dependencia detectada|2.09|
|99|apps/profissional/index.html:2210|/shared/js/MapPanelModule.js|shared/js/MapPanelModule.js|13.7 / 6.3 / 3.5|proprio|blocking|shared/on-demand|LoggerService, Router, GeoService, NearbyBarbershopsWidget, MapWidget|4.01|
|100|apps/profissional/index.html:2212|/shared/js/MapOrientationModule.js|shared/js/MapOrientationModule.js|14.5 / 6.5 / 3.9|proprio|blocking|shared/on-demand|Se, Re, Router, MapWidget, MapPanel|4.46|
|101|apps/profissional/index.html:2214|/shared/js/PaymentFlowHandler.js|shared/js/PaymentFlowHandler.js|6.8 / 2.7 / 2.0|proprio|blocking|on-demand/evento|P, SupabaseService, URL|2.32|
|102|apps/profissional/index.html:2216|/shared/js/ProLandingGate.js|shared/js/ProLandingGate.js|4.1 / 1.5 / 1.3|proprio|blocking|shared/on-demand|P, Se, SplashService, BarberPole|1.49|
|103|apps/profissional/index.html:2218|assets/js/LegalConsentService.js|apps/profissional/assets/js/LegalConsentService.js|8.2 / 2.8 / 2.0|proprio|blocking|boot/shared core|LoggerService, SupabaseService|2.32|
|104|apps/profissional/index.html:2219|assets/js/MonetizationGuard.js|apps/profissional/assets/js/MonetizationGuard.js|1.8 / 0.7 / 0.7|proprio|blocking|boot/shared core|sem dependencia detectada|0.74|
|105|apps/profissional/index.html:2220|assets/js/PlanosService.js|apps/profissional/assets/js/PlanosService.js|1.7 / 0.3 / 0.7|proprio|blocking|boot/shared core|PaymentFlowHandler, MonetizationGuard|0.76|
|106|apps/profissional/index.html:2221|/shared/js/MessageService.js|shared/js/MessageService.js|4.4 / 2.0 / 1.2|proprio|blocking|boot/shared core|LoggerService, SupabaseService, InputValidator, ID|1.41|
|107|apps/profissional/index.html:2222|/shared/js/MessageCryptoService.js|shared/js/MessageCryptoService.js|7.2 / 2.6 / 2.1|proprio|blocking|boot/shared core|A, P|2.39|
|108|apps/profissional/index.html:2223|/shared/js/MessageSignalingService.js|shared/js/MessageSignalingService.js|5.9 / 1.5 / 1.6|proprio|blocking|boot/shared core|SupabaseService|1.85|
|109|apps/profissional/index.html:2224|/shared/js/P2PMessageConnectionService.js|shared/js/P2PMessageConnectionService.js|19.0 / 8.4 / 4.2|proprio|blocking|boot/shared core|A, P, Se, AuthService, MessageCryptoService, MessageSignalingService|4.96|
|110|apps/profissional/index.html:2225|/shared/js/MessagesWidget.js|shared/js/MessagesWidget.js|22.9 / 13.3 / 5.6|proprio|blocking|on-demand/evento|A, P, Se, SupabaseService, AnimationService, AuthGuard, ID, DigText, MessageCryptoService, MessageSignalingService, P2PMessageConnectionService|6.47|
|111|apps/profissional/index.html:2226|/shared/js/NotificationService.js|shared/js/NotificationService.js|24.0 / 11.1 / 6.0|proprio|blocking|on-demand/evento|P, SupabaseService, AuthService, ID, Router|6.99|
|112|apps/profissional/index.html:2227|/shared/js/PushSubscriptionService.js|shared/js/PushSubscriptionService.js|8.8 / 3.6 / 2.5|proprio|blocking|on-demand/evento|A, P, Se, Re, LoggerService, SupabaseService, ID|2.89|
|113|apps/profissional/index.html:2228|/shared/js/OfflineSyncQueue.js|shared/js/OfflineSyncQueue.js|7.0 / 2.8 / 2.0|proprio|blocking|on-demand/evento|P|2.32|
|114|apps/profissional/index.html:2229|/shared/js/AppointmentRepository.js|shared/js/AppointmentRepository.js|7.6 / 3.4 / 1.9|proprio|blocking|boot/shared core|ApiService, InputValidator|2.16|
|115|apps/profissional/index.html:2230|/shared/js/QueueRepository.js|shared/js/QueueRepository.js|7.5 / 3.4 / 2.0|proprio|blocking|on-demand/evento|ApiService, SupabaseService, InputValidator|2.35|
|116|apps/profissional/index.html:2231|/shared/js/LgpdService.js|shared/js/LgpdService.js|10.7 / 3.5 / 2.7|proprio|blocking|boot/shared core|A, LoggerService, SupabaseService, LegalConsentService|3.1|
|117|apps/profissional/index.html:2232|/shared/js/TermsPage.js|shared/js/TermsPage.js|2.0 / 1.0 / 0.8|proprio|blocking|on-demand/evento|P|0.85|
|118|apps/profissional/index.html:2233|/shared/js/PerfilEditor.js|shared/js/PerfilEditor.js|13.7 / 7.0 / 4.0|proprio|blocking|shared/on-demand|P, LoggerService, SupabaseService, SessionCache, AuthService, ProfileRepository, NotificationService|4.55|
|119|apps/profissional/index.html:2234|/shared/js/FooterScrollManager.js|shared/js/FooterScrollManager.js|6.2 / 3.0 / 1.9|proprio|blocking|boot/shared core|P, Router|2.14|
|120|apps/profissional/index.html:2235|/shared/js/HeaderScrollBehavior.js|shared/js/HeaderScrollBehavior.js|6.8 / 3.2 / 2.2|proprio|blocking|shared/on-demand|sem dependencia detectada|2.46|
|121|apps/profissional/index.html:2236|assets/js/pages/DestaquesPage.js|apps/profissional/assets/js/pages/DestaquesPage.js|6.9 / 4.5 / 2.4|proprio|blocking|pagina especifica|LoggerService, SupabaseService, BarbershopRepository, BarbershopService, StatusFechamentoModal, DigText, FonteSalao, CapaBarbearia|2.68|
|122|apps/profissional/index.html:2237|assets/js/pages/BarbeirosPage.js|apps/profissional/assets/js/pages/BarbeirosPage.js|6.8 / 4.5 / 2.2|proprio|blocking|pagina especifica|LoggerService, SupabaseService, BarbershopRepository, ProfileRepository, BarbershopService, ProfessionalService, DigText|2.52|
|123|apps/profissional/index.html:2238|assets/js/pages/BarbeariasPage.js|apps/profissional/assets/js/pages/BarbeariasPage.js|6.0 / 4.1 / 2.2|proprio|blocking|pagina especifica|Pr, LoggerService, SupabaseService, BarbershopRepository, BarbershopService, StatusFechamentoModal, DigText, FonteSalao, CapaBarbearia|2.41|
|124|apps/profissional/index.html:2239|assets/js/pages/AgendaPage.js|apps/profissional/assets/js/pages/AgendaPage.js|7.1 / 4.5 / 2.4|proprio|blocking|pagina especifica|LoggerService, SupabaseService, AuthService, AppState, R, NotificationService, AppointmentRepository|2.71|
|125|apps/profissional/index.html:2240|/events/catalog.js|events/catalog.js|0.9 / 0.8 / 0.3|proprio|blocking|shared/on-demand|sem dependencia detectada|0.35|
|126|apps/profissional/index.html:2241|/shared/js/SectionEventBus.js|shared/js/SectionEventBus.js|1.4 / 1.2 / 0.5|proprio|blocking|shared/on-demand|sem dependencia detectada|0.56|
|127|apps/profissional/index.html:2242|/shared/js/PageSection.js|shared/js/PageSection.js|3.2 / 2.7 / 0.9|proprio|blocking|shared/on-demand|sem dependencia detectada|0.99|
|128|apps/profissional/index.html:2243|assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaState.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaState.js|1.2 / 1.0 / 0.4|proprio|blocking|pagina especifica|sem dependencia detectada|0.44|
|129|apps/profissional/index.html:2244|assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaView.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaView.js|0.5 / 0.5 / 0.3|proprio|blocking|pagina especifica|sem dependencia detectada|0.31|
|130|apps/profissional/index.html:2245|assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaController.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaController.js|1.5 / 1.2 / 0.5|proprio|blocking|pagina especifica|SectionEventCatalog, AgendaState, AgendaView|0.58|
|131|apps/profissional/index.html:2246|assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaSection.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaSection.js|0.7 / 0.6 / 0.3|proprio|blocking|pagina especifica|PageSection, AgendaController|0.34|
|132|apps/profissional/index.html:2247|assets/js/pages/MinhaBarbeariaPage/StorySection/StoryState.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/StorySection/StoryState.js|1.1 / 0.9 / 0.4|proprio|blocking|pagina especifica|sem dependencia detectada|0.45|
|133|apps/profissional/index.html:2248|assets/js/pages/MinhaBarbeariaPage/StorySection/StoryView.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/StorySection/StoryView.js|0.3 / 0.3 / 0.2|proprio|blocking|pagina especifica|sem dependencia detectada|0.24|
|134|apps/profissional/index.html:2249|assets/js/pages/MinhaBarbeariaPage/StorySection/StoryController.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/StorySection/StoryController.js|0.7 / 0.6 / 0.3|proprio|blocking|pagina especifica|SectionEventCatalog|0.38|
|135|apps/profissional/index.html:2250|assets/js/pages/MinhaBarbeariaPage/StorySection/StorySection.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/StorySection/StorySection.js|0.6 / 0.5 / 0.3|proprio|blocking|pagina especifica|PageSection, StoryController|0.31|
|136|apps/profissional/index.html:2251|assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioState.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioState.js|0.7 / 0.6 / 0.3|proprio|blocking|pagina especifica|sem dependencia detectada|0.32|
|137|apps/profissional/index.html:2252|assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioView.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioView.js|0.3 / 0.3 / 0.2|proprio|blocking|pagina especifica|sem dependencia detectada|0.23|
|138|apps/profissional/index.html:2253|assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioController.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioController.js|0.6 / 0.5 / 0.3|proprio|blocking|pagina especifica|SectionEventCatalog|0.34|
|139|apps/profissional/index.html:2254|assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioSection.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioSection.js|0.6 / 0.5 / 0.3|proprio|blocking|pagina especifica|PageSection, PortfolioController|0.3|
|140|apps/profissional/index.html:2255|assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationState.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationState.js|1.0 / 0.8 / 0.4|proprio|blocking|pagina especifica|sem dependencia detectada|0.39|
|141|apps/profissional/index.html:2256|assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationView.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationView.js|0.4 / 0.3 / 0.2|proprio|blocking|pagina especifica|sem dependencia detectada|0.25|
|142|apps/profissional/index.html:2257|assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationController.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationController.js|1.3 / 1.1 / 0.5|proprio|blocking|pagina especifica|SectionEventCatalog|0.6|
|143|apps/profissional/index.html:2258|assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationSection.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/NotificationSection/NotificationSection.js|0.6 / 0.5 / 0.3|proprio|blocking|pagina especifica|PageSection, NotificationController|0.3|
|144|apps/profissional/index.html:2259|assets/js/pages/MinhaBarbeariaPage/QueueRealtimeClient.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/QueueRealtimeClient.js|1.4 / 1.1 / 0.6|proprio|blocking|pagina especifica|sem dependencia detectada|0.62|
|145|apps/profissional/index.html:2260|assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueState.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueState.js|0.9 / 0.8 / 0.3|proprio|blocking|pagina especifica|sem dependencia detectada|0.38|
|146|apps/profissional/index.html:2261|assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueView.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueView.js|0.4 / 0.3 / 0.2|proprio|blocking|pagina especifica|sem dependencia detectada|0.24|
|147|apps/profissional/index.html:2262|assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueController.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueController.js|1.2 / 1.0 / 0.4|proprio|blocking|pagina especifica|SectionEventCatalog, QueueRealtimeClient|0.49|
|148|apps/profissional/index.html:2263|assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueSection.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/QueueSection/QueueSection.js|0.6 / 0.5 / 0.3|proprio|blocking|pagina especifica|PageSection, QueueController|0.3|
|149|apps/profissional/index.html:2264|assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsState.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsState.js|0.4 / 0.3 / 0.2|analytics/tracker|blocking|pagina especifica|sem dependencia detectada|0.24|
|150|apps/profissional/index.html:2265|assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsView.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsView.js|0.3 / 0.3 / 0.2|analytics/tracker|blocking|pagina especifica|sem dependencia detectada|0.22|
|151|apps/profissional/index.html:2266|assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsController.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsController.js|1.0 / 0.8 / 0.5|analytics/tracker|blocking|pagina especifica|SectionEventCatalog|0.49|
|152|apps/profissional/index.html:2267|assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsSection.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/AnalyticsSection/AnalyticsSection.js|0.6 / 0.5 / 0.3|analytics/tracker|blocking|pagina especifica|PageSection, AnalyticsController|0.3|
|153|apps/profissional/index.html:2268|assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsState.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsState.js|0.8 / 0.7 / 0.3|proprio|blocking|pagina especifica|sem dependencia detectada|0.37|
|154|apps/profissional/index.html:2269|assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsView.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsView.js|0.4 / 0.3 / 0.2|proprio|blocking|pagina especifica|sem dependencia detectada|0.25|
|155|apps/profissional/index.html:2270|assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsController.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsController.js|0.6 / 0.5 / 0.3|proprio|blocking|pagina especifica|SectionEventCatalog|0.37|
|156|apps/profissional/index.html:2271|assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsSection.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/SettingsSection/SettingsSection.js|0.6 / 0.5 / 0.3|proprio|blocking|pagina especifica|PageSection, SettingsController|0.3|
|157|apps/profissional/index.html:2272|/shared/js/MediaP2P.js|shared/js/MediaP2P.js|11.9 / 4.0 / 3.9|proprio|blocking|shared/on-demand|P, SupabaseService, URL|4.42|
|158|apps/profissional/index.html:2273|assets/js/GpsPanelMap.js|apps/profissional/assets/js/GpsPanelMap.js|4.7 / 2.0 / 1.7|proprio|blocking|shared/on-demand|P|1.86|
|159|apps/profissional/index.html:2274|assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js|106.4 / 69.9 / 25.4|legado|blocking|pagina especifica|A, Se, Re, Pr, LoggerService, ApiService, SupabaseService, URL, InputValidator, AuthService, AnimationService, BarbershopRepository|29.68|
|160|apps/profissional/index.html:2275|assets/js/pages/MinhaBarbeariaPage.js|apps/profissional/assets/js/pages/MinhaBarbeariaPage.js|0.4 / 0.3 / 0.2|proprio|blocking|pagina especifica|MinhaBarbeariaRuntimeController|0.22|
|161|apps/profissional/index.html:2276|assets/js/pages/CriarBarbeariaPage.js|apps/profissional/assets/js/pages/CriarBarbeariaPage.js|6.4 / 3.6 / 2.2|proprio|blocking|pagina especifica|Pr, SupabaseService, SessionCache, InputValidator, AuthService, NotificationService|2.46|
|162|apps/profissional/index.html:2277|assets/js/pages/ParceriasPage.js|apps/profissional/assets/js/pages/ParceriasPage.js|17.8 / 11.2 / 4.6|proprio|blocking|pagina especifica|Se, LoggerService, SupabaseService, InputValidator, AuthService, AppState, BarbershopRepository, ProfileRepository, FonteSalao, CapaBarbearia, NotificationService|5.31|
|163|apps/profissional/index.html:2278|assets/js/pages/FinancasPage.js|apps/profissional/assets/js/pages/FinancasPage.js|13.6 / 7.5 / 3.4|proprio|blocking|pagina especifica|P, Cr, LoggerService, ApiService, SupabaseService, AuthService, BarbershopRepository, R, FinanceiroService, BarberFinanceModal, MenosPercentualModal, NotificationService|3.96|
|164|apps/profissional/index.html:2279|assets/js/pages/GpsPage.js|apps/profissional/assets/js/pages/GpsPage.js|10.7 / 6.2 / 3.1|proprio|blocking|pagina especifica|Pr, SupabaseService, AuthService, ID, NotificationService|3.48|
|165|apps/profissional/index.html:2280|assets/js/pages/QueueWidget.js|apps/profissional/assets/js/pages/QueueWidget.js|5.6 / 3.3 / 1.9|proprio|blocking|pagina especifica|Re, LoggerService, SupabaseService, AuthService, BarbershopRepository, Cadeira, QueueRepository|2.17|
|166|apps/profissional/index.html:2281|/shared/js/PWAInstallBanner.js|shared/js/PWAInstallBanner.js|10.1 / 4.4 / 3.0|proprio|blocking|shared/on-demand|P, Re, LoggerService, R|3.38|
|167|apps/profissional/index.html:2282|assets/js/ProfissionalStartupSplash.js|apps/profissional/assets/js/ProfissionalStartupSplash.js|2.3 / 1.6 / 0.9|proprio|blocking|boot|BarberPole|0.97|
|168|apps/profissional/index.html:2283|assets/js/AppBootstrap.js|apps/profissional/assets/js/AppBootstrap.js|11.1 / 6.0 / 3.3|proprio|blocking|boot|Se, LoggerService, URL, AppState, GeoService, NearbyBarbershopsWidget, MapWidget, MapPanel, MapOrientationModule, ProLandingGate, MessagesWidget, NotificationService|3.71|
|169|apps/profissional/index.html:2285|/shared/js/AuthController.js|shared/js/AuthController.js|3.8 / 2.0 / 1.2|proprio|blocking|boot|InputValidator, AuthService, AuthUI, MonetizationGuard|1.32|
|170|apps/profissional/index.html:2286|assets/js/controllers/PlanosController.js|apps/profissional/assets/js/controllers/PlanosController.js|5.6 / 3.0 / 1.8|proprio|blocking|boot/shared core|Se, LoggerService, AuthService, ID, PlanosService, NotificationService|1.98|
|171|apps/profissional/index.html:2287|assets/js/controllers/CadastroController.js|apps/profissional/assets/js/controllers/CadastroController.js|2.9 / 1.6 / 1.0|proprio|blocking|boot/shared core|sem dependencia detectada|1.12|
|172|apps/profissional/index.html:2288|assets/js/controllers/TermosController.js|apps/profissional/assets/js/controllers/TermosController.js|2.7 / 1.4 / 1.0|proprio|blocking|boot/shared core|SupabaseService, LegalConsentService, MonetizationGuard|1.15|
|173|apps/profissional/index.html:2290|/shared/js/QueueConfirmService.js|shared/js/QueueConfirmService.js|13.8 / 6.2 / 3.8|proprio|blocking|on-demand/evento|A, P, Se, ApiService, SupabaseService, URL, BarbershopRepository, CacheManager, ConfirmacaoCorteModal, NotificationService, MinhaBarbeariaPage|4.31|
|174|apps/profissional/index.html:2292|assets/js/app.js|apps/profissional/assets/js/app.js|3.7 / 2.0 / 1.3|proprio|blocking|boot|AuthService, Router, BarbeariaPage, BarbeiroPage, MonetizationGuard, NotificationService, DestaquesPage, BarbeirosPage, BarbeariasPage, AgendaPage, MinhaBarbeariaPage, CriarBarbeariaPage|1.46|
|175|apps/profissional/index.html:2298|(inline)|inline|0.4 / 0.3 / 0.3|proprio|blocking|boot inline|sem dependencia detectada|0.27|
|176|apps/cliente/index.html:1051|/shared/js/supabase.min.js|shared/js/supabase.min.js|183.3 / 99.3 / 47.4|vendor|blocking|shared/on-demand|sem dependencia detectada|54.7|
|177|apps/cliente/index.html:1053|/shared/js/LoggerService.js|shared/js/LoggerService.js|4.5 / 0.8 / 1.5|proprio|blocking|boot/shared core|sem dependencia detectada|1.64|
|178|apps/cliente/index.html:1055|/shared/js/ApiService.js|shared/js/ApiService.js|12.3 / 5.5 / 3.9|proprio|blocking|boot/shared core|sem dependencia detectada|4.36|
|179|apps/cliente/index.html:1057|/shared/js/SupabaseService.js|shared/js/SupabaseService.js|23.1 / 10.7 / 6.5|proprio|blocking|boot|A, LoggerService, ApiService|7.45|
|180|apps/cliente/index.html:1059|/shared/js/SessionCache.js|shared/js/SessionCache.js|5.3 / 1.7 / 1.5|proprio|blocking|shared/on-demand|URL|1.74|
|181|apps/cliente/index.html:1061|/shared/js/NavConfig.js|shared/js/NavConfig.js|6.2 / 2.6 / 1.6|proprio|blocking|boot|P|1.81|
|182|apps/cliente/index.html:1063|/shared/js/InputValidator.js|shared/js/InputValidator.js|13.2 / 4.6 / 4.0|proprio|blocking|shared/on-demand|sem dependencia detectada|4.49|
|183|apps/cliente/index.html:1065|/shared/js/AuthService.js|shared/js/AuthService.js|25.2 / 10.4 / 6.7|proprio|blocking|boot|A, Se, LoggerService, SupabaseService, URL, SessionCache, InputValidator|7.69|
|184|apps/cliente/index.html:1066|/shared/js/AuthUI.js|shared/js/AuthUI.js|15.0 / 6.8 / 4.1|proprio|blocking|shared/on-demand|P, SupabaseService, URL, SessionCache, NavConfig, InputValidator, AuthService|4.68|
|185|apps/cliente/index.html:1068|/shared/js/LogoutScreen.js|shared/js/LogoutScreen.js|5.8 / 2.1 / 1.7|proprio|blocking|on-demand/evento|P, AuthService|1.95|
|186|apps/cliente/index.html:1070|/shared/js/AnimationService.js|shared/js/AnimationService.js|7.0 / 3.1 / 2.4|proprio|blocking|boot/shared core|sem dependencia detectada|2.63|
|187|apps/cliente/index.html:1071|/shared/js/MenuService.js|shared/js/MenuService.js|3.3 / 1.5 / 1.1|proprio|blocking|boot/shared core|sem dependencia detectada|1.28|
|188|apps/cliente/index.html:1072|/shared/js/UserService.js|shared/js/UserService.js|9.4 / 2.1 / 2.0|proprio|blocking|boot/shared core|SupabaseService, AuthService|2.38|
|189|apps/cliente/index.html:1073|/shared/js/BackendApiService.js|shared/js/BackendApiService.js|11.7 / 5.5 / 3.0|proprio|blocking|boot/shared core|ApiService, SupabaseService|3.49|
|190|apps/cliente/index.html:1074|/shared/js/AvatarService.js|shared/js/AvatarService.js|6.7 / 3.1 / 2.4|proprio|blocking|boot/shared core|Se, LoggerService, URL, SessionCache, MenuService, UserService, BackendApiService|2.71|
|191|apps/cliente/index.html:1075|/shared/js/SplashService.js|shared/js/SplashService.js|2.3 / 1.1 / 1.1|proprio|blocking|boot/shared core|URL|1.2|
|192|apps/cliente/index.html:1077|/shared/js/AppState.js|shared/js/AppState.js|10.9 / 2.7 / 2.9|proprio|blocking|shared/on-demand|LoggerService|3.3|
|193|apps/cliente/index.html:1079|/shared/js/GuestMode.js|shared/js/GuestMode.js|3.4 / 1.2 / 1.3|proprio|blocking|shared/on-demand|A, AppState|1.42|
|194|apps/cliente/index.html:1081|/shared/js/AuthGuard.js|shared/js/AuthGuard.js|8.5 / 4.2 / 2.6|proprio|blocking|boot/shared core|A, Se, AppState|2.95|
|195|apps/cliente/index.html:1082|/shared/js/PermissionService.js|shared/js/PermissionService.js|6.1 / 1.5 / 1.7|proprio|blocking|boot/shared core|A, AppState, AuthGuard|1.93|
|196|apps/cliente/index.html:1084|/shared/js/NavigationViewService.js|shared/js/NavigationViewService.js|10.1 / 3.5 / 3.1|proprio|blocking|boot/shared core|GuestMode, ID|3.47|
|197|apps/cliente/index.html:1086|/shared/js/Router.js|shared/js/Router.js|17.4 / 6.3 / 4.8|proprio|blocking|boot|A, Se, LoggerService, LogoutScreen, AnimationService, MenuService, AvatarService, SplashService, AppState, GuestMode, AuthGuard, ID|5.48|
|198|apps/cliente/index.html:1088|/shared/js/BarberPole.js|shared/js/BarberPole.js|4.8 / 2.5 / 1.7|proprio|blocking|shared/on-demand|sem dependencia detectada|1.88|
|199|apps/cliente/index.html:1090|/shared/js/LogoGlow.js|shared/js/LogoGlow.js|1.5 / 0.6 / 0.7|proprio|blocking|shared/on-demand|sem dependencia detectada|0.78|
|200|apps/cliente/index.html:1092|/shared/js/StoryViewer.js|shared/js/StoryViewer.js|27.0 / 19.5 / 5.9|proprio|blocking|on-demand/evento|P, Pr, AuthGuard|7|
|201|apps/cliente/index.html:1094|/shared/js/StoriesLayout.js|shared/js/StoriesLayout.js|7.8 / 2.6 / 2.1|proprio|blocking|shared/on-demand|P, StoryViewer|2.45|
|202|apps/cliente/index.html:1096|/shared/js/GeoService.js|shared/js/GeoService.js|14.4 / 6.6 / 4.3|proprio|blocking|boot/shared core|P, Se, SupabaseService, ID|4.85|
|203|apps/cliente/index.html:1098|/shared/js/BarbershopRepository.js|shared/js/BarbershopRepository.js|18.2 / 9.4 / 4.1|proprio|blocking|boot/shared core|Se, ApiService, InputValidator, ID|4.84|
|204|apps/cliente/index.html:1099|/shared/js/ProfileRepository.js|shared/js/ProfileRepository.js|14.7 / 7.1 / 3.5|proprio|blocking|boot/shared core|ApiService, SupabaseService, URL, InputValidator, ID, BarbershopRepository|4.11|
|205|apps/cliente/index.html:1101|/shared/js/BarbershopService.js|shared/js/BarbershopService.js|33.3 / 17.0 / 8.5|proprio|blocking|boot/shared core|P, Se, LoggerService, SupabaseService, AuthGuard, GeoService, BarbershopRepository, ProfileRepository|9.87|
|206|apps/cliente/index.html:1102|/shared/js/ProfessionalService.js|shared/js/ProfessionalService.js|14.5 / 7.4 / 3.9|proprio|blocking|boot/shared core|A, LoggerService, SupabaseService, AppState, AuthGuard, ProfileRepository, BarbershopService|4.46|
|207|apps/cliente/index.html:1103|/shared/js/StatusFechamentoModal.js|shared/js/StatusFechamentoModal.js|4.4 / 2.1 / 1.4|proprio|blocking|on-demand/evento|sem dependencia detectada|1.61|
|208|apps/cliente/index.html:1104|/shared/js/BarbershopAvailabilityService.js|shared/js/BarbershopAvailabilityService.js|6.3 / 2.1 / 1.7|proprio|blocking|boot/shared core|A, StatusFechamentoModal|1.95|
|209|apps/cliente/index.html:1105|/shared/js/QueueRepository.js|shared/js/QueueRepository.js|7.5 / 3.4 / 2.0|proprio|blocking|on-demand/evento|ApiService, SupabaseService, InputValidator|2.35|
|210|apps/cliente/index.html:1106|/shared/js/CadeiraService.js|shared/js/CadeiraService.js|13.6 / 5.9 / 4.0|proprio|blocking|boot/shared core|A, LoggerService, ApiService, SupabaseService, InputValidator, QueueRepository|4.51|
|211|apps/cliente/index.html:1107|/shared/js/CorteModal.js|shared/js/CorteModal.js|8.4 / 4.8 / 2.6|proprio|blocking|on-demand/evento|R|2.9|
|212|apps/cliente/index.html:1108|/shared/js/BarbeiroCard.js|shared/js/BarbeiroCard.js|3.0 / 1.3 / 1.0|proprio|blocking|shared/on-demand|SupabaseService|1.14|
|213|apps/cliente/index.html:1109|/shared/js/Cadeira.js|shared/js/Cadeira.js|8.7 / 4.4 / 2.7|proprio|blocking|shared/on-demand|SupabaseService|3.06|
|214|apps/cliente/index.html:1110|/shared/js/FilaController.js|shared/js/FilaController.js|4.1 / 1.4 / 1.3|proprio|blocking|boot/shared core|LoggerService, ApiService, InputValidator, QueueRepository, CadeiraService|1.47|
|215|apps/cliente/index.html:1111|/shared/js/QueuePoller.js|shared/js/QueuePoller.js|11.9 / 5.0 / 3.8|proprio|blocking|on-demand/evento|Se, LoggerService, ApiService, URL, BackendApiService, ID, BarbershopRepository, QueueRepository|4.23|
|216|apps/cliente/index.html:1112|/shared/js/FluxoDeFila.js|shared/js/FluxoDeFila.js|9.1 / 3.8 / 2.6|proprio|blocking|shared/on-demand|T, A, P, URL, QueuePoller|2.95|
|217|apps/cliente/index.html:1113|/shared/js/QueueModalPayloadBuilder.js|shared/js/QueueModalPayloadBuilder.js|7.2 / 2.7 / 2.0|proprio|blocking|on-demand/evento|A, P, URL, Cadeira, FluxoDeFila|2.31|
|218|apps/cliente/index.html:1114|/shared/js/QueueRealtimeNotifier.js|shared/js/QueueRealtimeNotifier.js|5.2 / 1.7 / 1.5|proprio|blocking|on-demand/evento|P, Re, LoggerService, SupabaseService, QueueRepository|1.76|
|219|apps/cliente/index.html:1115|/shared/js/QueueStateUpdater.js|shared/js/QueueStateUpdater.js|5.0 / 1.4 / 1.4|proprio|blocking|on-demand/evento|P, LoggerService, QueueRealtimeNotifier|1.61|
|220|apps/cliente/index.html:1116|/shared/js/QueuePositionNotificationService.js|shared/js/QueuePositionNotificationService.js|5.2 / 1.8 / 1.5|proprio|blocking|on-demand/evento|P, LoggerService, QueueStateUpdater|1.72|
|221|apps/cliente/index.html:1117|/shared/js/QueuePositionPresenter.js|shared/js/QueuePositionPresenter.js|5.8 / 1.6 / 1.6|proprio|blocking|on-demand/evento|P, LoggerService, URL, AuthService, FluxoDeFila, QueueModalPayloadBuilder, QueueRealtimeNotifier, QueueStateUpdater, QueuePositionNotificationService|1.87|
|222|apps/cliente/index.html:1118|/shared/js/ConfirmacaoCorteModal.js|shared/js/ConfirmacaoCorteModal.js|1.4 / 0.5 / 0.7|proprio|blocking|on-demand/evento|URL, FluxoDeFila|0.74|
|223|apps/cliente/index.html:1119|/shared/js/CadeiraConfirmacaoService.js|shared/js/CadeiraConfirmacaoService.js|9.2 / 3.2 / 2.3|proprio|blocking|boot/shared core|P, LoggerService, ApiService, URL, QueuePoller, ConfirmacaoCorteModal|2.66|
|224|apps/cliente/index.html:1120|/shared/js/ChegadaProducaoService.js|shared/js/ChegadaProducaoService.js|11.9 / 5.2 / 3.0|proprio|blocking|boot/shared core|P, LoggerService, ApiService, AuthService, QueueRepository, CadeiraService, Cadeira, FluxoDeFila, CadeiraConfirmacaoService|3.43|
|225|apps/cliente/index.html:1121|/shared/js/ModalController.js|shared/js/ModalController.js|2.5 / 0.7 / 1.0|proprio|blocking|on-demand/evento|AuthService, CorteModal|1.09|
|226|apps/cliente/index.html:1122|/shared/js/ClienteController.js|shared/js/ClienteController.js|3.8 / 0.9 / 1.1|proprio|blocking|boot/shared core|A, AuthService, CadeiraService, FilaController|1.27|
|227|apps/cliente/index.html:1123|/shared/js/BarbeariaStatusSync.js|shared/js/BarbeariaStatusSync.js|7.0 / 3.6 / 2.1|proprio|blocking|shared/on-demand|SupabaseService, StatusFechamentoModal|2.42|
|228|apps/cliente/index.html:1125|https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js|externo|n/d / n/d / n/d|vendor|blocking|shared/on-demand|sem dependencia detectada|0|
|229|apps/cliente/index.html:1128|/shared/js/BffApiService.js|shared/js/BffApiService.js|11.9 / 5.6 / 3.0|proprio|blocking|boot/shared core|SupabaseService, URL, GeoService|3.48|
|230|apps/cliente/index.html:1129|/shared/js/BffAuthClient.js|shared/js/BffAuthClient.js|5.4 / 2.7 / 1.7|proprio|blocking|shared/on-demand|P, SupabaseService, AuthService|1.91|
|231|apps/cliente/index.html:1130|/shared/js/AgendaBffClient.js|shared/js/AgendaBffClient.js|5.8 / 2.7 / 1.8|proprio|blocking|shared/on-demand|P|1.98|
|232|apps/cliente/index.html:1131|/shared/js/BarbeariaApiClient.js|shared/js/BarbeariaApiClient.js|6.4 / 3.1 / 1.8|proprio|blocking|shared/on-demand|Se, LoggerService, BffApiService|2.06|
|233|apps/cliente/index.html:1132|/shared/js/NearbyBarbershopsWidget.js|shared/js/NearbyBarbershopsWidget.js|29.9 / 18.1 / 6.6|proprio|blocking|on-demand/evento|P, Se, Rt, LoggerService, SupabaseService, URL, GeoService, BarbershopRepository, ProfileRepository, BarbershopService, ProfessionalService, StatusFechamentoModal|7.83|
|234|apps/cliente/index.html:1133|/shared/js/LojaMarker.js|shared/js/LojaMarker.js|3.1 / 1.4 / 1.2|proprio|blocking|shared/on-demand|URL|1.35|
|235|apps/cliente/index.html:1134|/shared/js/MapWidget.js|shared/js/MapWidget.js|25.9 / 13.3 / 7.2|proprio|blocking|on-demand/evento|A, P, Re, Rt, ApiService, URL, SessionCache, AuthService, GeoService, BarbeariaApiClient, NearbyBarbershopsWidget, LojaMarker|8.22|
|236|apps/cliente/index.html:1136|/shared/js/SearchWidget.js|shared/js/SearchWidget.js|13.2 / 6.8 / 3.7|proprio|blocking|on-demand/evento|P, ApiService, SupabaseService, InputValidator, ID|4.23|
|237|apps/cliente/index.html:1138|/shared/js/FonteSalao.js|shared/js/FonteSalao.js|9.5 / 3.9 / 2.4|proprio|blocking|shared/on-demand|ApiService, SupabaseService|2.77|
|238|apps/cliente/index.html:1139|/shared/js/CapaBarbearia.js|shared/js/CapaBarbearia.js|5.2 / 1.5 / 1.4|proprio|blocking|shared/on-demand|SupabaseService, InputValidator|1.57|
|239|apps/cliente/index.html:1141|/shared/js/MapPanelModule.js|shared/js/MapPanelModule.js|13.7 / 6.3 / 3.5|proprio|blocking|shared/on-demand|LoggerService, Router, GeoService, NearbyBarbershopsWidget, MapWidget|4.01|
|240|apps/cliente/index.html:1143|/shared/js/MapOrientationModule.js|shared/js/MapOrientationModule.js|14.5 / 6.5 / 3.9|proprio|blocking|shared/on-demand|Se, Re, Router, MapWidget, MapPanel|4.46|
|241|apps/cliente/index.html:1144|/shared/js/MessageService.js|shared/js/MessageService.js|4.4 / 2.0 / 1.2|proprio|blocking|boot/shared core|LoggerService, SupabaseService, InputValidator, ID|1.41|
|242|apps/cliente/index.html:1145|/shared/js/MessageCryptoService.js|shared/js/MessageCryptoService.js|7.2 / 2.6 / 2.1|proprio|blocking|boot/shared core|A, P|2.39|
|243|apps/cliente/index.html:1146|/shared/js/MessageSignalingService.js|shared/js/MessageSignalingService.js|5.9 / 1.5 / 1.6|proprio|blocking|boot/shared core|SupabaseService|1.85|
|244|apps/cliente/index.html:1147|/shared/js/P2PMessageConnectionService.js|shared/js/P2PMessageConnectionService.js|19.0 / 8.4 / 4.2|proprio|blocking|boot/shared core|A, P, Se, AuthService, MessageCryptoService, MessageSignalingService|4.96|
|245|apps/cliente/index.html:1148|/shared/js/MessagesWidget.js|shared/js/MessagesWidget.js|22.9 / 13.3 / 5.6|proprio|blocking|on-demand/evento|A, P, Se, SupabaseService, AnimationService, AuthGuard, ID, DigText, MessageCryptoService, MessageSignalingService, P2PMessageConnectionService|6.47|
|246|apps/cliente/index.html:1149|/shared/js/NotificationService.js|shared/js/NotificationService.js|24.0 / 11.1 / 6.0|proprio|blocking|on-demand/evento|P, SupabaseService, AuthService, ID, Router, QueuePoller|6.99|
|247|apps/cliente/index.html:1150|/shared/js/LgpdService.js|shared/js/LgpdService.js|10.7 / 3.5 / 2.7|proprio|blocking|boot/shared core|A, LoggerService, SupabaseService|3.1|
|248|apps/cliente/index.html:1151|/shared/js/TermsPage.js|shared/js/TermsPage.js|2.0 / 1.0 / 0.8|proprio|blocking|on-demand/evento|P|0.85|
|249|apps/cliente/index.html:1152|/shared/js/PerfilEditor.js|shared/js/PerfilEditor.js|13.7 / 7.0 / 4.0|proprio|blocking|shared/on-demand|P, LoggerService, SupabaseService, SessionCache, AuthService, ProfileRepository, NotificationService|4.55|
|250|apps/cliente/index.html:1153|/shared/js/FooterScrollManager.js|shared/js/FooterScrollManager.js|6.2 / 3.0 / 1.9|proprio|blocking|boot/shared core|P, Router|2.14|
|251|apps/cliente/index.html:1154|/shared/js/HeaderScrollBehavior.js|shared/js/HeaderScrollBehavior.js|6.8 / 3.2 / 2.2|proprio|blocking|shared/on-demand|sem dependencia detectada|2.46|
|252|apps/cliente/index.html:1156|assets/js/pages/LoginPage.js|apps/cliente/assets/js/pages/LoginPage.js|1.6 / 0.6 / 0.7|proprio|blocking|pagina especifica|P, InputValidator, AuthService, AuthUI|0.75|
|253|apps/cliente/index.html:1157|assets/js/pages/RegisterPage.js|apps/cliente/assets/js/pages/RegisterPage.js|1.7 / 0.7 / 0.7|proprio|blocking|pagina especifica|P, InputValidator, AuthService, AuthUI|0.76|
|254|apps/cliente/index.html:1158|assets/js/pages/ForgotPasswordPage.js|apps/cliente/assets/js/pages/ForgotPasswordPage.js|1.5 / 0.4 / 0.6|proprio|blocking|pagina especifica|P, AuthService, AuthUI|0.69|
|255|apps/cliente/index.html:1159|assets/js/pages/HomePage.js|apps/cliente/assets/js/pages/HomePage.js|2.0 / 0.6 / 0.8|proprio|blocking|pagina especifica|P, AuthGuard, StoryViewer, BarbershopService, MapPanel|0.91|
|256|apps/cliente/index.html:1160|assets/js/pages/SearchPage.js|apps/cliente/assets/js/pages/SearchPage.js|0.8 / 0.2 / 0.4|proprio|blocking|pagina especifica|A, P, SearchWidget|0.45|
|257|apps/cliente/index.html:1161|/shared/js/Cliente.js|shared/js/Cliente.js|4.4 / 1.7 / 1.6|proprio|blocking|shared/on-demand|InputValidator|1.73|
|258|apps/cliente/index.html:1162|/shared/js/Agendamento.js|shared/js/Agendamento.js|6.2 / 3.0 / 1.9|proprio|blocking|shared/on-demand|InputValidator|2.18|
|259|apps/cliente/index.html:1163|assets/js/ClienteRepository.js|apps/cliente/assets/js/ClienteRepository.js|4.6 / 1.6 / 1.3|proprio|blocking|boot/shared core|ApiService, InputValidator, ProfileRepository|1.44|
|260|apps/cliente/index.html:1164|assets/js/ClienteService.js|apps/cliente/assets/js/ClienteService.js|3.7 / 0.7 / 0.9|proprio|blocking|boot/shared core|AgendaBffClient, Cliente, ClienteRepository|1.07|
|261|apps/cliente/index.html:1165|assets/js/pages/FavoritesPage.js|apps/cliente/assets/js/pages/FavoritesPage.js|6.0 / 3.7 / 2.0|proprio|blocking|pagina especifica|Se, LoggerService, SupabaseService, AuthService, AppState, ProfileRepository, DigText, CapaBarbearia|2.25|
|262|apps/cliente/index.html:1166|assets/js/pages/ProfilePage.js|apps/cliente/assets/js/pages/ProfilePage.js|4.5 / 2.0 / 1.6|proprio|blocking|pagina especifica|P, SupabaseService, URL, SessionCache, Router, ProfileRepository, PerfilEditor|1.82|
|263|apps/cliente/index.html:1167|assets/js/pages/LogoutPage.js|apps/cliente/assets/js/pages/LogoutPage.js|1.1 / 0.1 / 0.5|proprio|blocking|pagina especifica|A, P, Router|0.54|
|264|apps/cliente/index.html:1168|assets/js/pages/DestaquesPage.js|apps/cliente/assets/js/pages/DestaquesPage.js|6.8 / 4.5 / 2.4|proprio|blocking|pagina especifica|LoggerService, SupabaseService, BarbershopRepository, BarbershopService, StatusFechamentoModal, DigText, FonteSalao, CapaBarbearia|2.64|
|265|apps/cliente/index.html:1169|assets/js/pages/BarbeirosPage.js|apps/cliente/assets/js/pages/BarbeirosPage.js|6.9 / 4.5 / 2.3|proprio|blocking|pagina especifica|LoggerService, SupabaseService, BarbershopRepository, ProfileRepository, BarbershopService, ProfessionalService, DigText|2.55|
|266|apps/cliente/index.html:1170|assets/js/pages/BarbeariasPage.js|apps/cliente/assets/js/pages/BarbeariasPage.js|6.0 / 4.1 / 2.2|proprio|blocking|pagina especifica|Pr, LoggerService, SupabaseService, BarbershopRepository, BarbershopService, StatusFechamentoModal, DigText, FonteSalao, CapaBarbearia|2.41|
|267|apps/cliente/index.html:1171|/shared/js/CacheManager.js|shared/js/CacheManager.js|3.6 / 0.7 / 1.0|proprio|blocking|boot/shared core|sem dependencia detectada|1.17|
|268|apps/cliente/index.html:1172|/shared/js/StateManager.js|shared/js/StateManager.js|2.2 / 0.5 / 0.8|proprio|blocking|boot/shared core|Se, CacheManager|0.85|
|269|apps/cliente/index.html:1173|/shared/js/ResourceLoader.js|shared/js/ResourceLoader.js|3.8 / 0.8 / 1.1|proprio|blocking|shared/on-demand|Se, URL, CacheManager, StateManager|1.28|
|270|apps/cliente/index.html:1174|/shared/js/NavigationManager.js|shared/js/NavigationManager.js|7.3 / 2.1 / 2.3|proprio|blocking|boot/shared core|P, Se, LoggerService, ApiService, BarbershopRepository, CacheManager, StateManager|2.62|
|271|apps/cliente/index.html:1175|/shared/js/PushSubscriptionService.js|shared/js/PushSubscriptionService.js|8.8 / 3.6 / 2.5|proprio|blocking|on-demand/evento|A, P, Se, Re, LoggerService, SupabaseService, ID|2.89|
|272|apps/cliente/index.html:1176|/shared/js/OfflineSyncQueue.js|shared/js/OfflineSyncQueue.js|7.0 / 2.8 / 2.0|proprio|blocking|on-demand/evento|P|2.32|
|273|apps/cliente/index.html:1177|/shared/js/FilaPresencaService.js|shared/js/FilaPresencaService.js|10.0 / 4.0 / 2.7|proprio|blocking|boot/shared core|P, LoggerService, ApiService, AuthService, QueueRepository, FluxoDeFila, QueueModalPayloadBuilder, ClienteController, BffApiService, NotificationService, Cliente|3.12|
|274|apps/cliente/index.html:1178|/shared/js/BarbeariaPage.js|shared/js/BarbeariaPage.js|50.3 / 26.2 / 12.7|proprio|blocking|shared/on-demand|P, Se, Re, LoggerService, ApiService, SupabaseService, InputValidator, AuthService, AppState, ID, BarbershopRepository, BarbershopService|14.76|
|275|apps/cliente/index.html:1179|/shared/js/BarbeiroPage.js|shared/js/BarbeiroPage.js|11.7 / 5.5 / 3.1|proprio|blocking|shared/on-demand|P, Se, Pr, LoggerService, ApiService, SupabaseService, InputValidator, ID, BarbershopRepository, ProfessionalService, CacheManager, NavigationManager|3.62|
|276|apps/cliente/index.html:1180|/shared/js/PWAInstallBanner.js|shared/js/PWAInstallBanner.js|10.1 / 4.4 / 3.0|proprio|blocking|shared/on-demand|P, Re, LoggerService, R|3.38|
|277|apps/cliente/index.html:1182|assets/js/ClienteStartupSplash.js|apps/cliente/assets/js/ClienteStartupSplash.js|3.5 / 1.5 / 1.2|proprio|blocking|boot|P, BarberPole, Cliente|1.33|
|278|apps/cliente/index.html:1183|assets/js/AppBootstrap.js|apps/cliente/assets/js/AppBootstrap.js|9.1 / 4.6 / 2.9|proprio|blocking|boot|LoggerService, URL, AppState, GeoService, NearbyBarbershopsWidget, MapWidget, MapPanel, MapOrientationModule, MessagesWidget, NotificationService, LgpdService, TermsPage|3.31|
|279|apps/cliente/index.html:1185|/shared/js/QueueConfirmService.js|shared/js/QueueConfirmService.js|13.8 / 6.2 / 3.8|proprio|blocking|on-demand/evento|A, P, Se, ApiService, SupabaseService, URL, BarbershopRepository, QueuePoller, ConfirmacaoCorteModal, CadeiraConfirmacaoService, NotificationService, Cliente|4.31|
|280|apps/cliente/index.html:1187|assets/js/app.js|apps/cliente/assets/js/app.js|4.4 / 1.9 / 1.5|proprio|blocking|boot|SupabaseService, AuthService, Router, BarbershopRepository, ProfileRepository, BarbershopService, QueueRealtimeNotifier, QueueStateUpdater, QueuePositionNotificationService, QueuePositionPresenter, CadeiraConfirmacaoService, LoginPage|1.71|

## Plano de migracao em 3 fases

### Fase 1: defer/async + remocao de duplicados/mortos

Escopo: aplicar `defer` nos candidatos sem dependencia de boot, remover referencias ausentes/legadas confirmadas por coverage e consolidar variantes duplicadas.

Risco: baixo a medio; risco principal e quebrar globais esperados por scripts inline ou boot.

Rollback: reverter apenas atributos `defer/async` e refs removidas no HTML.

Metricas de sucesso: TTI -10% a -20%, TBT -10%, LCP sem regressao; zero erro `ReferenceError` no console.

### Fase 2: agrupar scripts proprios por section e migrar para ES modules

Escopo: transformar classes de pagina/section em imports explicitos, manter adapters para globais criticos e dividir cliente/profissional.

Risco: medio; muda ordem de avaliacao e exposicao global.

Rollback: manter camada compat que reexporta classes para `window` e voltar script classico por pagina.

Metricas de sucesso: reduzir scripts blocking em pelo menos 50%, TBT -20%, bytes parseados no boot -30%.

### Fase 3: introduzir Vite, tree-shaking e chunks por section

Escopo: build com Vite, chunks por app e por section, vendor chunk unico, sourcemaps controlados e cache busting.

Risco: alto; afeta pipeline de deploy, CSP e service worker.

Rollback: publicar bundle em rota paralela e manter HTML legado ate validacao por cohort.

Metricas de sucesso: TTI mobile < 3.5s em 4G simulado, LCP < 2.5s, TBT < 200ms, JS inicial gzip -40%.

## Decisoes que dependem do humano

- Autorizar instalacao/uso do Lighthouse no CI para baseline real.
- Confirmar se HTMLs raiz `cliente.html` e `profissional.html` ainda sao producao ou legado.
- Confirmar providers externos permitidos: Leaflet CDN, Supabase local minificado e eventuais trackers futuros.
- Definir se a proxima fase deve priorizar app cliente, app profissional ou ambos em paridade.
- Validar que service worker/cache nao depende de nomes atuais antes de Vite.
