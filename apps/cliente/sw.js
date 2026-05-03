'use strict';

// =============================================================
// SWCliente — Service Worker do App Cliente (POO)
// =============================================================
class SWCliente {

  static #CACHE_NAME = 'barberflow-cliente-v143';

  // Paths relativos ao deploy no Vercel (/cliente/) e assets shared (/shared/)
  // Falhas individuais não bloqueiam a instalação (Promise.allSettled)
  static #ASSETS = [
    '/cliente/manifest.json',
    '/cliente/assets/css/styles.css',
    '/cliente/assets/js/app.js',
    '/cliente/assets/js/ClienteStartupSplash.js',
    '/shared/css/tokens.css',
    '/shared/css/components.css',
    '/shared/js/LoggerService.js',
    '/shared/js/LgpdService.js',
    '/shared/js/NavigationViewService.js',
    '/shared/js/Router.js',
    '/shared/js/BarberPole.js',
    '/shared/js/SplashService.js',
    '/shared/js/QueueRepository.js',
    '/shared/js/CorteModal.js',
    '/shared/js/BarbeiroCard.js',
    '/shared/js/Cadeira.js',
    '/shared/js/FilaController.js',
    '/shared/js/ModalController.js',
    '/shared/js/ClienteController.js',
    '/shared/js/PWAInstallBanner.js',
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

  // ── Instala e pré-cacheia assets (falhas individuais não bloqueiam) ──
  static install(e) {
    e.waitUntil(
      caches.open(SWCliente.#CACHE_NAME).then(cache =>
        Promise.allSettled(SWCliente.#ASSETS.map(url => cache.add(url)))
      ).then(() => self.skipWaiting())
    );
  }

  // ── Remove caches antigos e assume controle imediato ──────
  static activate(e) {
    e.waitUntil(
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => k !== SWCliente.#CACHE_NAME)
            .map(k => caches.delete(k))
        )
      ).then(() => self.clients.claim())
    );
  }

  // ── Network-first para HTML — cache-first para assets ─────
  static fetch(e) {
    const url = new URL(e.request.url);

    // Só intercepta GET do mesmo origin
    if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

    // Navegações HTML — sempre busca na rede, fallback no cache offline
    if (e.request.mode === 'navigate') {
      e.respondWith(
        fetch(e.request)
          .then(response => {
            const clone = response.clone();
            caches.open(SWCliente.#CACHE_NAME).then(cache => cache.put(e.request, clone));
            return response;
          })
          .catch(async () => {
            const cached = await caches.match(e.request);
            return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
          })
      );
      return;
    }

    // Assets estáticos — cache-first, atualiza em background
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request)
          .then(response => {
            if (!response || response.status !== 200 || response.type === 'opaque') {
              return response;
            }
            const clone = response.clone();
            caches.open(SWCliente.#CACHE_NAME).then(cache => cache.put(e.request, clone));
            return response;
          })
          .catch(async () => {
            const fallback = await caches.match(e.request);
            return fallback || new Response('', { status: 504, statusText: 'Gateway Timeout' });
          });
      })
    );
  }

  // ── Registra todos os listeners ───────────────────────────
  static init() {
    self.addEventListener('install',  e => SWCliente.install(e));
    self.addEventListener('activate', e => SWCliente.activate(e));
    self.addEventListener('fetch',    e => SWCliente.fetch(e));
  }
}

/* ── Ponto de entrada ─────────────────────────────────────── */
SWCliente.init();
