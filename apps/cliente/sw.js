'use strict';

// =============================================================
// SWCliente — Service Worker do App Cliente (POO)
// =============================================================
class SWCliente {

  static #CACHE_NAME = 'barberflow-cliente-v105';

  static #ASSETS = [
    '/manifest.json',
    '/assets/css/styles.css',
    '/assets/js/app.js',
    '/assets/js/Cliente.js',
    '/assets/js/ClienteRepository.js',
    '/assets/js/ClienteService.js',
    '/assets/js/ClienteController.js',
    '/shared/css/tokens.css',
    '/shared/css/components.css',
    '/shared/js/LoggerService.js',
    '/shared/js/ApiService.js',
    '/shared/js/LgpdService.js',
    '/shared/js/NavigationViewService.js',
    '/shared/js/Router.js',
    '/shared/js/BarberPole.js',
    '/shared/img/Logo01.png',
    '/shared/img/icone-do-App.png',
    '/shared/img/inicio.svg',
    '/shared/img/pesquisa.svg',
    '/shared/img/mensagen.svg',
    '/shared/img/meu-b.svg',
    '/shared/img/perfil.svg',
    '/shared/img/sair.svg',
    '/shared/img/icones-perfil.png',
    '/shared/img/icones-cadeira-salao.png',
    '/shared/img/icones-cadeira-salao-vazia.png',
  ];

  // ── Instala e pré-cacheia assets ──────────────────────────
  static install(e) {
    e.waitUntil(
      caches.open(SWCliente.#CACHE_NAME)
        .then(cache => cache.addAll(SWCliente.#ASSETS))
        .then(() => self.skipWaiting())
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
