'use strict';

// Coordena atualizacoes do PWA sem apagar sessao, IndexedDB ou preferencias.
class PwaUpdateManager {
  static #inicializado = false;
  static #registration = null;
  static #workersObservados = new WeakSet();
  static #nomeApp = 'BarberFlow';
  static #RELOAD_GUARD_KEY = 'bf_pwa_update_reloaded';
  static #RELOAD_GUARD_TTL_MS = 5000;
  // Sessao longa em foreground (comum no Android, app aberto o dia todo no
  // balcao) nunca dispara visibilitychange — sem isso, so pegaria a
  // atualizacao ao fechar/reabrir o app. Intervalo cobre esse caso.
  static #INTERVALO_VERIFICACAO_MS = 15 * 60 * 1000;

  // ── Janela de boot (splash) ────────────────────────────────────────────
  // Trocar de Service Worker durante o boot dispara controllerchange →
  // location.reload(), o que reinicia a splash do zero (a animacao do texto e
  // CSS: recarregar o documento sempre a recomeca). Como o guard de reload
  // dura menos que um ciclo de splash, isso se repetia em serie.
  //
  // Enquanto o boot nao e liberado:
  //   - SKIP_WAITING nao e enviado (a troca de SW nem chega a acontecer);
  //   - se um controllerchange vier de fora (ex.: outra aba ativou o SW novo),
  //     o reload fica pendente em vez de acontecer na hora.
  // A splash chama liberarBoot() ao terminar; o timeout e rede de seguranca
  // para telas sem splash ou splash que falhe.
  static #bootLiberado = false;
  static #reloadPendente = false;
  static #workerPendente = null;
  static #BOOT_TIMEOUT_MS = 12000;

  // O SW faz clients.claim() no activate. Na PRIMEIRA instalacao a pagina
  // ainda nao tem controller, entao esse claim dispara controllerchange — sem
  // que exista update algum. Recarregar ali e desnecessario (a pagina acabou
  // de baixar tudo da rede, ja esta na versao mais nova) e visivelmente
  // errado: reinicia a splash na primeira abertura e, se adiado, faz o app
  // recarregar ao voltar do segundo plano.
  // So e update de verdade quando JA existia um controller antes.
  static #tinhaControllerNoBoot = false;

  static registrar({ scriptUrl = './sw.js', scope = './', nomeApp = 'BarberFlow' } = {}) {
    if (PwaUpdateManager.#inicializado || !('serviceWorker' in navigator)) return;
    PwaUpdateManager.#inicializado = true;
    PwaUpdateManager.#nomeApp = nomeApp;
    // Fotografa o estado ANTES de registrar: sem controller aqui significa
    // primeira instalacao, e o controllerchange que vier do clients.claim()
    // nao e update — nao deve recarregar nada.
    PwaUpdateManager.#tinhaControllerNoBoot = Boolean(navigator.serviceWorker.controller);
    PwaUpdateManager.#ligarEventos();

    // Rede de seguranca: telas sem splash (ou splash que falhe) nunca chamariam
    // liberarBoot() e a atualizacao ficaria presa para sempre.
    setTimeout(() => PwaUpdateManager.liberarBoot(), PwaUpdateManager.#BOOT_TIMEOUT_MS);

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

  /**
   * Encerra a janela de boot: a partir daqui a troca de Service Worker pode
   * acontecer. Chamado pelas splashes ao terminar (e pelo timeout de
   * seguranca). Idempotente.
   *
   * A pendencia acumulada nao e aplicada de imediato — seria trocar o SW (ou
   * recarregar) com o usuario olhando a tela recem-aberta. Ela e aplicada
   * quando a aba sai de vista (#aplicarPendenteQuandoOculto), ou naturalmente
   * na proxima abertura do app.
   */
  static liberarBoot() {
    if (PwaUpdateManager.#bootLiberado) return;
    PwaUpdateManager.#bootLiberado = true;
    if (PwaUpdateManager.#reloadPendente || PwaUpdateManager.#workerPendente) {
      PwaUpdateManager.#aplicarPendenteQuandoOculto();
    }
  }

  static #ligarEventos() {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Primeira instalacao (clients.claim(), sem controller anterior): a
      // pagina ja esta na versao mais nova. Nada a recarregar, nem agora nem
      // depois — recarregar aqui reiniciaria a splash / traria a splash de
      // volta ao retomar o app do segundo plano.
      if (!PwaUpdateManager.#tinhaControllerNoBoot) return;

      // Durante o boot o reload reiniciaria a splash — adia para depois.
      if (!PwaUpdateManager.#bootLiberado) {
        PwaUpdateManager.#reloadPendente = true;
        return;
      }
      PwaUpdateManager.#recarregar();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        PwaUpdateManager.verificarAtualizacao();
      }
    });
  }

  /** Recarrega uma unica vez, respeitando o guard anti-loop. */
  static #recarregar() {
    if (sessionStorage.getItem(PwaUpdateManager.#RELOAD_GUARD_KEY) === '1') return;
    sessionStorage.setItem(PwaUpdateManager.#RELOAD_GUARD_KEY, '1');
    location.reload();
  }

  /**
   * Troca o Service Worker quando a aba sai de vista — sem recarregar.
   *
   * Recarregar aqui parece inofensivo (a aba esta oculta), mas nao e: ao
   * voltar para o app o usuario cai na splash em vez da tela onde estava,
   * como se o app tivesse sido fechado. Num PWA instalado isso quebra a
   * expectativa de "voltar de onde parei".
   *
   * Entao apenas ativamos o SW novo: ele passa a servir os assets novos e o
   * codigo novo entra na proxima abertura do app — o ciclo natural do PWA.
   * O reload pendente e descartado de proposito pelo mesmo motivo.
   */
  static #aplicarPendenteQuandoOculto() {
    const aplicar = () => {
      if (document.visibilityState !== 'hidden') return;
      document.removeEventListener('visibilitychange', aplicar);
      const worker = PwaUpdateManager.#workerPendente;
      PwaUpdateManager.#workerPendente = null;
      PwaUpdateManager.#reloadPendente = false;
      worker?.postMessage?.({ type: 'SKIP_WAITING' });
    };
    document.addEventListener('visibilitychange', aplicar);
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
      PwaUpdateManager.#iniciarVerificacaoPeriodica();
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
    if (!worker) return;
    // Durante o boot, segura a troca: ativar agora dispararia controllerchange
    // e reiniciaria a splash. Fica pendente para depois (ou proxima abertura).
    if (!PwaUpdateManager.#bootLiberado) {
      PwaUpdateManager.#workerPendente = worker;
      return;
    }
    worker.postMessage?.({ type: 'SKIP_WAITING' });
  }

  /** Verifica atualização a cada #INTERVALO_VERIFICACAO_MS enquanto a aba está visível. */
  static #iniciarVerificacaoPeriodica() {
    setInterval(() => {
      if (document.visibilityState === 'visible') PwaUpdateManager.verificarAtualizacao();
    }, PwaUpdateManager.#INTERVALO_VERIFICACAO_MS);
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
