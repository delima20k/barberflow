'use strict';

// =============================================================
// Cadeira.js — Componente visual de uma cadeira de barbearia.
//
// Responsabilidade ÚNICA: renderizar o estado visual de uma
// cadeira (livre / ocupada / em_producao) e delegar eventos
// ao controller via callback.
//
// SRP: sem lógica de negócio, sem conhecimento de roles.
// Quem chama é responsável por passar podeInteragir e onClick.
//
// Estados:
//   livre       — cadeira vazia, disponível para clique
//   ocupada     — alguém aguardando nessa posição (fila)
//   em_producao — atendimento em andamento (produção)
//
// Dependências: SupabaseService.js (resolveAvatarUrl)
// =============================================================

class Cadeira {

  // Mapa tipo+entrada → estado semântico
  static #ESTADOS = Object.freeze({
    producao_ocupada: 'em_producao',
    producao_livre:   'livre',
    fila_ocupada:     'ocupada',
    fila_livre:       'livre',
  });

  /**
   * Cria o elemento DOM da cadeira.
   * @param {object}           opts
   * @param {'producao'|'fila'} opts.tipo
   * @param {object|null}      opts.entrada    queue_entry com { client, status }
   * @param {number}           [opts.posicao]  número da posição na fila
   * @param {boolean}          [opts.podeInteragir=false]
   * @param {Function|null}    [opts.onClick]  callback de interação (somente se vazia)
   * @returns {HTMLDivElement}
   */
  static criar({ tipo, entrada = null, posicao = 1, podeInteragir = false, onClick = null }) {
    const ocupada = !!entrada;
    const estado  = Cadeira.#ESTADOS[`${tipo}_${ocupada ? 'ocupada' : 'livre'}`] ?? 'livre';

    const el = document.createElement('div');
    el.className = `cdr-cadeira cdr-cadeira--${tipo} cdr-cadeira--${estado}`;

    // Interatividade: somente cadeiras LIVRES e com permissão
    if (!ocupada && podeInteragir && onClick) {
      el.classList.add('cdr-cadeira--interativa');
      el.addEventListener('click', () => onClick());
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', tipo === 'producao' ? 'Entrar para atendimento' : `Entrar na posição ${posicao}`);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      });
    }

    el.appendChild(Cadeira.#criarIconWrap(tipo, entrada));
    el.appendChild(Cadeira.#criarLabel(tipo, entrada, posicao, estado));

    if (entrada?.client?.full_name) {
      const nome       = document.createElement('span');
      nome.className   = 'cdr-cliente';
      nome.textContent = entrada.client.full_name;
      el.appendChild(nome);
    }

    return el;
  }

  // ── Privados ────────────────────────────────────────────────

  /**
   * Ícone da cadeira: avatar do cliente ou imagem padrão.
   */
  static #criarIconWrap(tipo, entrada) {
    const wrap = document.createElement('div');
    wrap.className = 'cdr-icon';

    const avatarPath = entrada?.client?.avatar_path;
    const url = avatarPath && (typeof SupabaseService !== 'undefined')
      ? SupabaseService.resolveAvatarUrl(avatarPath, entrada.client.updated_at ?? null)
      : null;

    if (url) {
      const img   = document.createElement('img');
      img.alt     = entrada.client.full_name ?? '';
      img.loading = 'lazy';
      img.src     = url;
      img.onerror = () => { img.remove(); wrap.appendChild(Cadeira.#imagemPadrao(tipo)); };
      wrap.appendChild(img);
    } else {
      wrap.appendChild(Cadeira.#imagemPadrao(tipo));
    }

    return wrap;
  }

  /**
   * Imagem estática da cadeira conforme tipo.
   */
  static #imagemPadrao(tipo) {
    const img   = document.createElement('img');
    img.alt     = tipo === 'producao' ? 'Cadeira em produção' : 'Cadeira de espera';
    img.loading = 'lazy';
    img.src     = tipo === 'producao'
      ? '/shared/img/icones-cadeira-producao.png'
      : '/shared/img/icones-cadeira-de-éspera.png';
    return img;
  }

  /**
   * Label de estado da cadeira.
   */
  static #criarLabel(tipo, entrada, posicao, estado) {
    const label = document.createElement('span');
    label.className = 'cdr-label';

    if (tipo === 'producao') {
      label.textContent = estado === 'em_producao' ? 'Atendendo' : 'Livre';
    } else {
      label.textContent = entrada ? `#${posicao}` : '—';
    }

    return label;
  }
}
