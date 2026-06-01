'use strict';

// =============================================================
// ChatSearchWidget.js — Camada: interfaces
//
// Campo de busca de usuários para iniciar novas conversas.
// Injeta input + dropdown de resultados em #msgs-search-wrap.
// Debounce de 300ms, AbortController para cancelar busca anterior.
//
// Regras de visibilidade:
//   - cliente:      vê profissionais
//   - profissional: vê clientes e profissionais
//
// Dependências: ConversationListService.js, ConversationRepository.js,
//               ChatModal.js, InputValidator.js, ApiService.js
// =============================================================

class ChatSearchWidget {

  static #role      = 'cliente';
  static #input     = null;
  static #dropdown  = null;
  static #timer     = null;
  static #ctrl      = null;   // AbortController da última busca

  /**
   * Inicializa o widget de busca no container #msgs-search-wrap.
   * @param {string} role — 'cliente' | 'profissional'
   */
  static init(role = 'cliente') {
    ChatSearchWidget.#role = role;

    const wrap = document.getElementById('msgs-search-wrap');
    if (!wrap || wrap.dataset.chatSearchInit === '1') return;
    wrap.dataset.chatSearchInit = '1';

    // ── Input ────────────────────────────────────────────────
    const input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'msgs-search-input';
    input.placeholder = 'Buscar barbeiro, barbearia ou cliente…';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Buscar conversa');
    input.setAttribute('aria-autocomplete', 'list');

    // ── Dropdown ─────────────────────────────────────────────
    const dropdown = document.createElement('div');
    dropdown.className = 'msgs-search-results';
    dropdown.style.display = 'none';
    dropdown.setAttribute('role', 'listbox');

    wrap.appendChild(input);
    wrap.appendChild(dropdown);

    ChatSearchWidget.#input    = input;
    ChatSearchWidget.#dropdown = dropdown;

    input.addEventListener('input', () => ChatSearchWidget.#onInput());
    input.addEventListener('blur', () => {
      // Delay para permitir click no dropdown antes de fechar
      setTimeout(() => ChatSearchWidget.#limpar(), 200);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') ChatSearchWidget.#limpar();
    });
  }

  // ── Privados ──────────────────────────────────────────────

  static #onInput() {
    const termo = ChatSearchWidget.#input?.value?.trim() ?? '';

    clearTimeout(ChatSearchWidget.#timer);
    ChatSearchWidget.#ctrl?.abort();

    if (!termo) {
      ChatSearchWidget.#ocultarDropdown();
      return;
    }

    ChatSearchWidget.#timer = setTimeout(() => ChatSearchWidget.#buscar(termo), 300);
  }

  static async #buscar(termo) {
    ChatSearchWidget.#ctrl = new AbortController();

    const { data: usuarios, error } = await ConversationListService.buscar(
      termo,
      ChatSearchWidget.#role,
      ChatSearchWidget.#ctrl.signal
    );

    if (error || !usuarios) {
      ChatSearchWidget.#ocultarDropdown();
      return;
    }

    ChatSearchWidget.#renderResultados(usuarios);
  }

  static #renderResultados(usuarios) {
    const dropdown = ChatSearchWidget.#dropdown;
    if (!dropdown) return;

    dropdown.innerHTML = '';

    if (!usuarios.length) {
      dropdown.style.display = 'none';
      return;
    }

    for (const usuario of usuarios) {
      const item = document.createElement('div');
      item.className = 'msgs-search-item';
      item.setAttribute('role', 'option');

      // Avatar
      const av = document.createElement('div');
      av.className = 'chat-modal-avatar';
      av.style.cssText = 'width:36px;height:36px;flex-shrink:0;font-size:.85rem;';
      if (usuario.avatar_path) {
        const img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
        img.alt     = usuario.full_name ?? '';
        img.onerror = () => { img.remove(); av.textContent = ChatModal.iniciais(usuario.full_name ?? ''); };
        img.src     = ApiService.getAvatarUrl(usuario.avatar_path);
        av.appendChild(img);
      } else {
        av.textContent = ChatModal.iniciais(usuario.full_name ?? '');
      }

      // Texto
      const txtWrap = document.createElement('div');
      const nome = document.createElement('div');
      nome.className = 'msgs-search-item-nome';
      nome.textContent = usuario.full_name ?? 'Usuário'; // textContent — sem XSS

      const sub = document.createElement('div');
      sub.className = 'msgs-search-item-sub';
      sub.textContent = ChatSearchWidget.#labelRole(usuario.role); // textContent — sem XSS

      txtWrap.appendChild(nome);
      txtWrap.appendChild(sub);

      item.appendChild(av);
      item.appendChild(txtWrap);

      item.addEventListener('click', () => {
        ChatSearchWidget.#limpar();
        ChatSearchWidget.#iniciarConversa(usuario);
      });

      dropdown.appendChild(item);
    }

    dropdown.style.display = 'block';
  }

  static async #iniciarConversa(usuario) {
    const { data, error } = await ConversationRepository.buscarOuCriar(usuario.id);
    if (error || !data?.id) {
      LoggerService.warn('[ChatSearchWidget] buscarOuCriar falhou:', error?.message);
      return;
    }

    const avatarUrl = usuario.avatar_path ? ApiService.getAvatarUrl(usuario.avatar_path) : null;

    await ChatModal.abrir({
      convId: data.id,
      peerId: usuario.id,
      nome:   usuario.full_name ?? 'Usuário',
      sub:    ChatSearchWidget.#labelRole(usuario.role),
      avatar: avatarUrl,
    });
  }

  static #ocultarDropdown() {
    if (ChatSearchWidget.#dropdown) ChatSearchWidget.#dropdown.style.display = 'none';
  }

  static #limpar() {
    ChatSearchWidget.#ocultarDropdown();
    if (ChatSearchWidget.#input) ChatSearchWidget.#input.value = '';
  }

  static #labelRole(role) {
    const mapa = { professional: '✂️ Profissional', client: '👤 Cliente' };
    return mapa[role] ?? '💬 Usuário';
  }
}
