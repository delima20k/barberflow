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
   * @param {object}                          opts
   * @param {'producao'|'fila'}               opts.tipo
   * @param {object|null}                     opts.entrada       queue_entry com { client, status }
   * @param {number}                          [opts.posicao]     número da posição na fila
   * @param {boolean}                         [opts.podeInteragir=false]
   * @param {Function|null}                   [opts.onClick]     callback de interação (somente se vazia)
   * @param {'yes'|'no_waiting'|'absent'|null} [opts.confirmacao] estado de confirmação de presença
   * @returns {HTMLDivElement}
   */
  static criar({ tipo, entrada = null, posicao = 1, podeInteragir = false, onClick = null, confirmacao = null }) {
    const ocupada = !!entrada;
    const estado  = Cadeira.#ESTADOS[`${tipo}_${ocupada ? 'ocupada' : 'livre'}`] ?? 'livre';

    const el = document.createElement('div');
    el.className = `cdr-cadeira cdr-cadeira--${tipo} cdr-cadeira--${estado}`;

    // Bordas de confirmação de presença (apenas cadeira de produção ocupada)
    if (tipo === 'producao' && ocupada && confirmacao === 'yes') {
      el.classList.add('cdr-cadeira--confirmada');
    } else if (tipo === 'producao' && ocupada && confirmacao === 'absent') {
      el.classList.add('cdr-cadeira--ausente');
    }

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

    el.appendChild(Cadeira.#criarIconWrap(tipo, entrada, confirmacao));
    if (ocupada) el.appendChild(Cadeira.#criarAvatarCli(entrada));
    el.appendChild(Cadeira.#criarLabel(tipo, entrada, posicao, estado, confirmacao));

    const nomeExibido = entrada?.guest_name ?? entrada?.client?.full_name;
    if (nomeExibido && !(tipo === 'producao' && confirmacao === 'yes')) {
      const nome       = document.createElement('span');
      nome.className   = 'cdr-cliente';
      nome.textContent = nomeExibido;
      el.appendChild(nome);
    }

    return el;
  }

  // ── Privados ────────────────────────────────────────────────

  /**
   * Ícone da cadeira: sempre exibe a imagem padrão da cadeira.
   * O avatar do cliente flutua acima via #criarAvatarCli (position:absolute).
   */
  static #criarIconWrap(tipo, entrada, confirmacao = null) {
    const wrap = document.createElement('div');
    wrap.className = 'cdr-icon';
    if (tipo === 'producao' && !!entrada && confirmacao === 'yes') {
      wrap.classList.add('cdr-icon--confirmada');
    }
    wrap.appendChild(Cadeira.#imagemPadrao(tipo));
    return wrap;
  }

  /**
   * Avatar flutuante do cliente (position:absolute relativo ao .cdr-cadeira).
   * Exibido acima da imagem da cadeira quando ocupada.
   */
  static #criarAvatarCli(entrada) {
    const wrap = document.createElement('div');
    wrap.className = 'cdr-avatar-cli';

    const isWalkIn = entrada?.guest_name && !entrada?.client?.id;
    if (isWalkIn) {
      const img   = document.createElement('img');
      img.alt     = entrada.guest_name ?? 'Cliente';
      img.loading = 'lazy';
      img.src     = '/shared/img/icon-192.png';
      wrap.appendChild(img);
      return wrap;
    }

    const avatarPath = entrada?.client?.avatar_path;
    const url = avatarPath && (typeof SupabaseService !== 'undefined')
      ? SupabaseService.resolveAvatarUrl(avatarPath, entrada.client.updated_at ?? null)
      : null;

    if (url) {
      const img     = document.createElement('img');
      img.alt       = entrada.client.full_name ?? '';
      img.loading   = 'lazy';
      img.src       = url;
      const inicial = (entrada.client.full_name ?? '?').charAt(0).toUpperCase();
      img.onerror   = () => { img.remove(); wrap.textContent = inicial; };
      wrap.appendChild(img);
    } else {
      const nome = entrada?.guest_name ?? entrada?.client?.full_name ?? '?';
      wrap.textContent = nome.charAt(0).toUpperCase();
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
   * Ícone do app BarberFlow — usado para clientes walk-in anônimos.
   */
  static #imagemAppIcon() {
    const img   = document.createElement('img');
    img.alt     = 'BarberFlow';
    img.loading = 'lazy';
    img.src     = '/shared/img/icon-192.png';
    return img;
  }

  /**
   * Label de estado da cadeira.
   */
  static #criarLabel(tipo, entrada, posicao, estado, confirmacao = null) {
    const label = document.createElement('span');
    label.className = 'cdr-label';

    if (tipo === 'producao') {
      if (estado === 'em_producao' && confirmacao === 'yes') {
        const primeiroNome = (entrada?.guest_name ?? entrada?.client?.full_name ?? '').split(' ')[0];
        label.textContent = `${primeiroNome} está cortando o cabelo`;
      } else {
        label.textContent = estado === 'em_producao' ? 'Atendendo' : 'Livre';
      }
    } else {
      label.textContent = entrada ? `#${posicao}` : '—';
    }

    return label;
  }
}
