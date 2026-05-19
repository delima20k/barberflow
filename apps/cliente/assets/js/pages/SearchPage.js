'use strict';

// =============================================================
// SearchPage.js — Página de Pesquisa do app cliente.
// Responsabilidade: inicializar o SearchWidget passando os IDs
// corretos dos elementos de input e resultados.
// A lógica de busca e debounce fica no SearchWidget — não aqui.
//
// Dependências: SearchWidget.js (shared)
// =============================================================

// Gerencia a tela de pesquisa: inicializa o widget de busca com os IDs corretos.
class SearchPage {

  constructor() {}

  /**
   * Inicializa o SearchWidget com input e container da tela de pesquisa.
   * Chame uma vez após instanciar (DOM já está disponível).
   */
  bind() {
    if (typeof SearchWidget === 'undefined') return;
    SearchWidget.init('pesquisa-input', 'pesquisa-resultados');
  }
}
