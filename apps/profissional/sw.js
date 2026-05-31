'use strict';

// =============================================================
// SWProfissional Ã¢â‚¬â€ Service Worker do App Profissional (POO)
//
// Cache multi-tier:
//   CACHE_STATIC Ã¢â‚¬â€ JS, CSS, fontes  (cache-first + stale-while-revalidate)
//   CACHE_IMAGES Ã¢â‚¬â€ imagens          (cache-first + stale-while-revalidate)
//   CACHE_SHELL  Ã¢â‚¬â€ HTML/navegaÃƒÂ§ÃƒÂ£o   (network-first + cache offline)
//
// Background Sync:
//   bf-sync-queue   Ã¢â€ â€™ replaya requests pendentes da OfflineSyncQueue
//   bf-sync-cleanup Ã¢â€ â€™ purga imagens > 7 dias do CACHE_IMAGES
//
// Periodic Background Sync:
//   bf-periodic-cache-refresh Ã¢â€ â€™ atualiza silenciosamente CACHE_STATIC
// =============================================================
// VersÃƒÂ£o do Service Worker Ã¢â‚¬â€ bumpar a cada deploy para invalidar caches antigos.
// A limpeza ocorre no evento 'activate' via #CACHES_VALIDOS.
const SW_PRO_VERSION = '20260531w';

class SWProfissional {

  static #CACHE_STATIC   = `bf-pro-static-${SW_PRO_VERSION}`;
  static #CACHE_IMAGES   = `bf-pro-images-${SW_PRO_VERSION}`;
  static #CACHE_SHELL    = `bf-pro-shell-${SW_PRO_VERSION}`;
  static #CACHES_VALIDOS = new Set([
    `bf-pro-static-${SW_PRO_VERSION}`,
    `bf-pro-images-${SW_PRO_VERSION}`,
    `bf-pro-shell-${SW_PRO_VERSION}`,
  ]);

  // Assets JS/CSS Ã¢â‚¬â€ prÃƒÂ©-cacheados em CACHE_STATIC
  // HTML nunca entra na lista Ã¢â‚¬â€ sempre servido da rede
  static #ASSETS_STATIC = [
    '/assets/css/styles.css',
    '/assets/js/app.js',
    '/shared/css/tokens.css',
    '/shared/css/components.css',
    '/shared/js/LoggerService.js',
    '/shared/js/SectionEventCatalog.js',
    '/shared/js/SectionEventBus.js',
    '/shared/js/PageSection.js',
    '/shared/js/LgpdService.js',
    '/shared/js/TermsPage.js',
    '/shared/js/NavigationViewService.js',
    '/shared/js/Router.js',
    '/shared/js/BarberPole.js',
    '/shared/js/SplashService.js',
    '/shared/js/ProLandingGate.js',
    '/shared/js/PaymentFlowHandler.js',
    '/shared/js/CadeiraService.js',
    '/shared/js/ClienteSeletorModal.js',
    '/shared/js/CorteModal.js',
    '/shared/js/FinalizarCorteModal.js',
    '/shared/js/BarbeiroCard.js',
    '/shared/js/Cadeira.js',
    '/shared/js/FilaController.js',
    '/shared/js/ModalController.js',
    '/shared/js/ClienteController.js',
    '/shared/js/OfflineSyncQueue.js',
    '/shared/js/PWAInstallBanner.js',
    '/shared/js/BffApiService.js',
    '/shared/js/BffAuthClient.js',
    '/shared/js/BarbeariaApiClient.js',
    '/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaState.js',
    '/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaView.js',
    '/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaController.js',
    '/assets/js/pages/MinhaBarbeariaPage/AgendaSection/AgendaSection.js',
    '/shared/js/PortfolioPrismViewer.js',
    '/shared/js/BarbeariaPage.js',
    '/shared/js/PortfolioBarbeirosSection.js',
    '/shared/js/GeoService.js',
    '/shared/js/MapWidget.js',
    '/shared/js/NearbyBarbershopsWidget.js',
    '/manifest.json',
  ];

  // Imagens Ã¢â‚¬â€ prÃƒÂ©-cacheadas em CACHE_IMAGES
  static #ASSETS_IMAGES = [
    '/shared/img/Logo01.png',
    '/shared/img/icone-do-App.png',
    '/shared/img/inicio.svg',
    '/shared/img/mensagen.svg',
    '/shared/img/meu-b.svg',
    '/shared/img/perfil.svg',
    '/shared/img/sair.svg',
    '/shared/img/icones-perfil.png',
    '/shared/img/icones-cadeira-producao.png',
    '/shared/img/icones-cadeira-de-\u00e9spera.png',
    '/shared/img/login.svg',
    '/shared/img/bg-entrada.jpg',
    '/shared/img/icon-192-pro.png',
    '/shared/img/icon-512-pro.png',
    '/shared/img/icon-512-cliente.png',
  ];

  // Ã¢â€â‚¬Ã¢â€â‚¬ Instala: prÃƒÂ©-cacheia static em CACHE_STATIC e imagens em CACHE_IMAGES Ã¢â€â‚¬Ã¢â€â‚¬
  static install(e) {
    e.waitUntil((async () => {
      const [cs, ci] = await Promise.all([
        caches.open(SWProfissional.#CACHE_STATIC),
        caches.open(SWProfissional.#CACHE_IMAGES),
      ]);
      await Promise.all([
        Promise.allSettled(SWProfissional.#ASSETS_STATIC.map(url => cs.add(url))),
        Promise.allSettled(SWProfissional.#ASSETS_IMAGES.map(url => ci.add(url))),
      ]);
      await self.skipWaiting();
    })());
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Ativa: remove TODOS os caches nÃƒÂ£o reconhecidos Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static activate(e) {
    e.waitUntil(
      caches.keys()
        .then(keys => Promise.all(
          keys
            .filter(k => !SWProfissional.#CACHES_VALIDOS.has(k))
            .map(k  => caches.delete(k)),
        ))
        // .catch evita "Could not establish connection" quando o Chrome
        // tenta reclamar clientes que jÃƒÂ¡ fecharam/navegaram
        .then(() => self.clients.claim().catch(() => {})),
    );
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Roteamento de fetch: shell / imagens / estÃƒÂ¡tico Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static fetch(e) {
    const url = new URL(e.request.url);
    if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

    // NavegaÃƒÂ§ÃƒÂµes HTML Ã¢â‚¬â€ NUNCA cachear, sempre rede (garante boot-lock mais recente)
    if (e.request.mode === 'navigate') {
      e.respondWith(SWProfissional.#estrategiaShell(e.request));
      return;
    }

    if (/\.(?:png|jpe?g|svg|webp|gif|ico)(?:\?.*)?$/i.test(url.pathname)) {
      e.respondWith(SWProfissional.#estrategiaImagens(e.request));
      return;
    }

    e.respondWith(SWProfissional.#estrategiaEstatico(e.request));
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ EstratÃƒÂ©gia SHELL: network-first + cache + offline fallback Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static async #estrategiaShell(request) {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const clone = response.clone();
        caches.open(SWProfissional.#CACHE_SHELL).then(c => c.put(request, clone));
      }
      return response;
    } catch {
      const cached = await caches.match(request)
        || await caches.match('/');
      return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ EstratÃƒÂ©gia IMAGENS: cache-first + stale-while-revalidate Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static async #estrategiaImagens(request) {
    const cached       = await caches.match(request);
    const fetchAndSave = fetch(request).then(res => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        const clone = res.clone(); // clonar ANTES de qualquer operaÃƒÂ§ÃƒÂ£o async
        caches.open(SWProfissional.#CACHE_IMAGES).then(c => c.put(request, clone));
      }
      return res;
    }).catch(() => null);

    if (cached) { void fetchAndSave; return cached; }
    return (await fetchAndSave)
      || new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ EstratÃƒÂ©gia ESTÃƒÂTICO: cache-first + stale-while-revalidate Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static async #estrategiaEstatico(request) {
    const cached       = await caches.match(request);
    const fetchAndSave = fetch(request).then(res => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        const clone = res.clone(); // clonar ANTES de qualquer operaÃƒÂ§ÃƒÂ£o async
        caches.open(SWProfissional.#CACHE_STATIC).then(c => c.put(request, clone));
      }
      return res;
    }).catch(() => null);

    if (cached) { void fetchAndSave; return cached; }
    return (await fetchAndSave)
      || new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Background Sync: replaya fila offline + limpa imagens antigas Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static sync(e) {
    if (e.tag === 'bf-sync-queue')   { e.waitUntil(SWProfissional.#processarSyncQueue());  return; }
    if (e.tag === 'bf-sync-cleanup') { e.waitUntil(SWProfissional.#limparCacheImagens()); return; }
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Periodic Background Sync: atualiza assets silenciosamente Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static periodicsync(e) {
    if (e.tag === 'bf-periodic-cache-refresh') {
      e.waitUntil(SWProfissional.#refreshAssets());
    }
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Web Push: acorda o SW, vibra o dispositivo e exibe a notificaÃƒÂ§ÃƒÂ£o Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  // Payload esperado (JSON cifrado pela Edge Function send-push):
  //   { title, body, icon, badge, tag, vibrate, data: { url, barbershopId, entradaId } }
  static push(e) {
    console.log('[SW-Pro] push recebido, tem payload:', !!e.data);
    e.waitUntil((async () => {
      let payload = {};
      try { payload = e.data?.json() ?? {}; } catch { /* payload vazio ÃƒÂ© ok */ }

      const title = payload.title ?? 'Nova atualizaÃƒÂ§ÃƒÂ£o Ã¢Å“â€šÃ¯Â¸Â';
      const opts  = {
        body:               payload.body   ?? 'Toque para ver.',
        icon:               payload.icon   ?? '/shared/img/icon-192-pro.png',
        badge:              payload.badge  ?? '/shared/img/icon-192-pro.png',
        tag:                payload.tag    ?? 'bf-pro-push',
        requireInteraction: payload.requireInteraction ?? false,
        // VibraÃƒÂ§ÃƒÂ£o curta para notificaÃƒÂ§ÃƒÂµes do profissional
        vibrate:            payload.vibrate ?? [200, 100, 200],
        silent:             false,
        data:               payload.data  ?? {},
      };

      // Adiciona botÃƒÂµes de aÃƒÂ§ÃƒÂ£o para notificaÃƒÂ§ÃƒÂµes de chegada do cliente (Android)
      const pushType = opts.data?.pushType;
      if (pushType === 'client_not_seated') {
        opts.actions            = [
          { action: 'aguardar', title: '\u2705 Aguardar' },
          { action: 'remover',  title: '\u274c Chamar prÃƒÂ³ximo' },
        ];
        opts.requireInteraction = true;
      } else if (pushType === 'client_at_shop') {
        opts.actions            = [
          { action: 'chegou',   title: '\u2705 EstÃƒÂ¡ aqui' },
          { action: 'aguardar', title: '\u23f3 Aguardar' },
        ];
        opts.requireInteraction = true;
      }

      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.allSettled(clientList.map(client => client.postMessage({
        type:         'PUSH_SHOW_MODAL',
        pushType:     opts.data?.pushType     ?? null,
        entradaId:    opts.data?.entradaId    ?? null,
        barbershopId: opts.data?.barbershopId ?? null,
        clienteNome:  opts.data?.clienteNome  ?? null,
        statusLabel:  opts.data?.statusLabel  ?? null,
        cadeira:      opts.data?.cadeira      ?? null,
        cliente:      opts.data?.cliente      ?? null,
      })));

      await self.registration.showNotification(title, opts);
      console.log('[SW-Pro] showNotification ok, tag:', opts.tag);
    })());
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Clique na notificaÃƒÂ§ÃƒÂ£o: botÃƒÂ£o de aÃƒÂ§ÃƒÂ£o (Android) ou toque no corpo (iOS + Android) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static notificationclick(e) {
    e.notification.close();

    const data = e.notification.data ?? {};
    const acao = e.action; // string vazia = toque no corpo; 'aguardar'|'remover'|'chegou' = botÃƒÂ£o

    e.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          const existing = clientList.find(c => c.url.includes(self.location.origin));

          if (acao) {
            // BotÃƒÂ£o de aÃƒÂ§ÃƒÂ£o clicado (Android) Ã¢â‚¬â€ execuÃƒÂ§ÃƒÂ£o silenciosa no app
            if (existing) {
              existing.postMessage({
                type:         'PUSH_ACTION',
                acao,
                entradaId:    data.entradaId    ?? null,
                barbershopId: data.barbershopId ?? null,
                pushType:     data.pushType     ?? null,
                clienteNome:  data.clienteNome  ?? null,
                statusLabel:  data.statusLabel  ?? null,
                cadeira:      data.cadeira      ?? null,
                cliente:      data.cliente      ?? null,
              });
              return existing.focus();
            }
            const params = new URLSearchParams({
              push_action: acao,
              push_entry:  data.entradaId    ?? '',
              push_shop:   data.barbershopId ?? '',
              push_type:   data.pushType     ?? '',
              push_nome:   data.clienteNome  ?? '',
              push_status: data.statusLabel  ?? '',
              push_chair:  data.cadeira      ?? '',
            });
            return self.clients.openWindow(`/profissional/?${params}`);
          }

          // Toque no corpo da notificaÃƒÂ§ÃƒÂ£o (iOS Safari + Android) Ã¢â‚¬â€ abre a modal existente
          if (existing) {
            existing.postMessage({
              type:         'PUSH_SHOW_MODAL',
              pushType:     data.pushType     ?? null,
              entradaId:    data.entradaId    ?? null,
              barbershopId: data.barbershopId ?? null,
              clienteNome:  data.clienteNome  ?? null,
              statusLabel:  data.statusLabel  ?? null,
              cadeira:      data.cadeira      ?? null,
              cliente:      data.cliente      ?? null,
            });
            return existing.focus();
          }
          const params = new URLSearchParams({
            push_type:  data.pushType     ?? '',
            push_entry: data.entradaId    ?? '',
            push_shop:  data.barbershopId ?? '',
            push_nome:  data.clienteNome  ?? '',
            push_status:data.statusLabel  ?? '',
            push_chair: data.cadeira      ?? '',
          });
          return self.clients.openWindow(`/profissional/?${params}`);
        }),
    );
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Sync: processa fila de requests offline Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static async #processarSyncQueue() {
    let db;
    try   { db = await SWProfissional.#abrirSyncDB(); }
    catch { return; }

    const entries = await SWProfissional.#dequeueAll(db, 'bf-sync-queue');
    await Promise.allSettled(entries.map(async entry => {
      try {
        const res = await fetch(entry.url, {
          method:  entry.method,
          headers: entry.headers,
          body:    (entry.method !== 'GET' && entry.method !== 'HEAD') ? entry.body : undefined,
        });
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          await SWProfissional.#concluirEntry(db, entry.id);
        }
      } catch { /* falha de rede Ã¢â‚¬â€ mantÃƒÂ©m na fila */ }
    }));
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Periodic: re-fetch silencioso de todos os assets estÃƒÂ¡ticos Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static async #refreshAssets() {
    const cache = await caches.open(SWProfissional.#CACHE_STATIC);
    await Promise.allSettled(
      SWProfissional.#ASSETS_STATIC.map(url =>
        fetch(url, { cache: 'no-cache' })
          .then(res => { if (res && res.status === 200) cache.put(url, res); })
          .catch(() => {}),
      ),
    );
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Cleanup: purga imagens > 7 dias Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static async #limparCacheImagens() {
    const cache     = await caches.open(SWProfissional.#CACHE_IMAGES);
    const requests  = await cache.keys();
    const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
    await Promise.allSettled(
      requests.map(async req => {
        const res  = await cache.match(req);
        const date = res?.headers?.get('date');
        if (date && new Date(date).getTime() < threshold) await cache.delete(req);
      }),
    );
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Helpers IDB (inline Ã¢â‚¬â€ SW nÃƒÂ£o tem acesso ÃƒÂ  classe OfflineSyncQueue) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static #abrirSyncDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('barberflow-sync', 1);
      req.onsuccess       = e => resolve(e.target.result);
      req.onerror         = e => reject(e.target.error);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('queue')) {
          const store = db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
          store.createIndex('tag', 'tag', { unique: false });
        }
      };
    });
  }

  static #dequeueAll(db, tag) {
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('queue', 'readonly');
      const store = tx.objectStore('queue');
      const index = store.index('tag');
      const req   = index.getAll(tag);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => reject(req.error);
    });
  }

  static #concluirEntry(db, id) {
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('queue', 'readwrite');
      const store = tx.objectStore('queue');
      const req   = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Registra todos os listeners Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  static init() {
    self.addEventListener('install',           e => SWProfissional.install(e));
    self.addEventListener('activate',          e => SWProfissional.activate(e));
    self.addEventListener('fetch',             e => SWProfissional.fetch(e));
    self.addEventListener('sync',              e => SWProfissional.sync(e));
    self.addEventListener('periodicsync',      e => SWProfissional.periodicsync(e));
    self.addEventListener('push',              e => SWProfissional.push(e));
    self.addEventListener('notificationclick', e => SWProfissional.notificationclick(e));
    // Suporte a SKIP_WAITING via postMessage (usado pelo AppBootstrap no updatefound)
    self.addEventListener('message', e => {
      if (e.data?.type === 'SKIP_WAITING') e.waitUntil(self.skipWaiting());
    });
  }
}

/* Ã¢â€â‚¬Ã¢â€â‚¬ Ponto de entrada Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */
SWProfissional.init();
