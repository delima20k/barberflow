'use strict';

const CACHE_NAME = 'barberflow-profissional-v3';

const ASSETS = [
  '/profissional/',
  '/profissional/manifest.json',
  '/profissional/assets/css/styles.css',
  '/profissional/assets/js/app.js',
  '/shared/css/tokens.css',
  '/shared/css/components.css',
  '/shared/js/Router.js',
  '/shared/js/BarberPole.js',
  '/shared/img/logoApp.png',
  '/shared/img/nome-app.svg',
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

// Network-first para documentos HTML (sempre página fresca do servidor)
// Cache-first para assets estáticos (performance)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Só intercepta GET do mesmo origin
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navegações HTML — sempre busca na rede para garantir HTML atualizado
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Atualiza o cache com a versão mais nova
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request)) // fallback offline
    );
    return;
  }

  // Assets estáticos — cache-first
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
