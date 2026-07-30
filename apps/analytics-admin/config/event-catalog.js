'use strict';

class AnalyticsEventCatalog {
  static #ESSENTIAL = Object.freeze([
    'landing_view',
    'cta_click',
    'voucher_modal_opened',
    'email_input_started',
    'email_submitted',
    'voucher_generated',
    'scroll_25',
    'scroll_50',
    'scroll_75',
    'scroll_100',
    'session_started',
    'session_ended',
  ]);

  static #FUTURE = Object.freeze([
    'account_created',
    'email_confirmed',
    'first_login',
  ]);

  static #LABELS = Object.freeze({
    landing_view: 'Visitante entrou na landing',
    cta_click: 'Visitante clicou em Testar grátis',
    voucher_modal_opened: 'Modal do voucher aberto',
    email_input_started: 'Preenchimento do email iniciado',
    email_submitted: 'Email enviado',
    voucher_generated: 'Voucher gerado',
    scroll_25: 'Visitante chegou a 25%',
    scroll_50: 'Visitante chegou a 50%',
    scroll_75: 'Visitante chegou a 75%',
    scroll_100: 'Visitante chegou ao final',
    session_started: 'Sessão iniciada',
    session_ended: 'Sessão encerrada',
    account_created: 'Conta criada',
    email_confirmed: 'Email confirmado',
    first_login: 'Primeiro login realizado',
  });

  static essential() {
    return [...AnalyticsEventCatalog.#ESSENTIAL];
  }

  static future() {
    return [...AnalyticsEventCatalog.#FUTURE];
  }

  static all() {
    return [...AnalyticsEventCatalog.#ESSENTIAL, ...AnalyticsEventCatalog.#FUTURE];
  }

  static has(eventName) {
    return AnalyticsEventCatalog.all().includes(eventName);
  }

  static isFuture(eventName) {
    return AnalyticsEventCatalog.#FUTURE.includes(eventName);
  }

  static label(eventName) {
    return AnalyticsEventCatalog.#LABELS[eventName] ?? eventName;
  }
}

globalThis.AnalyticsEventCatalog = AnalyticsEventCatalog;
