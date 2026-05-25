'use strict';

// =============================================================
// SWCliente — Service Worker do App Cliente (POO)
//
// Cache multi-tier:
//   CACHE_STATIC — JS, CSS, fontes  (cache-first + stale-while-revalidate)
//   CACHE_IMAGES — imagens          (cache-first + stale-while-revalidate)
//   CACHE_SHELL  — HTML/navegação   (network-first + cache offline)
//
// Background Sync:
//   bf-sync-queue   → replaya requests pendentes da OfflineSyncQueue
//   bf-sync-cleanup → purga imagens > 7 dias do CACHE_IMAGES
//
// Periodic Background Sync:
//   bf-periodic-cache-refresh → atualiza silenciosamente CACHE_STATIC
// =============================================================
// Versão do Service Worker — bumpar a cada deploy para invalidar caches antigos.
// A limpeza ocorre no evento 'activate' via #CACHES_VALIDOS.
const SW_CLI_VERSION = '20260524b';

class SWCliente {

  static #CACHE_STATIC    = `bf-cli-static-${SW_CLI_VERSION}`;
  static #CACHE_IMAGES    = `bf-cli-images-${SW_CLI_VERSION}`;
  static #CACHE_SHELL     = `bf-cli-shell-${SW_CLI_VERSION}`;
  static #CACHES_VALIDOS  = new Set([
    `bf-cli-static-${SW_CLI_VERSION}`,
    `bf-cli-images-${SW_CLI_VERSION}`,
    `bf-cli-shell-${SW_CLI_VERSION}`,
  ]);

  // Assets JS/CSS — pré-cacheados em CACHE_STATIC
  static #ASSETS_STATIC = [
    '/cliente/assets/css/styles.css',
    '/cliente/assets/js/app.js',
    '/cliente/assets/js/ClienteStartupSplash.js',
    '/shared/css/tokens.css',
    '/shared/css/components.css',
    '/shared/js/LoggerService.js',
    '/shared/js/LgpdService.js',
    '/shared/js/TermsPage.js',
    '/shared/js/NavigationViewService.js',
    '/shared/js/Router.js',
    '/shared/js/BarberPole.js',
    '/shared/js/SplashService.js',
    '/shared/js/QueueRepository.js',
    '/shared/js/CadeiraService.js',
    '/shared/js/BarbershopAvailabilityService.js',
    '/shared/js/QueueModalPayloadBuilder.js',
    '/shared/js/QueueRealtimeNotifier.js',
    '/shared/js/QueueStateUpdater.js',
    '/shared/js/QueuePositionNotificationService.js',
    '/shared/js/QueuePositionPresenter.js',
    '/shared/js/FilaPresencaService.js',
    '/shared/js/ChegadaProducaoService.js',
    '/shared/js/CorteModal.js',
    '/shared/js/BarbeiroCard.js',
    '/shared/js/Cadeira.js',
    '/shared/js/FilaController.js',
    '/shared/js/ModalController.js',
    '/shared/js/ClienteController.js',
    '/shared/js/OfflineSyncQueue.js',
    '/shared/js/PWAInstallBanner.js',
    '/shared/js/BffApiService.js',
    '/shared/js/BffAuthClient.js',
    '/shared/js/AgendaBffClient.js',
    '/shared/js/BarbeariaApiClient.js',
    '/shared/js/GeoService.js',
    '/shared/js/LojaMarker.js',
    '/shared/js/MapWidget.js',
    '/shared/js/NearbyBarbershopsWidget.js',
  ];

  // Imagens — pré-cacheadas em CACHE_IMAGES
  static #ASSETS_IMAGES = [
    '/shared/img/Logo01.png',
    '/shared/img/icone-do-App.png',
    '/shared/img/inicio.svg',
    '/shared/img/pesquisa.svg',
    '/shared/img/mensagen.svg',
    '/shared/img/meu-b.svg',
    '/shared/img/perfil.svg',
    '/shared/img/sair.svg',
    '/shared/img/icones-perfil.png',
    '/shared/img/icones-cadeira-salao-vazia.png',
    '/shared/img/icones-cadeira-producao.png',
    '/shared/img/icones-cadeira-de-\u00e9spera.png',
    '/shared/img/bg-entrada.jpg',
    '/shared/img/icon-192-cliente.png',
    '/shared/img/icon-512-cliente.png',
    '/shared/img/login.svg',
  ];

  // ── Instala: pré-cacheia static em CACHE_STATIC e imagens em CACHE_IMAGES ──
  static install(e) {
    e.waitUntil((async () => {
      const [cs, ci] = await Promise.all([
        caches.open(SWCliente.#CACHE_STATIC),
        caches.open(SWCliente.#CACHE_IMAGES),
      ]);
      await Promise.all([
        Promise.allSettled(SWCliente.#ASSETS_STATIC.map(url => cs.add(url))),
        Promise.allSettled(SWCliente.#ASSETS_IMAGES.map(url => ci.add(url))),
      ]);
      await self.skipWaiting();
    })());
  }

  // ── Ativa: remove TODOS os caches não reconhecidos e assume controle ──────
  static activate(e) {
    e.waitUntil(
      caches.keys()
        .then(keys => Promise.all(
          keys
            .filter(k => !SWCliente.#CACHES_VALIDOS.has(k))
            .map(k  => caches.delete(k)),
        ))
        .then(() => self.clients.claim().catch(() => {})),
    );
  }

  // ── Roteamento de fetch: shell / imagens / estático ───────────────────────
  static fetch(e) {
    const url = new URL(e.request.url);
    if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

    if (e.request.mode === 'navigate') {
      e.respondWith(SWCliente.#estrategiaShell(e.request));
      return;
    }

    if (/\.(?:png|jpe?g|svg|webp|gif|ico)(?:\?.*)?$/i.test(url.pathname)) {
      e.respondWith(SWCliente.#estrategiaImagens(e.request));
      return;
    }

    e.respondWith(SWCliente.#estrategiaEstatico(e.request));
  }

  // ── Estratégia SHELL: network-first + offline fallback ───────────────────
  static async #estrategiaShell(request) {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const clone = response.clone();
        caches.open(SWCliente.#CACHE_SHELL).then(c => c.put(request, clone));
      }
      return response;
    } catch {
      const cached = await caches.match(request)
        || await caches.match('/cliente/');
      return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  }

  // ── Estratégia IMAGENS: cache-first + stale-while-revalidate ─────────────
  static async #estrategiaImagens(request) {
    const cached       = await caches.match(request);
    const fetchAndSave = fetch(request).then(res => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        const clone = res.clone(); // clonar ANTES de qualquer operação async
        caches.open(SWCliente.#CACHE_IMAGES).then(c => c.put(request, clone));
      }
      return res;
    }).catch(() => null);

    if (cached) { void fetchAndSave; return cached; } // stale enquanto atualiza
    return (await fetchAndSave)
      || new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }

  // ── Estratégia ESTÁTICO: cache-first + stale-while-revalidate ────────────
  static async #estrategiaEstatico(request) {
    const cached       = await caches.match(request);
    const fetchAndSave = fetch(request).then(res => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        const clone = res.clone(); // clonar ANTES de qualquer operação async
        caches.open(SWCliente.#CACHE_STATIC).then(c => c.put(request, clone));
      }
      return res;
    }).catch(() => null);

    if (cached) { void fetchAndSave; return cached; } // stale enquanto atualiza
    return (await fetchAndSave)
      || new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }

  // ── Background Sync: replaya fila offline + limpa imagens antigas ────────
  static sync(e) {
    if (e.tag === 'bf-sync-queue')   { e.waitUntil(SWCliente.#processarSyncQueue());  return; }
    if (e.tag === 'bf-sync-cleanup') { e.waitUntil(SWCliente.#limparCacheImagens()); return; }
  }

  // ── Periodic Background Sync: atualiza assets estaticamente ─────────────
  static periodicsync(e) {
    if (e.tag === 'bf-periodic-cache-refresh') {
      e.waitUntil(SWCliente.#refreshAssets());
    }
  }

  // ── Web Push: acorda o SW, vibra o dispositivo e exibe a notificação ─────
  // Payload esperado (JSON cifrado pela Edge Function send-push):
  //   { title, body, icon, badge, tag, requireInteraction, vibrate, data: { url, barbershopId, entradaId } }
  static push(e) {
    console.log('[SW-Cliente] push recebido, tem payload:', !!e.data);
    e.waitUntil((async () => {
      let payload = {};
      try { payload = e.data?.json() ?? {}; } catch { /* payload vazio é ok */ }

      const title = payload.title ?? 'Você foi chamado! ✂️';
      const opts  = {
        body:               payload.body    ?? 'O barbeiro está te esperando na cadeira.',
        icon:               payload.icon    ?? '/shared/img/icon-192-cliente.png',
        badge:              payload.badge   ?? '/shared/img/icon-192-cliente.png',
        tag:                payload.tag     ?? 'bf-inservice',
        requireInteraction: payload.requireInteraction ?? true,
        // Padrão de vibração: 300ms vibra, 100ms pausa, 300ms vibra, 100ms pausa, 500ms vibra
        // O Android toca o som de notificação do sistema automaticamente
        vibrate:            payload.vibrate ?? [300, 100, 300, 100, 500],
        silent:             false,
        data:               payload.data   ?? {},
      };

      await self.registration.showNotification(title, opts);
      console.log('[SW-Cliente] showNotification ok, tag:', opts.tag);
    })());
  }

  // ── Clique na notificação: foca aba existente ou abre nova ───────────
  // Evita múltiplas abas: sempre tenta reutilizar aba com /cliente/.
  // Se app aberto: postMessage PUSH_NAVIGATE para disparo de deep-link.
  // Se app fechado: abre a URL com os parâmetros de deep-link.
  static notificationclick(e) {
    e.notification.close();

    const data      = e.notification.data ?? {};
    const targetUrl = data.url ?? '/cliente/';

    e.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          // Procura aba do cliente já aberta
          const existing = clientList.find(c => c.url.includes('/cliente/'));
          if (existing) {
            // App aberto: envia evento de navegação e foca a aba
            existing.postMessage({
              type:         'PUSH_NAVIGATE',
              barbershopId: data.barbershopId ?? null,
              entradaId:    data.entradaId    ?? null,
            });
            return existing.focus();
          }
          // App fechado: abre nova janela na página correta
          return self.clients.openWindow(targetUrl);
        }),
    );
  }

  // ── Sync: processa fila de requests offline ───────────────────────────────
  static async #processarSyncQueue() {
    let db;
    try   { db = await SWCliente.#abrirSyncDB(); }
    catch { return; } // IDB indisponível — noop

    const entries = await SWCliente.#dequeueAll(db, 'bf-sync-queue');
    await Promise.allSettled(entries.map(async entry => {
      try {
        const res = await fetch(entry.url, {
          method:  entry.method,
          headers: entry.headers,
          body:    (entry.method !== 'GET' && entry.method !== 'HEAD') ? entry.body : undefined,
        });
        // Sucesso ou erro definitivo (4xx) → remove da fila; 5xx mantém para retry
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          await SWCliente.#concluirEntry(db, entry.id);
        }
      } catch { /* falha de rede — mantém na fila para próximo sync */ }
    }));
  }

  // ── Periodic: re-fetch silencioso de todos os assets estáticos ───────────
  static async #refreshAssets() {
    const cache = await caches.open(SWCliente.#CACHE_STATIC);
    await Promise.allSettled(
      SWCliente.#ASSETS_STATIC.map(url =>
        fetch(url, { cache: 'no-cache' })
          .then(res => { if (res && res.status === 200) cache.put(url, res); })
          .catch(() => {}),
      ),
    );
  }

  // ── Cleanup: purga imagens com mais de 7 dias do CACHE_IMAGES ────────────
  static async #limparCacheImagens() {
    const cache     = await caches.open(SWCliente.#CACHE_IMAGES);
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

  // ── Helpers IDB (inline — SW não tem acesso à classe OfflineSyncQueue) ────
  static #abrirSyncDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('barberflow-sync', 1);
      req.onsuccess      = e => resolve(e.target.result);
      req.onerror        = e => reject(e.target.error);
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

  // ── Registra todos os listeners ───────────────────────────────────────────
  static init() {
    self.addEventListener('install',           e => SWCliente.install(e));
    self.addEventListener('activate',          e => SWCliente.activate(e));
    self.addEventListener('fetch',             e => SWCliente.fetch(e));
    self.addEventListener('sync',              e => SWCliente.sync(e));
    self.addEventListener('periodicsync',      e => SWCliente.periodicsync(e));
    self.addEventListener('push',              e => SWCliente.push(e));
    self.addEventListener('notificationclick', e => SWCliente.notificationclick(e));
    // Suporte a SKIP_WAITING via postMessage (usado pelo AppBootstrap no updatefound)
    self.addEventListener('message', e => {
      if (e.data?.type === 'SKIP_WAITING') e.waitUntil(self.skipWaiting());
    });
  }
}

/* ── Ponto de entrada ─────────────────────────────────────── */
SWCliente.init();
