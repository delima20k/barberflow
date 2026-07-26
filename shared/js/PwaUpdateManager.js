'use strict';

// Coordena atualizacoes do PWA sem apagar sessao, IndexedDB ou preferencias.
class PwaUpdateManager {
  static #inicializado = false;
  static #registration = null;
  static #workersObservados = new WeakSet();
  static #nomeApp = 'BarberFlow';
  static #RELOAD_GUARD_KEY = 'bf_pwa_update_reloaded';
  static #RELOAD_GUARD_TTL_MS = 5000;

  static registrar({ scriptUrl = './sw.js', scope = './', nomeApp = 'BarberFlow' } = {}) {
    if (PwaUpdateManager.#inicializado || !('serviceWorker' in navigator)) return;
    PwaUpdateManager.#inicializado = true;
    PwaUpdateManager.#nomeApp = nomeApp;
    PwaUpdateManager.#ligarEventos();

    if (document.readyState === 'complete') {
      PwaUpdateManager.#registrarAgora(scriptUrl, scope);
      return;
    }

    window.addEventListener('load', () => {
      PwaUpdateManager.#registrarAgora(scriptUrl, scope);
    }, { once: true });
  }

  static async verificarAtualizacao() {
    if (!PwaUpdateManager.#registration) return;
    try {
      await PwaUpdateManager.#registration.update();
    } catch (error) {
      PwaUpdateManager.#warn('Falha ao verificar atualizacao', error);
    }
  }

  static #ligarEventos() {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (sessionStorage.getItem(PwaUpdateManager.#RELOAD_GUARD_KEY) === '1') return;
      sessionStorage.setItem(PwaUpdateManager.#RELOAD_GUARD_KEY, '1');
      location.reload();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        PwaUpdateManager.verificarAtualizacao();
      }
    });
  }

  static async #registrarAgora(scriptUrl, scope) {
    PwaUpdateManager.#agendarLimpezaDoGuard();
    try {
      const registration = await navigator.serviceWorker.register(scriptUrl, {
        scope,
        updateViaCache: 'none',
      });
      PwaUpdateManager.#registration = registration;
      PwaUpdateManager.#observarInstalacao(registration);

      if (registration.waiting) PwaUpdateManager.#ativar(registration.waiting);

      await PwaUpdateManager.verificarAtualizacao();
      PwaUpdateManager.#registrarSincronizacaoPeriodica(registration);
      PwaUpdateManager.#info(`SW registrado em ${registration.scope ?? scope}`);
    } catch (error) {
      PwaUpdateManager.#warn('Falha ao registrar o SW', error);
    }
  }

  static #observarInstalacao(registration) {
    PwaUpdateManager.#observarWorker(registration.installing);
    registration.addEventListener('updatefound', () => {
      PwaUpdateManager.#observarWorker(registration.installing);
    });
  }

  static #observarWorker(worker) {
    if (!worker || PwaUpdateManager.#workersObservados.has(worker)) return;
    PwaUpdateManager.#workersObservados.add(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        PwaUpdateManager.#ativar(worker);
      }
    });
  }

  static #ativar(worker) {
    worker?.postMessage?.({ type: 'SKIP_WAITING' });
  }

  static #registrarSincronizacaoPeriodica(registration) {
    if (!registration.periodicSync?.register) return;
    registration.periodicSync.register('bf-periodic-cache-refresh', {
      minInterval: 24 * 60 * 60 * 1000,
    }).catch(() => {});
  }

  static #agendarLimpezaDoGuard() {
    setTimeout(() => {
      sessionStorage.removeItem(PwaUpdateManager.#RELOAD_GUARD_KEY);
    }, PwaUpdateManager.#RELOAD_GUARD_TTL_MS);
  }

  static #info(message) {
    if (typeof LoggerService !== 'undefined') {
      LoggerService.info(`[${PwaUpdateManager.#nomeApp}] ${message}`);
    }
  }

  static #warn(message, error) {
    if (typeof LoggerService !== 'undefined') {
      LoggerService.warn(`[${PwaUpdateManager.#nomeApp}] ${message}`, error?.message ?? error);
    }
  }
}
