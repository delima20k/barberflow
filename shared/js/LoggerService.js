'use strict';

// =============================================================
// LoggerService.js — Sistema de log centralizado
//
// Responsabilidade ÚNICA: emitir mensagens de log com controle
// de nível e suporte a transports externos plugáveis.
//
// Níveis (crescente de severidade):
//   info  — diagnóstico/fluxo — suprimido em produção por padrão
//   warn  — situação anômala mas recuperável
//   error — falha que requer atenção
//
// Em produção (não-localhost) o nível mínimo padrão é 'warn',
// eliminando ruído de info do console do usuário final.
//
// Transports externos (ex: envio para servidor de logs):
//   LoggerService.adicionarTransport((level, ...args) => { ... });
//   O transport recebe o nível e os mesmos args passados ao método.
//   Erros internos ao transport são silenciados — nunca derrubam o app.
//
// Integração com Router:
//   O Router resolve o logger via services.logger (injetável em testes)
//   com fallback para este singleton global — sem acoplamento hard.
//
// API pública:
//   LoggerService.info(...)
//   LoggerService.warn(...)
//   LoggerService.error(...)
//   LoggerService.configurar('warn')        — muda nível mínimo em runtime
//   LoggerService.adicionarTransport(fn)    — plugar servidor/APM
// =============================================================

class LoggerService {

  // Prioridade de cada nível — usada para filtrar por #minLevel
  static #LEVELS = Object.freeze({ info: 0, warn: 1, error: 2 });

  // Nível mínimo padrão: 'info' em localhost, 'warn' em produção
  static #minLevel = (
    typeof location !== 'undefined' &&
    ['localhost', '127.0.0.1', '::1'].includes(location.hostname)
  ) ? 0 : 1;  // 0 = info | 1 = warn | 2 = error

  // Transports externos registrados via adicionarTransport()
  static #transports = [];

  // ═══════════════════════════════════════════════════════════
  // CONFIGURAÇÃO
  // ═══════════════════════════════════════════════════════════

  /**
   * Altera o nível mínimo de log em runtime.
   * Útil para ativar logs verbose em diagnóstico de produção.
   * @param {'info'|'warn'|'error'} nivel
   */
  static configurar(nivel) {
    const n = LoggerService.#LEVELS[nivel];
    if (n !== undefined) LoggerService.#minLevel = n;
  }

  /**
   * Registra um transport externo.
   * Chamado após o output nativo do console para cada mensagem emitida.
   * @param {function(string, ...any): void} fn — recebe (level, ...args)
   */
  static adicionarTransport(fn) {
    if (typeof fn === 'function') LoggerService.#transports.push(fn);
  }

  // ═══════════════════════════════════════════════════════════
  // API DE LOG
  // ═══════════════════════════════════════════════════════════

  /** Informativo — suprimido em produção por padrão. */
  static info(...args)  { LoggerService.#emit('info',  args); }

  /** Aviso — situação anômala mas recuperável. */
  static warn(...args)  { LoggerService.#emit('warn',  args); }

  /** Erro — falha que requer atenção. */
  static error(...args) { LoggerService.#emit('error', args); }

  // ═══════════════════════════════════════════════════════════
  // EMISSÃO INTERNA
  // ═══════════════════════════════════════════════════════════

  /**
   * Filtra pelo nível mínimo, escreve no console nativo e notifica transports.
   * @param {'info'|'warn'|'error'} level
   * @param {any[]} args
   * @private
   */
  static #emit(level, args) {
    if (LoggerService.#LEVELS[level] < LoggerService.#minLevel) return;

    // Saída nativa — mantém stack trace e formatação do DevTools intactos
    console[level](...args);

    // Notifica transports externos — erros internos são isolados
    for (const fn of LoggerService.#transports) {
      try { fn(level, ...args); } catch (_) { /* transport nunca derruba o app */ }
    }
  }
}
