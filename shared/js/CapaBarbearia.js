'use strict';

// =============================================================
// CapaBarbearia.js — Aplica a imagem de capa da barbearia como
//                    background-image em qualquer card do sistema.
//
// Responsabilidades:
//  • Aplicar cover_path como background-image em cards de listagem.
//  • Garantir legibilidade do conteúdo via overlay semitransparente.
//  • Centralizar a lógica de capa para ser reutilizável em todos os
//    widgets / páginas dos dois apps (cliente e profissional).
//
// Uso básico:
//   CapaBarbearia.aplicarCapa(cardElement, barbershop.cover_path);
//
// Dependências: SupabaseService.js
// =============================================================

class CapaBarbearia {

  // Classe CSS injetada no elemento que recebe a capa
  static #CLASSE = 'barber-card--com-capa';

  // ─────────────────────────────────────────────────────────
  // Aplica cover_path como background-image em `el`.
  // Se cover_path for vazio / null, não faz nada.
  //
  // @param {HTMLElement} el        — elemento que recebe a capa
  // @param {string|null} coverPath — caminho no Supabase Storage
  // ─────────────────────────────────────────────────────────
  static aplicarCapa(el, coverPath) {
    if (!el || !coverPath) return;

    const url = SupabaseService.getLogoUrl(coverPath);
    if (!url) return;

    el.style.backgroundImage = `url('${url}')`;
    el.classList.add(CapaBarbearia.#CLASSE);
  }

  // ─────────────────────────────────────────────────────────
  // Remove a capa e a classe de um elemento (útil para re-renders).
  //
  // @param {HTMLElement} el
  // ─────────────────────────────────────────────────────────
  static removerCapa(el) {
    if (!el) return;
    el.style.backgroundImage = '';
    el.classList.remove(CapaBarbearia.#CLASSE);
  }
}
