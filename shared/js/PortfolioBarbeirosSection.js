'use strict';

// =============================================================
// PortfolioBarbeirosSection.js — Section de portfólio dos barbeiros
//
// Responsabilidades:
//   - Buscar todos os barbeiros de uma barbearia (dono primeiro)
//   - Buscar portfólios de todos em uma única query
//   - Intercalar fotos: dono primeiro → demais aleatório (máx. 30)
//   - Renderizar carrossel CSS scroll-snap com cards foto + avatar + nome
//   - Like 💎 com UI otimista persistido em portfolio_likes
//   - Botão ✉️ navega para MessagesPage com barbeiro pré-selecionado
//   - PortfolioBarbeirosViewer: viewer fullscreen com animação 3D de swipe
//
// Dependências: BarbershopRepository.js, ApiService.js, AuthService.js,
//               InputValidator.js, LoggerService.js
//
// Camada DDD: interfaces (shared — app cliente apenas)
// =============================================================

// ──────────────────────────────────────────────────────────────
// PortfolioBarbeirosViewer — viewer fullscreen 3D para imagens
// ──────────────────────────────────────────────────────────────
class PortfolioBarbeirosViewer {

  // ── Constantes de animação 3D (espelhadas do StoryViewer) ──
  static #ROT_MAX    = 14;
  static #SCALE_MIN  = 0.88;
  static #DARKEN_MAX = 0.44;
  static #DUR_SLIDE  = 300;
  static #DUR_SPRING = 380;
  static #EASE_SLIDE  = 'cubic-bezier(0.22,0.61,0.36,1)';
  static #EASE_SPRING = 'cubic-bezier(0.34,1.56,0.64,1)';
  static #THRESHOLD   = 60;

  // ── Estado ────────────────────────────────────────────────
  static #overlay     = null;
  static #fotoEl      = null;
  static #itens       = [];
  static #barbersMap  = {};
  static #curtidosSet = new Set();
  static #idx         = 0;
  static #animando    = false;
  static #dragging    = false;
  static #txStart     = 0;
  static #onLike      = null;
  static #onMessage   = null;
  static #onKey       = null;
  static #onMouseMove = null;
  static #onMouseUp   = null;

  /**
   * Abre o viewer fullscreen na foto de índice `index`.
   * @param {number}   index
   * @param {object[]} itens
   * @param {object}   barbersMap  — { [barberId]: barberObj }
   * @param {Set}      curtidosSet — set de imageIds curtidos pelo usuário
   * @param {Function} onLike      — (imageId, likeBtn, countEl) => void
   * @param {Function} onMessage   — (barberId) => void
   */
  static abrir(index, itens, barbersMap, curtidosSet, onLike, onMessage) {
    if (PortfolioBarbeirosViewer.#overlay) PortfolioBarbeirosViewer.fechar();

    PortfolioBarbeirosViewer.#itens       = itens;
    PortfolioBarbeirosViewer.#barbersMap  = barbersMap;
    PortfolioBarbeirosViewer.#curtidosSet = curtidosSet;
    PortfolioBarbeirosViewer.#idx         = index;
    PortfolioBarbeirosViewer.#onLike      = onLike;
    PortfolioBarbeirosViewer.#onMessage   = onMessage;
    PortfolioBarbeirosViewer.#animando    = false;
    PortfolioBarbeirosViewer.#dragging    = false;

    const overlay = PortfolioBarbeirosViewer.#criarDOM();
    document.body.appendChild(overlay);
    PortfolioBarbeirosViewer.#overlay = overlay;
    document.body.style.overflow = 'hidden';

    PortfolioBarbeirosViewer.#renderItem(index);
    PortfolioBarbeirosViewer.#resetTransform();
    PortfolioBarbeirosViewer.#bindEventos();
  }

  /** Fecha e limpa o viewer. */
  static fechar() {
    const o = PortfolioBarbeirosViewer.#overlay;
    if (!o) return;

    if (PortfolioBarbeirosViewer.#onKey) {
      document.removeEventListener('keydown', PortfolioBarbeirosViewer.#onKey);
      PortfolioBarbeirosViewer.#onKey = null;
    }
    if (PortfolioBarbeirosViewer.#onMouseMove) {
      window.removeEventListener('mousemove', PortfolioBarbeirosViewer.#onMouseMove);
      window.removeEventListener('mouseup',   PortfolioBarbeirosViewer.#onMouseUp);
      PortfolioBarbeirosViewer.#onMouseMove = null;
      PortfolioBarbeirosViewer.#onMouseUp   = null;
    }

    o.remove();
    PortfolioBarbeirosViewer.#overlay = null;
    document.body.style.overflow = '';
  }

  // ── DOM ───────────────────────────────────────────────────

  static #criarDOM() {
    const div = document.createElement('div');
    div.className = 'pbv-overlay';
    div.innerHTML = `
      <button class="pbv-close" aria-label="Fechar">✕</button>
      <div class="pbv-progress"></div>
      <div class="pbv-barber-info">
        <img class="pbv-avatar" src="" alt="" loading="lazy"
             onerror="this.style.display='none'">
        <span class="pbv-nome"></span>
      </div>
      <div class="pbv-inner">
        <img class="pbv-foto" src="" alt="" draggable="false"
             onerror="this.style.opacity='.25'">
      </div>
      <div class="pbv-actions">
        <button class="pbv-like-btn" data-image-id="">
          💎 <span class="pbv-like-count">0</span>
        </button>
        <button class="pbv-msg-btn" data-barber-id="">✉️ Mensagem</button>
      </div>
    `;
    return div;
  }

  /** Atualiza conteúdo do viewer para o item no índice `idx`. */
  static #renderItem(idx) {
    const o = PortfolioBarbeirosViewer.#overlay;
    if (!o) return;

    const item   = PortfolioBarbeirosViewer.#itens[idx];
    if (!item) return;

    const barber = PortfolioBarbeirosViewer.#barbersMap[item.owner_id] ?? {};
    const s      = InputValidator.sanitizar;

    // Foto
    const fotoEl   = o.querySelector('.pbv-foto');
    const thumbUrl = (typeof ApiService !== 'undefined' && ApiService.getPortfolioThumbUrl)
      ? ApiService.getPortfolioThumbUrl(item.thumbnail_path ?? '') : '';
    fotoEl.src = s(thumbUrl);
    fotoEl.alt = s(item.title ?? '');
    fotoEl.style.opacity = '';
    PortfolioBarbeirosViewer.#fotoEl = fotoEl;

    // Barber info
    const avatarEl  = o.querySelector('.pbv-avatar');
    const avatarUrl = (barber.avatar_path && typeof ApiService !== 'undefined' && ApiService.getAvatarUrl)
      ? ApiService.getAvatarUrl(barber.avatar_path) : '';
    avatarEl.src         = s(avatarUrl);
    avatarEl.alt         = s(barber.full_name ?? '');
    avatarEl.style.display = '';
    o.querySelector('.pbv-nome').textContent = barber.full_name ?? 'Barbeiro';

    // Like
    const likeBtn = o.querySelector('.pbv-like-btn');
    const curtido = PortfolioBarbeirosViewer.#curtidosSet.has(item.id);
    likeBtn.classList.toggle('curtido', curtido);
    likeBtn.dataset.imageId = item.id;
    o.querySelector('.pbv-like-count').textContent = String(item.likes_count ?? 0);

    // Mensagem
    o.querySelector('.pbv-msg-btn').dataset.barberId = item.owner_id;

    // Progress dots
    PortfolioBarbeirosViewer.#renderDots(idx);
  }

  static #renderDots(idx) {
    const o    = PortfolioBarbeirosViewer.#overlay;
    const prog = o.querySelector('.pbv-progress');
    const n    = PortfolioBarbeirosViewer.#itens.length;
    if (n <= 1) { prog.innerHTML = ''; return; }

    const maxDots = Math.min(n, 12);
    const dotIdx  = n <= maxDots ? idx : Math.floor(idx * maxDots / n);

    prog.innerHTML = '';
    for (let i = 0; i < maxDots; i++) {
      const d = document.createElement('div');
      d.className = 'pbv-dot' + (i === dotIdx ? ' ativo' : '');
      prog.appendChild(d);
    }
  }

  // ── Transforms 3D ────────────────────────────────────────

  static #resetTransform() {
    const f = PortfolioBarbeirosViewer.#fotoEl;
    if (!f) return;
    f.style.transition = 'none';
    f.style.transform  = '';
    f.style.filter     = '';
  }

  static #aplicarSwipe(dx) {
    const f = PortfolioBarbeirosViewer.#fotoEl;
    if (!f) return;
    const ratio  = Math.min(Math.abs(dx) / window.innerWidth, 1);
    const dir    = dx < 0 ? -1 : 1;
    const rot    = dir * ratio * PortfolioBarbeirosViewer.#ROT_MAX;
    const scale  = 1 - ratio * (1 - PortfolioBarbeirosViewer.#SCALE_MIN);
    const bright = 1 - ratio * PortfolioBarbeirosViewer.#DARKEN_MAX * 0.5;
    f.style.transition = 'none';
    f.style.transform  = `perspective(900px) rotateY(${rot}deg) scale(${scale})`;
    f.style.filter     = `brightness(${bright})`;
  }

  static #cancelar() {
    const f    = PortfolioBarbeirosViewer.#fotoEl;
    if (!f) return;
    const dur  = PortfolioBarbeirosViewer.#DUR_SPRING;
    const ease = PortfolioBarbeirosViewer.#EASE_SPRING;
    f.style.transition = `transform ${dur}ms ${ease}, filter ${dur}ms ${ease}`;
    f.style.transform  = 'perspective(900px) rotateY(0deg) scale(1)';
    f.style.filter     = 'brightness(1)';
  }

  static #navegar(dir) {
    if (PortfolioBarbeirosViewer.#animando) return;
    const n       = PortfolioBarbeirosViewer.#itens.length;
    const nextIdx = PortfolioBarbeirosViewer.#idx + dir;

    if (nextIdx < 0 || nextIdx >= n) {
      PortfolioBarbeirosViewer.#cancelar();
      return;
    }

    PortfolioBarbeirosViewer.#animando = true;

    const f      = PortfolioBarbeirosViewer.#fotoEl;
    const rotOut = dir > 0
      ? -PortfolioBarbeirosViewer.#ROT_MAX
      :  PortfolioBarbeirosViewer.#ROT_MAX;
    const dur    = PortfolioBarbeirosViewer.#DUR_SLIDE;
    const easeSl = PortfolioBarbeirosViewer.#EASE_SLIDE;
    const bright = 1 - PortfolioBarbeirosViewer.#DARKEN_MAX * 0.5;

    // Anima saída do item atual
    f.style.transition = `transform ${dur}ms ${easeSl}, filter ${dur}ms ${easeSl}`;
    f.style.transform  = `perspective(900px) rotateY(${rotOut}deg) scale(${PortfolioBarbeirosViewer.#SCALE_MIN})`;
    f.style.filter     = `brightness(${bright})`;

    setTimeout(() => {
      PortfolioBarbeirosViewer.#idx = nextIdx;
      PortfolioBarbeirosViewer.#renderItem(nextIdx);

      // Posiciona novo item no ângulo oposto
      const fNew   = PortfolioBarbeirosViewer.#fotoEl;
      const rotIn  = dir > 0
        ?  PortfolioBarbeirosViewer.#ROT_MAX
        : -PortfolioBarbeirosViewer.#ROT_MAX;
      fNew.style.transition = 'none';
      fNew.style.transform  = `perspective(900px) rotateY(${rotIn}deg) scale(${PortfolioBarbeirosViewer.#SCALE_MIN})`;
      fNew.style.filter     = `brightness(${bright})`;

      // Dois requestAnimationFrame garantem que o browser pintou o estado inicial
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fNew.style.transition = `transform ${dur}ms ${easeSl}, filter ${dur}ms ${easeSl}`;
        fNew.style.transform  = 'perspective(900px) rotateY(0deg) scale(1)';
        fNew.style.filter     = 'brightness(1)';
        setTimeout(() => { PortfolioBarbeirosViewer.#animando = false; }, dur);
      }));
    }, dur);
  }

  // ── Eventos ───────────────────────────────────────────────

  static #bindEventos() {
    const o = PortfolioBarbeirosViewer.#overlay;

    // Fechar
    o.querySelector('.pbv-close').addEventListener('click', () => {
      PortfolioBarbeirosViewer.fechar();
    });

    // Teclado
    const onKey = e => {
      if (!PortfolioBarbeirosViewer.#overlay) {
        document.removeEventListener('keydown', onKey);
        return;
      }
      if (e.key === 'Escape')          PortfolioBarbeirosViewer.fechar();
      else if (e.key === 'ArrowRight') PortfolioBarbeirosViewer.#navegar(1);
      else if (e.key === 'ArrowLeft')  PortfolioBarbeirosViewer.#navegar(-1);
    };
    document.addEventListener('keydown', onKey);
    PortfolioBarbeirosViewer.#onKey = onKey;

    // Like
    o.querySelector('.pbv-like-btn').addEventListener('click', e => {
      e.stopPropagation();
      const imageId = e.currentTarget.dataset.imageId;
      if (!imageId) return;
      const countEl = e.currentTarget.querySelector('.pbv-like-count');
      if (PortfolioBarbeirosViewer.#onLike) {
        PortfolioBarbeirosViewer.#onLike(imageId, e.currentTarget, countEl);
      }
    });

    // Mensagem
    o.querySelector('.pbv-msg-btn').addEventListener('click', e => {
      e.stopPropagation();
      const barberId = e.currentTarget.dataset.barberId;
      if (PortfolioBarbeirosViewer.#onMessage) {
        PortfolioBarbeirosViewer.#onMessage(barberId);
      }
    });

    // Swipe touch
    const inner = o.querySelector('.pbv-inner');

    inner.addEventListener('touchstart', e => {
      if (PortfolioBarbeirosViewer.#animando) return;
      PortfolioBarbeirosViewer.#txStart  = e.touches[0].clientX;
      PortfolioBarbeirosViewer.#dragging = true;
    }, { passive: true });

    inner.addEventListener('touchmove', e => {
      if (!PortfolioBarbeirosViewer.#dragging || PortfolioBarbeirosViewer.#animando) return;
      PortfolioBarbeirosViewer.#aplicarSwipe(e.touches[0].clientX - PortfolioBarbeirosViewer.#txStart);
    }, { passive: true });

    inner.addEventListener('touchend', e => {
      if (!PortfolioBarbeirosViewer.#dragging) return;
      PortfolioBarbeirosViewer.#dragging = false;
      const dx = e.changedTouches[0].clientX - PortfolioBarbeirosViewer.#txStart;
      if (Math.abs(dx) >= PortfolioBarbeirosViewer.#THRESHOLD) {
        PortfolioBarbeirosViewer.#navegar(dx < 0 ? 1 : -1);
      } else {
        PortfolioBarbeirosViewer.#cancelar();
      }
    });

    // touchcancel: OS cancelou o toque (ex. notificação, chamada) — reseta estado
    inner.addEventListener('touchcancel', () => {
      if (!PortfolioBarbeirosViewer.#dragging) return;
      PortfolioBarbeirosViewer.#dragging = false;
      PortfolioBarbeirosViewer.#cancelar();
    });

    // Swipe mouse (desktop)
    let mouseStartX = 0;
    let mouseActive = false;

    inner.addEventListener('mousedown', e => {
      if (PortfolioBarbeirosViewer.#animando) return;
      mouseStartX  = e.clientX;
      mouseActive  = true;
      PortfolioBarbeirosViewer.#dragging = true;
    });

    const onMouseMove = e => {
      if (!mouseActive || PortfolioBarbeirosViewer.#animando) return;
      PortfolioBarbeirosViewer.#aplicarSwipe(e.clientX - mouseStartX);
    };
    const onMouseUp = e => {
      if (!mouseActive) return;
      mouseActive = false;
      PortfolioBarbeirosViewer.#dragging = false;
      const dx = e.clientX - mouseStartX;
      if (Math.abs(dx) >= PortfolioBarbeirosViewer.#THRESHOLD) {
        PortfolioBarbeirosViewer.#navegar(dx < 0 ? 1 : -1);
      } else {
        PortfolioBarbeirosViewer.#cancelar();
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    PortfolioBarbeirosViewer.#onMouseMove = onMouseMove;
    PortfolioBarbeirosViewer.#onMouseUp   = onMouseUp;
  }
}

// ──────────────────────────────────────────────────────────────
// PortfolioBarbeirosSection — orquestra carrossel e viewer
// ──────────────────────────────────────────────────────────────
class PortfolioBarbeirosSection {

  /**
   * Ponto de entrada. Chamado em BarbeariaPage.#renderPortfolioBarbeiros().
   *
   * @param {string}      shopId      — UUID da barbearia
   * @param {string|null} ownerId     — UUID do dono (para colocá-lo primeiro)
   * @param {HTMLElement} containerEl — #bp-portfolio-barbeiros
   * @returns {Promise<boolean>}      — true se há fotos para exibir
   */
  static async iniciar(shopId, ownerId, containerEl) {
    if (!containerEl) return false;
    if (!InputValidator.uuid(shopId).ok) return false;

    PortfolioBarbeirosSection.#mostrarSkeleton(containerEl);

    try {
      // 1. Barbeiros da barbearia (dono garantido no índice 0)
      const barbers = await BarbershopRepository.getBarbersByShop(shopId, ownerId ?? null);
      if (!barbers.length) { containerEl.innerHTML = ''; return false; }

      const barberIds = barbers.map(b => b.id);

      // 2. Portfólios de todos em uma única query
      const { data: portfolio, error } = await ApiService.from('portfolio_images')
        .select('id, owner_id, thumbnail_path, title, likes_count')
        .in('owner_id', barberIds)
        .eq('owner_type', 'professional')
        .eq('status', 'active')
        .order('likes_count', { ascending: false })
        .limit(50);

      if (error || !portfolio?.length) { containerEl.innerHTML = ''; return false; }

      // 3. Intercalar: dono primeiro (≤ 5 fotos) → demais aleatório
      const donorId    = barbers[0]?.id;
      const portByBar  = {};
      barbers.forEach(b => { portByBar[b.id] = []; });
      portfolio.forEach(p => { if (portByBar[p.owner_id]) portByBar[p.owner_id].push(p); });

      const donoFotos  = (portByBar[donorId] ?? []).slice(0, 5);
      const outrasFotos = [];
      for (const b of barbers) {
        if (b.id === donorId) continue;
        outrasFotos.push(...(portByBar[b.id] ?? []));
      }
      outrasFotos.sort(() => Math.random() - 0.5);

      const itens = [...donoFotos, ...outrasFotos].slice(0, 30);
      if (!itens.length) { containerEl.innerHTML = ''; return false; }

      // 4. Mapa id→barbeiro para acesso rápido no render
      const barbersMap = {};
      barbers.forEach(b => { barbersMap[b.id] = b; });

      // 5. Likes do usuário logado (best-effort — não bloqueia)
      const curtidosSet = new Set();
      const perfil = (typeof AuthService !== 'undefined') ? (AuthService.getPerfil?.() ?? null) : null;
      if (perfil?.id) {
        try {
          const imageIds = itens.map(i => i.id);
          const { data: likes } = await ApiService.from('portfolio_likes')
            .select('portfolio_image_id')
            .eq('user_id', perfil.id)
            .in('portfolio_image_id', imageIds);
          (likes ?? []).forEach(l => curtidosSet.add(l.portfolio_image_id));
        } catch { /* best-effort */ }
      }

      // 6. Renderizar carrossel
      PortfolioBarbeirosSection.#renderCarrossel(containerEl, itens, barbersMap, curtidosSet);
      return true;

    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[PortfolioBarbeirosSection] erro ao iniciar:', err?.message);
      }
      containerEl.innerHTML = '';
      return false;
    }
  }

  // ── Skeleton ──────────────────────────────────────────────

  static #mostrarSkeleton(containerEl) {
    const scroll = document.createElement('div');
    scroll.className = 'pbp-scroll';
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('div');
      c.className = 'pbp-card pbp-card--skel';
      scroll.appendChild(c);
    }
    containerEl.replaceChildren(scroll);
  }

  // ── Carrossel ─────────────────────────────────────────────

  static #renderCarrossel(containerEl, itens, barbersMap, curtidosSet) {
    const s      = InputValidator.sanitizar;
    const scroll = document.createElement('div');
    scroll.className = 'pbp-scroll';

    itens.forEach((item, idx) => {
      const barber    = barbersMap[item.owner_id] ?? {};
      const thumbUrl  = (typeof ApiService !== 'undefined' && ApiService.getPortfolioThumbUrl)
        ? ApiService.getPortfolioThumbUrl(item.thumbnail_path ?? '') : '';
      const avatarUrl = (barber.avatar_path && typeof ApiService !== 'undefined' && ApiService.getAvatarUrl)
        ? ApiService.getAvatarUrl(barber.avatar_path) : '';
      const curtido   = curtidosSet.has(item.id);
      const count     = item.likes_count ?? 0;

      const card = document.createElement('div');
      card.className    = 'pbp-card';
      card.dataset.idx  = idx;
      card.innerHTML    = `
        <img class="pbp-foto" src="${s(thumbUrl)}" alt="${s(item.title ?? '')}"
             loading="lazy" onerror="this.style.opacity='.2'">
        <div class="pbp-overlay"></div>
        <button class="pbp-like-btn${curtido ? ' curtido' : ''}"
                data-image-id="${s(item.id)}"
                aria-label="Curtir">💎 <span class="pbp-like-count">${count}</span></button>
        <button class="pbp-msg-btn"
                data-barber-id="${s(item.owner_id)}"
                aria-label="Mensagem">✉️</button>
        <div class="pbp-barber-row">
          <img class="pbp-avatar" src="${s(avatarUrl)}" alt="${s(barber.full_name ?? '')}"
               loading="lazy" onerror="this.style.display='none'">
          <span class="pbp-nome">${s(barber.full_name ?? 'Barbeiro')}</span>
        </div>
      `;
      scroll.appendChild(card);
    });

    containerEl.replaceChildren(scroll);

    // Delegação de eventos — um único listener para todo o carrossel
    scroll.addEventListener('click', e => {
      // Like
      const likeBtn = e.target.closest('.pbp-like-btn');
      if (likeBtn) {
        e.stopPropagation();
        const imageId = likeBtn.dataset.imageId;
        const countEl = likeBtn.querySelector('.pbp-like-count');
        PortfolioBarbeirosSection.#toggleLike(imageId, likeBtn, countEl, curtidosSet, itens, containerEl);
        return;
      }
      // Mensagem
      const msgBtn = e.target.closest('.pbp-msg-btn');
      if (msgBtn) {
        e.stopPropagation();
        PortfolioBarbeirosSection.#abrirMensagem(msgBtn.dataset.barberId);
        return;
      }
      // Foto → abre viewer
      const card = e.target.closest('.pbp-card');
      if (card) {
        const idx = parseInt(card.dataset.idx, 10);
        if (!isNaN(idx)) {
          PortfolioBarbeirosViewer.abrir(
            idx,
            itens,
            barbersMap,
            curtidosSet,
            (imageId, btn, countEl) =>
              PortfolioBarbeirosSection.#toggleLike(imageId, btn, countEl, curtidosSet, itens, containerEl),
            (barberId) =>
              PortfolioBarbeirosSection.#abrirMensagem(barberId),
          );
        }
      }
    });
  }

  // ── Like ──────────────────────────────────────────────────

  static async #toggleLike(imageId, btn, countEl, curtidosSet, itens, containerEl) {
    if (!imageId || !InputValidator.uuid(imageId).ok) return;
    if (btn?.disabled) return; // previne double-click durante chamada async

    const perfil = (typeof AuthService !== 'undefined') ? (AuthService.getPerfil?.() ?? null) : null;
    if (!perfil?.id) return; // requer login

    const curtido   = curtidosSet.has(imageId);
    const contAtual = parseInt(countEl?.textContent ?? '0', 10) || 0;
    const novoCont  = Math.max(0, contAtual + (curtido ? -1 : 1));

    // Desabilita botão para evitar chamadas concorrentes
    if (btn) btn.disabled = true;

    // UI otimista
    if (curtido) { curtidosSet.delete(imageId); } else { curtidosSet.add(imageId); }
    btn?.classList.toggle('curtido', !curtido);
    if (countEl) countEl.textContent = String(novoCont);

    // Atualiza item no array para manter estado sincronizado com o viewer
    const item = itens.find(i => i.id === imageId);
    if (item) item.likes_count = novoCont;

    // Sincroniza botão correspondente no carrossel (quando chamado do viewer)
    // UUID é [0-9a-f-] — seguro como valor de atributo CSS
    const carouselBtn = containerEl?.querySelector(`.pbp-like-btn[data-image-id="${imageId}"]`);
    if (carouselBtn && carouselBtn !== btn) {
      carouselBtn.classList.toggle('curtido', !curtido);
      const carouselCount = carouselBtn.querySelector('.pbp-like-count');
      if (carouselCount) carouselCount.textContent = String(novoCont);
    }

    try {
      if (curtido) {
        await ApiService.from('portfolio_likes')
          .delete()
          .eq('portfolio_image_id', imageId)
          .eq('user_id', perfil.id);
      } else {
        await ApiService.from('portfolio_likes')
          .insert({ portfolio_image_id: imageId, user_id: perfil.id });
      }
    } catch {
      // Rollback em caso de erro de rede
      if (curtido) { curtidosSet.add(imageId); } else { curtidosSet.delete(imageId); }
      const contRollback = Math.max(0, novoCont + (curtido ? 1 : -1));
      btn?.classList.toggle('curtido', curtido);
      if (countEl) countEl.textContent = String(contRollback);
      if (item) item.likes_count = contRollback;
      if (carouselBtn && carouselBtn !== btn) {
        carouselBtn.classList.toggle('curtido', curtido);
        const carouselCount = carouselBtn.querySelector('.pbp-like-count');
        if (carouselCount) carouselCount.textContent = String(contRollback);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Mensagem ──────────────────────────────────────────────

  static #abrirMensagem(barberId) {
    if (!barberId) return;
    // Salva o barbeiro alvo para que MessagesPage possa pré-selecionar a conversa
    try { sessionStorage.setItem('bf_target_barber_id', barberId); } catch { /* ignore */ }
    const router = (typeof App !== 'undefined' && App)
                || (typeof Pro !== 'undefined' && Pro)
                || null;
    if (router) router.nav('mensagens');
  }
}
