'use strict';

const CACHE_NAME = 'barberflow-profissional-v11';

// HTML nunca entra na lista — sempre servido da rede
const ASSETS = [
  '/manifest.json',
  '/assets/css/styles.css',
  '/assets/js/app.js',
  '/shared/css/tokens.css',
  '/shared/css/components.css',
  '/shared/js/Router.js',
  '/shared/js/BarberPole.js',
  '/shared/js/PaymentFlowHandler.js',
  '/shared/img/Logo01.png',
  '/shared/img/icone-do-App.png',
  '/shared/img/inicio.svg',
  '/shared/img/mensagen.svg',
  '/shared/img/meu-b.svg',
  '/shared/img/perfil.svg',
  '/shared/img/sair.svg',
  '/shared/img/icones-perfil.png',
  '/shared/img/icones-cadeira-salao.png',
  '/shared/img/icones-cadeira-salao-vazia.png',
  '/shared/img/login.svg',
];

// Instala e pré-cacheia assets (falhas individuais não bloqueiam o install)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// Remove caches antigos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    // .catch evita "Could not establish connection" quando o Chrome
    // tenta reclamar clientes que já fecharam/navegaram
    ).then(() => self.clients.claim().catch(() => {}))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Só intercepta GET do mesmo origin
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navegações HTML — NUNCA cachear, sempre rede
  // Garante que o HTML mais recente (com boot-lock) seja sempre servido
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(async () => {
        const cached = await caches.match(e.request);
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // Assets estáticos — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(async () => {
          const fallback = await caches.match(e.request);
          return fallback || new Response('', { status: 504, statusText: 'Gateway Timeout' });
        });
    })
  );
});
