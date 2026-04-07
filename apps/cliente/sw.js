'use strict';

const CACHE_NAME = 'barberflow-cliente-v1';

const ASSETS = [
  '/apps/cliente/',
  '/apps/cliente/manifest.json',
  '/apps/cliente/assets/css/styles.css',
  '/apps/cliente/assets/js/app.js',
  '/shared/css/tokens.css',
  '/shared/css/components.css',
  '/shared/js/Router.js',
  '/shared/img/logoApp.png',
  '/shared/img/nome-app.svg',
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

// Instala e pré-cacheia assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
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
    ).then(() => self.clients.claim())
  );
});

// Cache-first para assets estáticos, network-first para o resto
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Só intercepta GET do mesmo origin
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      });
    })
  );
});
