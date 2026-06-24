'use strict';

// =============================================================
// PortfolioPrismViewer.js — Visualizador 3D em prisma hexagonal
//
// Compartilhado entre app cliente e app profissional.
// API pública idêntica (open/close/next/prev) — drop-in replacement
// de PortfolioViewerModal.
//
// Efeito: 6 faces dispostas em prisma regular (60° entre faces),
// gira em rotateY conforme o swipe. Drag proporcional ao dedo,
// snap por distância (18%) ou velocidade (0.35 px/ms), easing
// cubic-bezier(0.22, 1, 0.36, 1) a 520ms.
//
// Suporta imagens (<img>) e vídeos (<video muted playsinline>).
// Apenas a face frontal toca vídeo automaticamente.
// =============================================================

class MediaPrismViewer {

  // ── Constantes geométricas/físicas ─────────────────────────
  static #SIDES                 = 6;
  static #ANGLE_PER_FACE        = 60;                  // 360 / SIDES
  static #DURATION_MS           = 520;
  static #EASING                = 'cubic-bezier(0.22, 1, 0.36, 1)';
  static #THRESHOLD_DIST_RATIO  = 0.18;
  static #VELOCITY_THRESHOLD    = 0.35;                // px/ms
  static #DRAG_MIN_PX           = 8;                   // gesto horizontal só após este deslocamento
  static #PUBLIC_MESSAGE_MAX_LENGTH = 20;
  static #FLOAT_STACK_SIZE      = 8;
  static #instance              = null;
  // Ordem visual das 6 faces ao redor do índice atual.
  // Face 0 = frontal; 1/2/3 giram à direita; -2/-1 giram à esquerda.
  static #FACE_OFFSETS          = [0, 1, 2, 3, -2, -1];

  // ── Estado ─────────────────────────────────────────────────
  #overlay         = null;
  #stage           = null;
  #cube            = null;
  #faces           = [];      // 6 figures
  #medias          = [];      // 6 .pp-prism-media (container interno de cada face)
  #meta            = null;
  #avatar          = null;
  #name            = null;
  #likes           = null;
  #title           = null;
  #actions         = null;
  #publicActions   = null;
  #publicInput     = null;
  #publicSendBtn   = null;
  #publicLike      = null;
  #publicLogo      = null;
  #publicEmojis    = [];
  #reactionLayer   = null;
  #soundBtn        = null;

  // Referências para overlay dentro de cada face 3D
  #faceIdentityImgs  = [];
  #faceIdentityNames = [];
  #faceLikeBtns      = [];
  #faceLikeCounts    = [];
  #faceProgress      = [];    // barra de progresso por face (move com o conteúdo)

  #items           = [];
  #index           = 0;
  #mode            = 'portfolio';

  #faceWidth       = 0;
  #radius          = 0;
  #baseRotation    = 0;

  #dragStart       = null;    // { x, y, t, captured }
  #dragLast        = null;    // { x, t } — para velocidade
  #dragActive      = false;
  #dragRAF         = 0;
  #pendingAngle    = 0;

  #animando        = false;
  #finalizeTimer   = null;
  #deleteTimer     = null;
  #resizeObserver  = null;
  #floatTimers      = new Set();
  #floatSequence    = 0;

  #onKeydown       = null;

  constructor() {
    this.#ensure();
  }

  // ───────────────────────────────────────────────────────────
  // API pública
  // ───────────────────────────────────────────────────────────

  static get() {
    MediaPrismViewer.#instance ??= new MediaPrismViewer();
    return MediaPrismViewer.#instance;
  }

  open(item, items = []) {
    this.#ensure();
    if (!this.#overlay || !this.#cube) return;

    const config = MediaPrismViewer.#normalizarOpen(item, items);
    this.#mode = config.mode;
    this.#items = config.items;
    this.#index = config.startIndex;
    this.#overlay.dataset.mode = this.#mode;

    this.#overlay.hidden = false;
    this.#overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('portfolio-viewer-open');

    // Mede stage e calcula raio (espera 1 frame para o layout aplicar)
    requestAnimationFrame(() => {
      this.#medirStage();
      this.#renderAtual({ animar: false });
      this.#onKeydown ??= (e) => this.#handleKey(e);
      document.addEventListener('keydown', this.#onKeydown);
    });
  }

  close() {
    if (!this.#overlay) return;
    this.#overlay.hidden = true;
    this.#overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('portfolio-viewer-open');

    this.#pararTodosVideos(true);
    this.#limparTimer();
    this.#limparInteracoes();
    this.#removerBotaoSom();
    if (this.#publicInput)   this.#publicInput.value     = '';
    if (this.#publicSendBtn) this.#publicSendBtn.disabled = false;
    this.#dragStart = null;
    this.#dragLast = null;
    this.#dragActive = false;
    this.#animando = false;

    if (this.#onKeydown) {
      document.removeEventListener('keydown', this.#onKeydown);
    }
  }

  next() { this.#go(1); }
  prev() { this.#go(-1); }

  // ───────────────────────────────────────────────────────────
  // Navegação
  // ───────────────────────────────────────────────────────────

  #go(delta) {
    if (!this.#items.length || this.#animando) return;
    if (this.#items.length < 2) return; // 1 item: sem rotação
    const dir = delta > 0 ? 1 : -1;
    const alvo = this.#index + dir;
    // Sem loop: não passa do último (direita) nem do primeiro (esquerda).
    if (alvo < 0 || alvo >= this.#items.length) return;
    // Fronteira entre barbearias (feed): a nova barbearia ENTRA deslizando na
    // direção do arraste, em vez do 3D. Dentro da mesma barbearia → 3D normal.
    if (this.#cruzaBarbearia(alvo)) this.#animarParaSlide(dir);
    else this.#animarPara(delta);
  }

  // Chave que identifica a barbearia de um item (feed multi-barbearia).
  static #shopKey(item) {
    return item?.__shopFeedId ?? item?.barbershop_id ?? item?.shop_owner_id ?? item?.owner_id ?? null;
  }

  // true quando a transição cruza para OUTRA barbearia (somente no modo story).
  #cruzaBarbearia(alvo) {
    if (!this.#isStoryMode()) return false;
    const atualKey = MediaPrismViewer.#shopKey(this.#items[this.#index]);
    const alvoKey  = MediaPrismViewer.#shopKey(this.#items[alvo]);
    if (atualKey == null || alvoKey == null) return false;
    return atualKey !== alvoKey;
  }

  // Transição de fronteira: o conteúdo da nova barbearia entra deslizando na
  // direção do arraste (sem 3D). dir +1 (arraste ←) entra pela direita;
  // dir -1 (arraste →) entra pela esquerda. Depois volta ao 3D normal.
  #animarParaSlide(dir) {
    this.#animando = true;
    this.#cube.classList.remove('pp-prism-cube--drag');
    // Avança o índice e renderiza a nova barbearia já na face frontal (vídeo toca).
    this.#index = Math.min(Math.max(this.#index + dir, 0), this.#items.length - 1);
    this.#renderAtual({ animar: false });
    // Mantém rotateY(0) (só a face frontal visível) e desliza só em X.
    const fromPct = dir > 0 ? 100 : -100;
    this.#cube.style.transition = 'none';
    this.#cube.style.transform = `translateX(${fromPct}%) rotateY(0deg)`;
    void this.#cube.offsetWidth; // reflow: pinta o novo conteúdo já fora da tela
    this.#cube.style.transition = `transform ${MediaPrismViewer.#DURATION_MS}ms ${MediaPrismViewer.#EASING}`;
    this.#cube.style.transform = 'translateX(0%) rotateY(0deg)';
    this.#limparTimer();
    this.#finalizeTimer = setTimeout(() => {
      this.#animando = false;
      this.#cube.style.transition = ''; // volta à transição padrão (3D) do CSS
      this.#cube.style.transform = 'rotateY(0deg)';
    }, MediaPrismViewer.#DURATION_MS + 30);
  }

  #animarPara(delta) {
    const dir = delta > 0 ? 1 : -1;
    this.#animando = true;
    this.#cube.classList.remove('pp-prism-cube--drag');

    // Já dispara a reprodução do vídeo que está entrando: enquanto a face gira
    // para a frente ela já chega tocando, sem piscar nem aguardar buffer.
    this.#tocarVideoEntrando(dir);

    void this.#cube.offsetWidth; // força reflow: garante que a transição CSS está ativa antes do novo transform
    // Aplica nova rotação (gira -60° para próxima, +60° para anterior)
    const novaRotacao = this.#baseRotation - (dir * MediaPrismViewer.#ANGLE_PER_FACE);
    this.#cube.style.transform = `rotateY(${novaRotacao}deg)`;

    this.#limparTimer();
    this.#finalizeTimer = setTimeout(() => {
      // Sem loop: índice fica preso entre 0 e o último.
      this.#index = Math.min(Math.max(this.#index + dir, 0), this.#items.length - 1);
      this.#animando = false;
      this.#renderAtual({ animar: false, dir });
    }, MediaPrismViewer.#DURATION_MS + 30);
  }

  // Toca o vídeo da face que está rotacionando para a frente (offset = dir),
  // ainda durante a animação, para que chegue reproduzindo sem flicker.
  #tocarVideoEntrando(dir) {
    const faceEntrando = MediaPrismViewer.#FACE_OFFSETS.indexOf(dir > 0 ? 1 : -1);
    const v = this.#medias[faceEntrando]?.querySelector('video');
    if (!v) return;
    // Pré-toca mutado durante a rotação (evita áudio duplicado com o vídeo que
    // sai). O som é reativado quando a face pousa na frente (#ajustarFlagsVideo).
    v.muted = true;
    v.play?.().catch(() => {});
  }

  // ───────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────

  #renderAtual({ animar = false, dir = 0 } = {}) {
    if (!this.#items.length) return;

    const item = this.#items[this.#index] ?? {};
    const storyMode = this.#isStoryMode();
    if (this.#title) {
      this.#title.hidden = storyMode;
      this.#title.textContent = storyMode ? '' : (item.title || 'Trabalho do portfolio');
    }
    this.#renderPublicActions(item);

    if (this.#actions) {
      this.#actions.innerHTML = '';
      this.#actions.hidden = storyMode;
      if (!storyMode && !item?.portfolioPublicActions && typeof PortfolioImageActions !== 'undefined') {
        try { this.#actions.appendChild(PortfolioImageActions.criar(item)); } catch (_) {}
      }
    }

    // Reset visual do cubo (volta para rotacao base zero, sem animacao)
    this.#baseRotation = 0;
    this.#cube.classList.remove('pp-prism-cube--drag');
    if (!animar) {
      const prevTransition = this.#cube.style.transition;
      this.#cube.style.transition = 'none';
      this.#cube.style.transform = `rotateY(0deg)`;
      void this.#cube.offsetWidth;
      this.#cube.style.transition = prevTransition || '';
    }

    // Navegação (dir≠0) com faces já populadas: reaproveita elementos para não
    // recarregar o vídeo frontal (sem flicker). Caso contrário, render completo.
    const podeGirar = dir !== 0
      && this.#items.length > 1
      && this.#medias.some(slot => slot?.firstElementChild);
    if (podeGirar) this.#renderFacesGirando(dir);
    else this.#renderFaces();

    if (storyMode) this.#limparInteracoes();
    else this.#replayInteractions(item);
  }
  // Barra de progresso DENTRO de cada face — gira/arrasta junto com a mídia.
  // `realIdx` = índice global do item daquela face; -1 (ou fora do range) oculta.
  #renderProgressNaFace(faceIndex, realIdx) {
    const bar = this.#faceProgress[faceIndex];
    if (!bar) return;
    const n = this.#items.length;
    if (realIdx == null || realIdx < 0 || realIdx >= n || n < 1) {
      bar.replaceChildren();
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    if (bar.children.length !== n) {
      bar.innerHTML = Array.from({ length: n }, (_, i) =>
        `<span class="pp-prism-progress-dash${i === realIdx ? ' is-active' : ''}"></span>`
      ).join('');
    } else {
      [...bar.children].forEach((el, i) => el.classList.toggle('is-active', i === realIdx));
    }
  }

  #renderPublicActions(item) {
    if (!this.#publicActions) return;
    if (this.#isStoryMode()) {
      this.#publicActions.hidden = false;
      if (this.#publicLogo) {
        const rawPath = item?.shop_logo_path || '';
        const logoUrl = rawPath && typeof ApiService !== 'undefined'
          ? ApiService.getLogoUrl(rawPath)
          : rawPath;
        this.#publicLogo.src = logoUrl || '/shared/img/icon-512-cliente.png';
        this.#publicLogo.alt = item?.shop_name || 'BarberFlow';
      }
      if (this.#publicInput) { this.#publicInput.value = ''; this.#publicInput.disabled = false; }
      if (this.#publicSendBtn) this.#publicSendBtn.disabled = false;
      this.#publicEmojis.forEach(btn => { btn.disabled = false; });
      return;
    }

    const visivel = Boolean(item?.portfolioPublicActions);
    const imageId = item?.id ?? '';
    const imageAnterior = this.#publicActions.dataset.portfolioImageId ?? '';
    this.#publicActions.hidden = !visivel;
    this.#publicActions.dataset.portfolioImageId = imageId;
    this.#publicActions.dataset.professionalId = item?.professionalId ?? '';

    if (!visivel) {
      if (this.#publicInput) this.#publicInput.value = '';
      return;
    }

    if (this.#publicInput) {
      if (imageAnterior !== imageId) this.#publicInput.value = '';
      this.#publicInput.disabled = false;
    }
    if (this.#publicSendBtn) this.#publicSendBtn.disabled = false;
    this.#publicEmojis.forEach(btn => { btn.disabled = false; });
  }

  #renderMeta(item) {
    if (!this.#meta) return;
    if (this.#isStoryMode()) {
      this.#meta.hidden = true;
      this.#meta.dataset.portfolioImageId = '';
      if (this.#avatar) {
        this.#avatar.hidden = true;
        this.#avatar.removeAttribute('src');
        this.#avatar.alt = '';
      }
      return;
    }

    const nome = item?.professionalName || item?.barberName || item?.authorName || '';
    const avatarUrl = item?.professionalAvatarUrl || item?.barberAvatarUrl || item?.authorAvatarUrl || '';
    const likesCount = Math.max(0, Number(item?.likesCount ?? item?.likes_count ?? 0));

    this.#meta.hidden = !nome && !avatarUrl && !likesCount;
    this.#meta.dataset.portfolioImageId = item?.id ?? '';
    if (this.#name) this.#name.textContent = nome || 'Barbeiro';
    if (this.#likes) this.#likes.textContent = `${likesCount} curtida${likesCount === 1 ? '' : 's'}`;
    if (!this.#avatar) return;

    if (avatarUrl) {
      this.#avatar.hidden = false;
      this.#avatar.src = avatarUrl;
      this.#avatar.alt = nome ? `Avatar de ${nome}` : '';
    } else {
      this.#avatar.hidden = true;
      this.#avatar.removeAttribute('src');
      this.#avatar.alt = '';
    }
  }

  #renderFaces() {
    const total = this.#items.length;
    MediaPrismViewer.#FACE_OFFSETS.forEach((offset, faceIndex) => {
      // Sem loop: offsets fora do range ficam vazios (nada para arrastar).
      const realIdx = this.#index + offset;
      const dentro = realIdx >= 0 && realIdx < total;
      const item = dentro ? (this.#items[realIdx] ?? null) : null;
      const deveCarregar = dentro && (!this.#isStoryMode() || Math.abs(offset) <= 1);
      this.#renderMidiaNaFace(faceIndex, deveCarregar ? item : null, offset === 0, Math.abs(offset) <= 1, dentro ? realIdx : -1);
    });

    this.#pararTodosVideos(false);
    this.#playVideoFrontal();
  }

  // Navegação sem flicker: em vez de recarregar o `src` da nova face frontal
  // (poster → preto → play), reaproveita o elemento de vídeo/imagem que já
  // estava carregado na face vizinha. Reposicionar um <video> no DOM via
  // appendChild NÃO o recarrega — então a mídia continua tocando sem piscar.
  // Apenas a face que "deu a volta" recebe conteúdo novo.
  #renderFacesGirando(dir) {
    const total = this.#items.length;
    const offsets = MediaPrismViewer.#FACE_OFFSETS;

    // Snapshot dos elementos internos atuais por slot.
    const els = this.#medias.map(slot => slot?.firstElementChild ?? null);
    // Para cada slot-alvo k (offset Ok), o elemento certo é o que hoje tem
    // offset Ok+dir (mesmo conteúdo após o índice avançar `dir`).
    const fonte = offsets.map(Ok => offsets.indexOf(Ok + dir));

    // Desanexa todos sem destruir (mantém refs em `els`).
    this.#medias.forEach(slot => { if (slot) while (slot.firstChild) slot.removeChild(slot.firstChild); });

    const usados = new Set();
    offsets.forEach((Ok, k) => {
      // Sem loop: faces fora do range ficam vazias.
      const realIdx = this.#index + Ok;
      const dentro = realIdx >= 0 && realIdx < total;
      const item = dentro ? (this.#items[realIdx] ?? null) : null;
      const j = fonte[k];
      const frontal = Ok === 0;
      if (dentro && j >= 0 && els[j]) {
        // Reaproveita: nenhum reload, nenhuma piscada.
        this.#medias[k].appendChild(els[j]);
        usados.add(j);
        this.#ajustarFlagsVideo(els[j], frontal);
        this.#renderOverlayNaFace(k, item);
        this.#renderProgressNaFace(k, realIdx);
      } else {
        // Face que deu a volta (ou fora do range) — conteúdo novo / vazio.
        const deveCarregar = dentro && (!this.#isStoryMode() || Math.abs(Ok) <= 1);
        this.#renderMidiaNaFace(k, deveCarregar ? item : null, frontal, Math.abs(Ok) <= 1, dentro ? realIdx : -1);
      }
    });

    // Libera os elementos de vídeo que não foram reaproveitados.
    els.forEach((el, j) => {
      if (el && !usados.has(j) && el.tagName === 'VIDEO') {
        try { el.pause(); el.currentTime = 0; el.removeAttribute('src'); } catch (_) {}
      }
    });

    this.#pararTodosVideos(false);
    this.#playVideoFrontal();
  }

  #ajustarFlagsVideo(el, frontal) {
    if (el?.tagName !== 'VIDEO') return;
    el.muted = !this.#isStoryMode();
    el.loop  = !this.#isStoryMode();
    el.playsInline = true;
    if (!frontal) { try { el.pause(); } catch (_) {} }
  }

  #renderMidiaNaFace(faceIndex, item, frontal, precarregar = false, realIdx = -1) {
    const slot = this.#medias[faceIndex];
    if (!slot) return;
    if (!item) {
      this.#limparSlot(slot);
      this.#renderOverlayNaFace(faceIndex, null);
      this.#renderProgressNaFace(faceIndex, realIdx);
      return;
    }

    const url = MediaPrismViewer.#resolverMediaUrl(item);
    const poster = MediaPrismViewer.#resolverPosterUrl(item);
    const isVideo = MediaPrismViewer.#detectarVideo(item);
    const preloadMode = precarregar ? 'auto' : 'metadata';

    const tagAtual = slot.firstElementChild?.tagName;
    const tagNova = isVideo ? 'VIDEO' : 'IMG';

    if (tagAtual !== tagNova) {
      this.#limparSlot(slot);
      const el = document.createElement(isVideo ? 'video' : 'img');
      if (isVideo) {
        el.muted = !this.#isStoryMode();
        el.controls = false;
        el.playsInline = true;
        el.preload = preloadMode;
        el.loop = !this.#isStoryMode();
      } else {
        el.alt = MediaPrismViewer.#resolverTitulo(item);
        el.onerror = () => { el.style.opacity = '0'; };
      }
      slot.appendChild(el);
    }

    const el = slot.firstElementChild;
    if (isVideo) {
      el.muted = !this.#isStoryMode();
      el.controls = false;
      el.playsInline = true;
      el.preload = preloadMode;
      el.loop = !this.#isStoryMode();
      if (poster) el.poster = poster;
      if (url && el.src !== url) el.src = url;
      if (!frontal) el.pause();
    } else {
      if (url && el.src !== url) el.src = url;
      el.alt = MediaPrismViewer.#resolverTitulo(item);
    }
    this.#renderOverlayNaFace(faceIndex, item);
    this.#renderProgressNaFace(faceIndex, realIdx);
  }

  #renderOverlayNaFace(faceIndex, item) {
    const imgEl   = this.#faceIdentityImgs[faceIndex];
    const nameEl  = this.#faceIdentityNames[faceIndex];
    const likeBtn = this.#faceLikeBtns[faceIndex];
    const countEl = this.#faceLikeCounts[faceIndex];
    if (!imgEl || !nameEl) return;

    if (!item) {
      imgEl.removeAttribute('src'); imgEl.alt = '';
      nameEl.textContent = '';
      if (likeBtn) likeBtn.hidden = true;
      return;
    }

    const eParceiro = item.tipo_autor === 'parceiro';
    let avatarUrl = '', nome = '';
    if (eParceiro) {
      const rawPath = item.poster_avatar_path || '';
      avatarUrl = rawPath && typeof ApiService !== 'undefined'
        ? ApiService.getAvatarUrl(rawPath)
        : rawPath;
      nome = item.poster_name || '';
    } else if (this.#isStoryMode()) {
      const rawPath = item.shop_logo_path || '';
      avatarUrl = rawPath && typeof ApiService !== 'undefined'
        ? ApiService.getLogoUrl(rawPath)
        : rawPath;
      nome = item.shop_name || '';
    } else {
      avatarUrl = item.professionalAvatarUrl || item.barberAvatarUrl || '';
      nome      = item.professionalName || item.barberName || '';
    }

    if (avatarUrl) { imgEl.src = avatarUrl; imgEl.alt = nome; imgEl.hidden = false; }
    else           { imgEl.removeAttribute('src'); imgEl.hidden = true; }
    nameEl.textContent = nome;

    if (!likeBtn) return;
    const likesCount = Math.max(0, Number(item.likes_count ?? item.likesCount ?? 0));
    const isLiked    = Boolean(item.user_liked ?? item.liked);
    likeBtn.hidden   = false;
    likeBtn.classList.toggle('is-liked', isLiked);
    likeBtn.setAttribute('aria-pressed', String(isLiked));
    if (countEl) {
      countEl.textContent = likesCount > 0 ? String(likesCount) : '';
      countEl.hidden = likesCount <= 0;
    }
  }

  #handleStoryLike() {
    const item = this.#items[this.#index];
    if (!item) return;
    const prevLiked = Boolean(item.user_liked);
    const prevCount = Math.max(0, Number(item.likes_count ?? 0));
    item.user_liked  = !prevLiked;
    item.likes_count = prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1;
    this.#renderFaces();
    document.dispatchEvent(new CustomEvent('barberflow:prism-story-like', {
      bubbles: false,
      detail: { storyId: item.id, mediaId: item.media_id, item },
    }));
  }

  #handleStoryMessage(body) {
    const texto = String(body ?? '').trim();
    if (!texto) return;
    if (this.#publicInput) this.#publicInput.value = '';
    const item  = this.#items[this.#index];
    const perfil = MediaPrismViewer.#perfilAtual();
    const tipo   = MediaPrismViewer.#isEmojiText(texto) ? 'emoji' : 'message';
    this.#emitInteraction({ texto, perfil, type: tipo });
    document.dispatchEvent(new CustomEvent('barberflow:prism-story-message', {
      bubbles: false,
      detail: { texto, storyId: item?.id, shopOwnerId: item?.shop_owner_id, item },
    }));
  }

  async #handleDeleteStory() {
    const item = this.#items[this.#index];
    if (!item?.can_delete || !item?.media_id) return;

    const confirmed = typeof FluxoDeFila !== 'undefined'
      ? await FluxoDeFila.abrir({
          id: 'prism-story-delete-confirm',
          titulo: 'Excluir vídeo?',
          corpo: 'Este story será removido da barbearia.',
          acoes: [
            { label: 'Excluir', valor: 'excluir', variante: 'perigo' },
            { label: 'Cancelar', valor: 'cancelar', variante: 'secundario' },
          ],
          fecharBtn: true,
          tocarSom: false,
        }) === 'excluir'
      : window.confirm('Excluir este vídeo?');

    if (!confirmed) return;

    if (typeof BffApiService === 'undefined') return;
    const { error } = await BffApiService.media.deletarStory(item.media_id);
    if (error) return;

    this.close();
    document.dispatchEvent(new CustomEvent('barberflow:story-deleted', {
      bubbles: false,
      detail: { mediaId: item.media_id, storyId: item.id },
    }));
  }

  static #detectarVideo(item) {
    if (!item) return false;
    if (typeof item.type === 'string' && item.type.startsWith('video')) return true;
    if (item.mediaType && /video/i.test(item.mediaType)) return true;
    if (item.media_type && /video/i.test(item.media_type)) return true;
    const url = MediaPrismViewer.#resolverMediaUrl(item);
    return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
  }

  #pararTodosVideos(limparSrc = false) {
    this.#medias.forEach(slot => {
      const v = slot?.querySelector('video');
      if (!v) return;
      try { v.pause(); } catch (_) {}
      if (limparSrc) {
        try {
          v.currentTime = 0;
          v.removeAttribute('src');
          v.remove();
        } catch (_) {}
      }
    });
  }

  #playVideoFrontal() {
    this.#removerBotaoSom();
    const frontalIndex = MediaPrismViewer.#FACE_OFFSETS.indexOf(0);
    const slot = this.#medias[frontalIndex];
    const v = slot?.querySelector('video');
    if (!v) return;
    const tentativa = v.play?.();
    if (!tentativa?.catch) return;
    tentativa.catch(() => {
      if (this.#isStoryMode()) this.#mostrarBotaoSom(v);
    });
  }
  // ───────────────────────────────────────────────────────────
  // Medição e raio (responsivo)
  // ───────────────────────────────────────────────────────────

  #medirStage() {
    if (!this.#stage) return;
    const w = this.#stage.clientWidth || 320;
    this.#faceWidth = w;
    this.#radius    = (w / 2) / Math.tan(Math.PI / MediaPrismViewer.#SIDES); // ≈ w * 0.866
    this.#stage.style.setProperty('--pp-radius', `${this.#radius}px`);
    this.#aplicarTransformsDasFaces();
  }

  #aplicarTransformsDasFaces() {
    this.#faces.forEach((face, i) => {
      face.style.transform = `rotateY(${i * MediaPrismViewer.#ANGLE_PER_FACE}deg) translateZ(${this.#radius}px)`;
    });
  }

  // ───────────────────────────────────────────────────────────
  // Drag / swipe (Pointer Events)
  // ───────────────────────────────────────────────────────────

  #onPointerDown(e) {
    if (this.#animando) return;
    if (e.target.closest('.pp-prism-close, .pp-prism-actions')) return;
    if (this.#items.length < 2) return;

    this.#dragStart = { x: e.clientX, y: e.clientY, t: performance.now(), captured: false };
    this.#dragLast  = { x: e.clientX, t: this.#dragStart.t };
    this.#dragActive = false;
    this.#pendingAngle = 0;
    try { this.#stage.setPointerCapture?.(e.pointerId); } catch (_) {}
  }

  #onPointerMove(e) {
    if (!this.#dragStart || this.#animando) return;
    const dx = e.clientX - this.#dragStart.x;
    const dy = e.clientY - this.#dragStart.y;

    if (!this.#dragActive) {
      if (Math.abs(dx) < MediaPrismViewer.#DRAG_MIN_PX) return;
      if (Math.abs(dx) <= Math.abs(dy)) return; // gesto vertical: deixa scroll
      if (this.#deleteTimer) { clearTimeout(this.#deleteTimer); this.#deleteTimer = null; }
      this.#dragActive = true;
      this.#cube.classList.add('pp-prism-cube--drag');
    }

    let angulo = (dx / Math.max(this.#faceWidth, 1)) * MediaPrismViewer.#ANGLE_PER_FACE;
    // Sem loop: ângulo negativo = próximo (direita); positivo = anterior (esquerda).
    const noFim    = this.#index >= this.#items.length - 1;
    const noInicio = this.#index <= 0;
    if (noFim && angulo < 0)    angulo = 0; // último: não arrasta mais para a direita
    if (noInicio && angulo > 0) angulo = 0; // primeiro: não arrasta mais para a esquerda
    // Fronteira entre barbearias: no arraste que CRUZA p/ outra barbearia
    // (primeiro/último vídeo da barbearia) o 3D não acontece — a troca é só com
    // a animação de entrada (no soltar). Na outra direção, o 3D segue normal.
    if (angulo < 0 && this.#index + 1 < this.#items.length && this.#cruzaBarbearia(this.#index + 1)) angulo = 0;
    if (angulo > 0 && this.#index - 1 >= 0 && this.#cruzaBarbearia(this.#index - 1)) angulo = 0;
    this.#pendingAngle = angulo;
    this.#dragLast = { x: e.clientX, t: performance.now() };

    if (!this.#dragRAF) {
      this.#dragRAF = requestAnimationFrame(() => {
        this.#dragRAF = 0;
        if (!this.#dragActive) return;
        this.#cube.style.transform = `rotateY(${this.#baseRotation + this.#pendingAngle}deg)`;
      });
    }
  }

  #onPointerUp(e) {
    if (!this.#dragStart) return;
    const inicio = this.#dragStart;
    this.#dragStart = null;

    if (this.#dragRAF) { cancelAnimationFrame(this.#dragRAF); this.#dragRAF = 0; }

    if (!this.#dragActive) {
      // não chegou a virar arrasto — nada a fazer
      return;
    }
    this.#dragActive = false;

    const dx = e.clientX - inicio.x;
    const dt = Math.max(1, performance.now() - (this.#dragLast?.t ?? inicio.t) + 1);
    // Velocidade média da última amostra
    const dxRecente = (e.clientX - (this.#dragLast?.x ?? inicio.x));
    const velocity = dxRecente / dt;

    const threshold = this.#faceWidth * MediaPrismViewer.#THRESHOLD_DIST_RATIO;

    let acao = 'snap';
    if (dx <= -threshold || velocity <= -MediaPrismViewer.#VELOCITY_THRESHOLD) acao = 'next';
    else if (dx >= threshold || velocity >= MediaPrismViewer.#VELOCITY_THRESHOLD) acao = 'prev';

    this.#cube.classList.remove('pp-prism-cube--drag');

    // Sem loop: ignora navegação além das pontas (volta ao lugar).
    const noFim    = this.#index >= this.#items.length - 1;
    const noInicio = this.#index <= 0;
    if (acao === 'next' && noFim)      acao = 'snap';
    if (acao === 'prev' && noInicio)   acao = 'snap';

    if (acao === 'next')      this.#go(1);
    else if (acao === 'prev') this.#go(-1);
    else this.#snapBack();
  }

  #onPointerCancel() {
    if (this.#dragRAF) { cancelAnimationFrame(this.#dragRAF); this.#dragRAF = 0; }
    this.#dragStart = null;
    if (this.#dragActive) {
      this.#dragActive = false;
      this.#cube.classList.remove('pp-prism-cube--drag');
      this.#snapBack();
    }
  }

  #snapBack() {
    if (!this.#cube) return;
    this.#cube.style.transform = `rotateY(${this.#baseRotation}deg)`;
  }

  // ───────────────────────────────────────────────────────────
  // Teclado
  // ───────────────────────────────────────────────────────────

  #handleKey(e) {
    if (this.#overlay?.hidden) return;
    if (e.key === 'Escape')      { e.preventDefault(); this.close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); this.prev(); }
  }

  // ───────────────────────────────────────────────────────────
  // Utilitários
  // ───────────────────────────────────────────────────────────

  static #normalizarOpen(item, items = []) {
    const isConfig = item
      && typeof item === 'object'
      && (Object.prototype.hasOwnProperty.call(item, 'mode')
        || Object.prototype.hasOwnProperty.call(item, 'items')
        || Object.prototype.hasOwnProperty.call(item, 'startIndex'));

    if (isConfig) {
      const lista = Array.isArray(item.items) ? item.items.filter(Boolean) : [];
      const mode = item.mode === 'story' ? 'story' : 'portfolio';
      const rawIndex = Number(item.startIndex ?? 0);
      const startIndex = lista.length
        ? Math.min(Math.max(Number.isFinite(rawIndex) ? rawIndex : 0, 0), lista.length - 1)
        : 0;
      return { mode, items: lista, startIndex };
    }

    const lista = Array.isArray(items) && items.length ? items.filter(Boolean) : (item ? [item] : []);
    const idx = item ? lista.findIndex(i => i?.id && i.id === item.id) : 0;
    return {
      mode: 'portfolio',
      items: lista,
      startIndex: idx >= 0 ? idx : 0,
    };
  }

  #isStoryMode() {
    return this.#mode === 'story';
  }

  static #resolverMediaUrl(item) {
    return item?.fullUrl
      || item?.media_url
      || item?.mediaUrl
      || item?.src
      || item?.url
      || item?.thumbUrl
      || item?.thumbnail_url
      || '';
  }

  static #resolverPosterUrl(item) {
    return item?.thumbUrl
      || item?.thumbnail_url
      || item?.poster
      || item?.posterUrl
      || '';
  }

  static #resolverTitulo(item) {
    return String(item?.title || item?.caption || item?.poster_name || 'Story');
  }

  #limparSlot(slot) {
    const media = slot?.firstElementChild;
    if (media?.tagName === 'VIDEO') {
      try {
        media.pause();
        media.currentTime = 0;
        media.removeAttribute('src');
      } catch (_) {}
    }
    slot?.replaceChildren();
  }

  #mostrarBotaoSom(video) {
    if (!this.#overlay || this.#soundBtn) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sv-sound-btn pp-prism-sound-btn';
    btn.textContent = '🔊 Tocar com som';
    btn.addEventListener('click', () => {
      video.muted = false;
      video.play?.().then(() => this.#removerBotaoSom()).catch(() => {});
    }, { once: true });
    this.#overlay.appendChild(btn);
    this.#soundBtn = btn;
  }

  #removerBotaoSom() {
    this.#soundBtn?.remove();
    this.#soundBtn = null;
  }

  #limparTimer() {
    if (this.#finalizeTimer) { clearTimeout(this.#finalizeTimer); this.#finalizeTimer = null; }
  }

  #itemAtual() {
    return this.#items[this.#index] ?? {};
  }

  async #handlePublicLike() {
    const item = this.#itemAtual();
    if (!item?.portfolioPublicActions || !item?.id) return;
    if (typeof BffApiService === 'undefined') return;

    // Cada usuário só pode curtir UMA vez — se já curtiu, ignora o clique
    if (Boolean(item.liked)) return;

    const countAntes = Math.max(0, Number(item.likesCount ?? item.likes_count ?? 0));
    const countNovo  = countAntes + 1;

    item.liked = true;
    item.likesCount = countNovo;
    this.#renderFaces();

    const faceBtn = this.#faceLikeBtns[MediaPrismViewer.#FACE_OFFSETS.indexOf(0)];
    if (faceBtn) faceBtn.disabled = true;

    const perfil = MediaPrismViewer.#perfilAtual();
    try {
      // Apenas curtir — sem descurtir (1 curtida por usuário por imagem)
      const { data, error } = await BffApiService.profissionais.curtirPortfolioImagem(item.id);
      if (error) throw error;
      if (data?.likesCount !== undefined && data?.likesCount !== null) {
        const serverCount = Math.max(0, Number(data.likesCount));
        item.likesCount = serverCount < countNovo ? countNovo : serverCount;
      }
      item.liked = true;
      this.#renderFaces();
      MediaPrismViewer.#dispatchLike(item.id, item.likesCount, true);
      this.#emitInteraction({ texto: '👍', perfil, type: 'like' });
    } catch {
      item.liked      = false;
      item.likesCount = countAntes;
      this.#renderFaces();
    } finally {
      if (faceBtn) faceBtn.disabled = false;
    }
  }

  async #handlePublicMessage(body) {
    // INÍCIO ALTERAÇÃO - Mensagens da modal de imagem
    // Correção: persistir mensagem em item.interactions após envio bem-sucedido,
    // garantindo que a mensagem reapareça ao retornar para a mesma imagem.
    const item = this.#itemAtual();
    const texto = String(body ?? '').trim();
    if (!item?.portfolioPublicActions || !item?.professionalId || !texto) return;
    if (Array.from(texto).length > MediaPrismViewer.#PUBLIC_MESSAGE_MAX_LENGTH) {
      this.#emitInteraction({ texto: '✗ Máximo 20 caracteres', perfil: null });
      return;
    }
    if (typeof BffApiService === 'undefined') return;

    const perfil = MediaPrismViewer.#perfilAtual();
    const payload = {
      body: texto,
      portfolioImageId: item.id,
      clientMessageId: MediaPrismViewer.#clientMessageId(),
    };

    if (this.#publicInput)   this.#publicInput.disabled   = true;
    if (this.#publicSendBtn) this.#publicSendBtn.disabled  = true;
    this.#publicEmojis.forEach(btn => { btn.disabled = true; });
    try {
      const { error } = await BffApiService.profissionais.iniciarMensagemBarbearia(item.professionalId, payload);
      if (error) throw error;
      if (this.#publicInput) this.#publicInput.value = '';
      const tipo = MediaPrismViewer.#isEmojiText(texto) ? 'emoji' : 'message';
      this.#emitInteraction({ texto, perfil, type: tipo });

      // Persiste a mensagem localmente para que ela seja reproduzida ao
      // retornar para esta imagem na mesma sessão do viewer.
      if (!Array.isArray(item.interactions)) item.interactions = [];
      const avatarUrl = perfil?.avatar_path
        ? ((typeof ApiService !== 'undefined' && ApiService.getAvatarUrl)
            ? ApiService.getAvatarUrl(perfil.avatar_path)
            : null)
        : null;
      item.interactions.push({
        type: tipo,
        body: texto,
        sender: {
          id:        perfil?.id        ?? null,
          nome:      perfil?.full_name ?? '',
          avatarUrl: avatarUrl,
        },
      });
    } catch (err) {
      let textoErro = '✗ Falha ao enviar';
      if (err?.status === 429) {
        textoErro = '✗ Limite atingido';
      } else if (String(err?.message ?? '').includes('nao permitida')) {
        textoErro = '✗ Conteúdo bloqueado';
      } else if (String(err?.message ?? '').includes('Máximo')) {
        textoErro = '✗ Mensagem muito grande';
      }
      this.#emitInteraction({ texto: textoErro, perfil: null });
    } finally {
      if (this.#publicInput)   this.#publicInput.disabled   = false;
      if (this.#publicSendBtn) this.#publicSendBtn.disabled  = false;
      this.#publicEmojis.forEach(btn => { btn.disabled = false; });
    }
    // FIM ALTERAÇÃO
  }

  /** Obtém perfil do usuário logado (best-effort). */
  static #perfilAtual() {
    try {
      return (typeof AuthService !== 'undefined') ? (AuthService.getPerfil?.() ?? null) : null;
    } catch { return null; }
  }

  /** Dispatch evento global para sincronizar contadores de curtida. */
  static #dispatchLike(imageId, likesCount, liked) {
    try {
      document.dispatchEvent(new CustomEvent('barberflow:portfolio-like', {
        detail: { imageId, likesCount, liked: Boolean(liked) },
        bubbles: false,
      }));
    } catch { /* best-effort */ }
  }

  /**
   * Cria e anima um float com avatar + nome + texto sobre a imagem.
   * @param {{ texto: string, perfil: object|null }} opts
   */
  #replayInteractions(item) {
    this.#limparInteracoes();
    const interactions = MediaPrismViewer.#normalizarInteracoes(item);
    interactions.forEach((interaction, index) => {
      const timer = setTimeout(() => {
        this.#floatTimers.delete(timer);
        this.#emitInteraction(interaction);
      }, Math.min(index * 220, 4800));
      this.#floatTimers.add(timer);
    });
  }

  #emitInteraction({ texto, perfil, sender, type = 'message' } = {}) {
    if (!this.#reactionLayer) return;

    const textoSeg = String(texto ?? '').slice(0, 80);
    const nome     = String(sender?.nome ?? perfil?.full_name ?? '').trim().slice(0, 30);
    const avatarPath = perfil?.avatar_path ?? null;
    const avatarUrl  = sender?.avatarUrl
      || ((avatarPath && typeof ApiService !== 'undefined' && ApiService.getAvatarUrl)
        ? ApiService.getAvatarUrl(avatarPath) : null);
    const tipo = ['emoji', 'like'].includes(type) ? type : 'message';

    const el = document.createElement('div');
    el.className = MediaPrismViewer.#floatClass(tipo);
    el.style.setProperty(
      '--pp-prism-float-stack',
      String(this.#floatSequence % MediaPrismViewer.#FLOAT_STACK_SIZE),
    );
    this.#floatSequence += 1;

    if (tipo === 'message' && (avatarUrl || nome)) {
      const avatar = document.createElement('img');
      avatar.className = 'pp-prism-float__avatar';
      avatar.alt = nome || '';
      avatar.loading = 'lazy';
      if (avatarUrl) {
        avatar.src = avatarUrl;
      } else {
        avatar.hidden = true;
      }
      avatar.onerror = () => { avatar.hidden = true; };

      const info = document.createElement('span');
      info.className = 'pp-prism-float__info';
      if (nome) {
        const nomeEl = document.createElement('strong');
        nomeEl.className = 'pp-prism-float__nome';
        nomeEl.textContent = nome;
        info.appendChild(nomeEl);
      }
      const bodyEl = document.createElement('span');
      bodyEl.className = 'pp-prism-float__texto';
      bodyEl.textContent = textoSeg;
      info.appendChild(bodyEl);

      el.append(avatar, info);
    } else {
      el.textContent = textoSeg;
    }

    this.#reactionLayer.appendChild(el);
    const remover = () => {
      el.remove();
      if (timer) this.#floatTimers.delete(timer);
    };
    el.addEventListener('animationend', remover, { once: true });
    const timer = setTimeout(remover, 2400);
    this.#floatTimers.add(timer);
  }

  static #floatClass(type) {
    if (type === 'emoji') return 'pp-prism-float pp-prism-float--emoji';
    if (type === 'like') return 'pp-prism-float pp-prism-float--like';
    return 'pp-prism-float pp-prism-float--message';
  }

  static #normalizarInteracoes(item) {
    const base = Array.isArray(item?.interactions) ? item.interactions : [];
    const normalizadas = [];
    for (const interaction of base) {
      const type = MediaPrismViewer.#normalizarTipo(interaction?.type, interaction?.body);
      const count = Math.max(1, Number(interaction?.count ?? 1));
      const texto = String(interaction?.body ?? (type === 'like' ? '👍' : '')).trim();
      if (!texto) continue;
      if (type === 'like') {
        const total = Math.min(count, 24);
        for (let i = 0; i < total; i += 1) {
          normalizadas.push({ type: 'like', texto: '👍' });
        }
        continue;
      }
      normalizadas.push({
        type,
        texto,
        sender: interaction?.sender ?? null,
      });
    }

    const likesCount = Math.max(0, Number(item?.likesCount ?? item?.likes_count ?? 0));
    const temLike = base.some(interaction => interaction?.type === 'like');
    if (likesCount > 0 && !temLike) {
      const total = Math.min(likesCount, 24);
      for (let i = 0; i < total; i += 1) normalizadas.push({ type: 'like', texto: '👍' });
    }
    return normalizadas;
  }

  static #normalizarTipo(type, body) {
    if (type === 'like') return 'like';
    if (type === 'emoji' || MediaPrismViewer.#isEmojiText(body)) return 'emoji';
    return 'message';
  }

  static #isEmojiText(value) {
    const texto = String(value ?? '').trim();
    return Boolean(texto) && texto.length <= 12 && /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u.test(texto);
  }

  #limparInteracoes() {
    this.#reactionLayer?.replaceChildren();
    this.#floatTimers.forEach(timer => clearTimeout(timer));
    this.#floatTimers.clear();
    this.#floatSequence = 0;
  }

  static #clientMessageId() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) {}
    return `portfolio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  static #laughEmoji() {
    return '\u{1F602}';
  }

  static #sadEmoji() {
    return '\u{1F622}';
  }

  // ───────────────────────────────────────────────────────────
  // Bootstrap DOM
  // ───────────────────────────────────────────────────────────

  #ensure() {
    if (this.#overlay) return;

    const overlay = document.createElement('div');
    overlay.className = 'pp-prism-viewer';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-hidden', 'true');

    const facesHtml = Array.from({ length: MediaPrismViewer.#SIDES }, (_, i) =>
      `<figure class="pp-prism-face" data-face="${i}"><div class="pp-prism-media"></div><div class="pp-prism-progress" aria-hidden="true"></div><button type="button" class="pp-prism-face-close pp-prism-close" aria-label="Fechar">×</button><div class="pp-prism-face-overlay"><div class="pp-prism-face-identity"><img class="pp-prism-face-id-img" alt="" loading="lazy"><span class="pp-prism-face-id-name"></span></div><button type="button" class="pp-prism-face-like-btn" hidden aria-label="Curtir" aria-pressed="false"><span class="pp-prism-face-like-icon" aria-hidden="true">💎</span><span class="pp-prism-face-like-count"></span></button></div></figure>`
    ).join('');

    overlay.innerHTML = `
      <button type="button" class="pp-prism-close" aria-label="Fechar">×</button>
      <div class="pp-prism-stage" aria-live="polite">
        <div class="pp-prism-cube">${facesHtml}</div>
        <div class="pp-prism-reactions" aria-hidden="true"></div>
      </div>
      <div class="pp-prism-public-actions" hidden>
        <img class="pp-prism-public-logo" src="/shared/img/icon-512-cliente.png" alt="BarberFlow" loading="lazy">
        <div class="pp-prism-message-wrap">
          <input class="pp-prism-message-input" type="text" maxlength="${MediaPrismViewer.#PUBLIC_MESSAGE_MAX_LENGTH}" aria-label="Mensagem">
          <button type="button" class="pp-prism-message-send" aria-label="Enviar mensagem"><span aria-hidden="true">➤</span></button>
        </div>
        <button type="button" class="pp-prism-public-emoji" data-public-emoji="${MediaPrismViewer.#laughEmoji()}" aria-label="Enviar risada">${MediaPrismViewer.#laughEmoji()}</button>
        <button type="button" class="pp-prism-public-emoji" data-public-emoji="${MediaPrismViewer.#sadEmoji()}" aria-label="Enviar tristeza">${MediaPrismViewer.#sadEmoji()}</button>
      </div>
      <figcaption class="pp-prism-title"></figcaption>
      <div class="pp-prism-actions"></div>
    `;

    document.body.appendChild(overlay);

    this.#overlay = overlay;
    this.#stage   = overlay.querySelector('.pp-prism-stage');
    this.#cube    = overlay.querySelector('.pp-prism-cube');
    this.#faces   = [...overlay.querySelectorAll('.pp-prism-face')];
    this.#medias  = this.#faces.map(f => f.querySelector('.pp-prism-media'));
    this.#meta    = null;
    this.#avatar  = null;
    this.#name    = null;
    this.#likes   = null;
    this.#title   = overlay.querySelector('.pp-prism-title');
    this.#actions = overlay.querySelector('.pp-prism-actions');
    this.#publicActions = overlay.querySelector('.pp-prism-public-actions');
    this.#publicInput   = overlay.querySelector('.pp-prism-message-input');
    this.#publicSendBtn = overlay.querySelector('.pp-prism-message-send');
    this.#publicLike    = null;
    this.#publicLogo    = overlay.querySelector('.pp-prism-public-logo');
    this.#publicEmojis = [...overlay.querySelectorAll('.pp-prism-public-emoji')];
    this.#reactionLayer = overlay.querySelector('.pp-prism-reactions');

    // Referências para overlay dentro de cada face
    this.#faceIdentityImgs  = this.#faces.map(f => f.querySelector('.pp-prism-face-id-img'));
    this.#faceIdentityNames = this.#faces.map(f => f.querySelector('.pp-prism-face-id-name'));
    this.#faceLikeBtns      = this.#faces.map(f => f.querySelector('.pp-prism-face-like-btn'));
    this.#faceLikeCounts    = this.#faces.map(f => f.querySelector('.pp-prism-face-like-count'));
    this.#faceProgress      = this.#faces.map(f => f.querySelector('.pp-prism-progress'));

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('.pp-prism-close')) this.close();
    });

    this.#stage?.addEventListener('pointerdown',   e => this.#onPointerDown(e));
    this.#stage?.addEventListener('pointermove',   e => this.#onPointerMove(e));
    this.#stage?.addEventListener('pointerup',     e => this.#onPointerUp(e));
    this.#stage?.addEventListener('pointercancel', () => this.#onPointerCancel());
    this.#stage?.addEventListener('lostpointercapture', () => this.#onPointerCancel());

    // Long-press no vídeo em reprodução para deletar (só story mode, só dono)
    this.#cube?.addEventListener('pointerdown', e => {
      if (!this.#isStoryMode()) return;
      const item = this.#items[this.#index];
      if (!item?.can_delete) return;
      this.#deleteTimer = setTimeout(() => this.#handleDeleteStory(), 600);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => {
      this.#cube?.addEventListener(type, () => {
        if (this.#deleteTimer) { clearTimeout(this.#deleteTimer); this.#deleteTimer = null; }
      });
    });

    // Like dentro das faces 3D (gira com o cubo)
    this.#cube?.addEventListener('click', e => {
      const btn = e.target.closest('.pp-prism-face-like-btn');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.#isStoryMode()) {
        this.#handleStoryLike();
      } else {
        this.#handlePublicLike();
      }
    });

    // Sinal de retorno do like de story (StoryViewer atualizou item por referência)
    document.addEventListener('barberflow:prism-story-like-done', () => {
      if (this.#overlay?.hidden || !this.#isStoryMode()) return;
      this.#renderFaces();
    });

    this.#publicActions?.addEventListener('click', e => {
      const emojiBtn = e.target.closest('.pp-prism-public-emoji');
      if (emojiBtn) {
        e.preventDefault();
        const texto = emojiBtn.dataset.publicEmoji || MediaPrismViewer.#laughEmoji();
        if (this.#isStoryMode()) this.#handleStoryMessage(texto);
        else this.#handlePublicMessage(texto);
      }
    });

    this.#publicInput?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (this.#isStoryMode()) this.#handleStoryMessage(this.#publicInput.value);
      else this.#handlePublicMessage(this.#publicInput.value);
    });

    this.#publicSendBtn?.addEventListener('click', e => {
      e.preventDefault();
      if (!this.#publicInput) return;
      if (this.#isStoryMode()) this.#handleStoryMessage(this.#publicInput.value);
      else this.#handlePublicMessage(this.#publicInput.value);
    });

    // Listener externo: re-renderiza se um evento global atualizar a contagem desta imagem
    document.addEventListener('barberflow:portfolio-like', e => {
      if (this.#overlay?.hidden) return;
      const { imageId, likesCount, liked } = e.detail ?? {};
      if (!imageId) return;
      const item = this.#items.find(i => i?.id === imageId);
      if (!item) return;
      item.liked      = Boolean(liked);
      item.likesCount = Math.max(0, Number(likesCount ?? 0));
      if (this.#items[this.#index]?.id === imageId) {
        this.#renderPublicActions(item);
        this.#renderFaces();
      }
    });

    // ResizeObserver — recalcula raio quando o stage mudar de tamanho
    if (typeof ResizeObserver !== 'undefined' && this.#stage) {
      this.#resizeObserver = new ResizeObserver(() => {
        if (this.#overlay?.hidden) return;
        this.#medirStage();
      });
      this.#resizeObserver.observe(this.#stage);
    }
  }
}

class PortfolioPrismViewer {
  #viewer = null;

  constructor() {
    this.#viewer = new MediaPrismViewer();
  }

  static get() {
    return MediaPrismViewer.get();
  }

  static open(item, items = []) {
    const lista = Array.isArray(items) && items.length ? items : (item ? [item] : []);
    const idx = item ? lista.findIndex(i => i?.id && i.id === item.id) : 0;
    return MediaPrismViewer.get().open({
      mode: 'portfolio',
      items: lista,
      startIndex: idx >= 0 ? idx : 0,
    });
  }

  open(item, items = []) {
    if (item && typeof item === 'object' && (item.mode === 'story' || item.mode === 'portfolio')) {
      return this.#viewer.open(item);
    }
    return this.#viewer.open({ mode: 'portfolio', items: Array.isArray(items) && items.length ? items : (item ? [item] : []), startIndex: this.#resolverIndice(item, items) });
  }

  close() {
    return this.#viewer.close();
  }

  next() {
    return this.#viewer.next();
  }

  prev() {
    return this.#viewer.prev();
  }

  #resolverIndice(item, items) {
    const lista = Array.isArray(items) && items.length ? items : (item ? [item] : []);
    const idx = item ? lista.findIndex(i => i?.id && i.id === item.id) : 0;
    return idx >= 0 ? idx : 0;
  }
}
