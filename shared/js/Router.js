'use strict';

/**
 * BarberFlow — Base SPA Router
 *
 * Classe base para navegação tipo SPA.
 * Estenda e implemente o getter `telasComNav`
 * para definir em quais telas o footer aparece.
 *
 * @abstract
 */
class Router {
  _telaAtual    = '';
  _historico    = [];
  _footer       = null;
  _footerOffline = null;
  _navBtns      = [];
  _logado       = false;

  /** Telas que exibem o footer completo (logado). @returns {Set<string>} */
  get telasComNav() { return new Set([]); }

  /** Telas que exibem o footer offline (sem login). @returns {Set<string>} */
  get telasOffline() { return new Set(['inicio', 'pesquisa']); }

  /**
   * @param {string} telaInicial — ID da tela exibida no boot (sem prefixo "tela-")
   */
  constructor(telaInicial = 'login') {
    this._footer        = document.getElementById('footer-nav');
    this._footerOffline = document.getElementById('footer-nav-offline');
    this._navBtns       = Array.from(document.querySelectorAll('.nav-btn'));

    // Oculta ambos os footers inicialmente
    if (this._footer)        this._footer.style.display        = 'none';
    if (this._footerOffline) this._footerOffline.style.display = 'none';

    this._telaAtual = telaInicial;

    document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
    // Home fica sempre visível por CSS; não precisa de .ativa
    if (telaInicial !== 'inicio') {
      const telaEl = document.getElementById(`tela-${telaInicial}`);
      if (telaEl) telaEl.classList.add('ativa');
    }

    this._atualizarUI(telaInicial);
    this._bindLoginEvent();

    // Remove boot-lock e libera o CSS normal
    document.getElementById('boot-lock')?.remove();

    // Restaura estado correto quando a página volta do bfcache
    window.addEventListener('pageshow', (e) => {
      if (!e.persisted) return;

      // Cancela animações em curso e reseta todas as telas para o estado inicial
      document.querySelectorAll('.tela').forEach(t => {
        t.getAnimations().forEach(a => a.cancel());
        t.classList.remove('ativa', 'entrando-lento', 'saindo', 'saindo-direita');
        t.style.display       = '';
        t.style.pointerEvents = '';
        t.style.transform     = '';
      });

      // Volta sempre para o home — nunca exibe login ou outra tela no retorno
      this._telaAtual   = 'inicio';
      this._historico   = [];
      this._navegandoApp = false;
      this._atualizarUI('inicio');
    });
  }

  /** Marca o usuario como logado e re-renderiza o footer. */
  entrar() {
    this._logado = true;
    this._atualizarUI(this._telaAtual);
  }

  /** Marca o usuario como deslogado e re-renderiza o footer. */
  sair() {
    this._logado = false;
    this._atualizarUI(this._telaAtual);
  }

  /**
   * Confirma o logout via LogoutScreen (POO):
   * tela-sair + footer logado → saem pela DIREITA
   * footer deslogado → entra pela ESQUERDA
   * Chamado pelo botão central da tela-sair.
   */
  confirmarSaida() {
    LogoutScreen.executar(this);
  }

  /**
   * ÚNICO método responsável por toda animação de transição entre telas.
   * Usa Web Animations API (WAAPI) para animação interruptível e fluida:
   *  - Lê a posição atual do elemento antes de cancelar qualquer animação em andamento
   *  - Anima DE onde o elemento está (não do início absoluto)
   *  - Sem opacity — aba permanece totalmente visível durante o slide
   *  - Duração proporcional ao deslocamento restante
   *
   * @param {HTMLElement|null} saindo    — Tela que sai (null = home, não anima)
   * @param {HTMLElement|null} entrando  — Tela que entra (null = home, não anima)
   * @param {'saindo'|'saindo-direita'}  classeSaida   — Direção da saída
   * @param {'ativa'|'entrando-lento'}   classeEntrada — Velocidade de entrada
   * @private
   */
  _animar(saindo, entrando, classeSaida = 'saindo', classeEntrada = 'ativa') {
    const EASE = 'cubic-bezier(0.4,0,0.2,1)';

    /**
     * Lê o translateX atual do elemento em percentual relativo à sua largura.
     * Funciona mesmo enquanto uma animação WAAPI está rodando.
     * @param {HTMLElement} el
     * @returns {number} valor em % (ex: -60.0 significa 60% fora pela esquerda)
     */
    const _xAtual = (el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return el.offsetWidth ? (m.m41 / el.offsetWidth) * 100 : 0;
    };

    // ── Tela que SAI ────────────────────────────────────────────────────────
    if (saindo) {
      const fromX = _xAtual(saindo);                        // posição atual
      const toX   = classeSaida === 'saindo-direita' ? 100 : -100;
      const dist  = Math.abs(toX - fromX) / 100;            // 0..1
      const dur   = Math.round(480 * dist);

      // Cancela qualquer animação em curso — captura de posição já foi feita
      saindo.getAnimations().forEach(a => a.cancel());
      saindo.classList.remove('ativa', 'entrando-lento', 'saindo', 'saindo-direita');

      if (dur < 16) {
        // Já está fora da tela — apenas oculta imediatamente
        saindo.style.display       = 'none';
        saindo.style.pointerEvents = '';
      } else {
        saindo.style.display       = 'flex';
        saindo.style.pointerEvents = 'none';

        const a = saindo.animate(
          [
            { transform: `translateX(${fromX.toFixed(2)}%)` },
            { transform: `translateX(${toX}%)`               }
          ],
          { duration: dur, easing: EASE, fill: 'both' }
        );

        a.onfinish = () => {
          a.cancel();                      // libera fill:both
          saindo.style.display       = 'none';
          saindo.style.pointerEvents = '';
        };
        // oncancel: nova animação (re-abertura) assume o controle — sem cleanup aqui
      }
    }

    // ── Tela que ENTRA ───────────────────────────────────────────────────────
    if (entrando) {
      // Se inline display='flex' → animação estava em andamento (entrada ou saída)
      // Lê posição atual para continuar de onde parou (interrupção fluida)
      // Se oculta (display:none via CSS) → começa do off-screen esquerda (-100%)
      const isVisible = entrando.style.display === 'flex';
      const fromX     = isVisible ? _xAtual(entrando) : -100;
      const baseDur   = classeEntrada === 'entrando-lento' ? 720 : 320;
      const dist      = Math.abs(fromX) / 100;              // distância até 0%
      const dur       = Math.round(baseDur * dist);

      // Cancela qualquer animação em curso
      entrando.getAnimations().forEach(a => a.cancel());
      entrando.classList.remove('saindo', 'saindo-direita', 'ativa', 'entrando-lento');
      entrando.style.display = 'flex';
      void entrando.offsetWidth;                            // força reflow

      if (dur < 16) {
        // Já está na posição correta — apenas marca como ativa
        entrando.style.display = '';
        entrando.classList.add('ativa');
      } else {
        const a = entrando.animate(
          [
            { transform: `translateX(${fromX.toFixed(2)}%)` },
            { transform: 'translateX(0%)'                    }
          ],
          { duration: dur, easing: EASE, fill: 'both' }
        );

        a.onfinish = () => {
          a.cancel();                        // libera fill:both — devolve ao CSS
          entrando.style.display = '';       // .ativa gerencia display:flex
          entrando.classList.add('ativa');
        };
        // oncancel: animação de saída (toggle/voltar) assume o controle — sem cleanup
      }
    }
  }

  /**
   * Navega para a tela indicada.
   * @param {string} tela — ID sem prefixo "tela-"
   */
  nav(tela) {
    // Toggle: clicou no ícone da aba já aberta → fecha pela ESQUERDA (igual a voltar)
    if (tela === this._telaAtual && tela !== 'inicio') {
      const atual = document.getElementById(`tela-${this._telaAtual}`);
      this._historico = [];          // limpa histórico — volta pra home
      this._telaAtual = 'inicio';
      this._atualizarUI('inicio');
      this._animar(atual, null, 'saindo');  // sai pela esquerda, home já está embaixo
      return;
    }
    if (tela === this._telaAtual) return;

    const destino = document.getElementById(`tela-${tela}`);
    if (!destino) { console.warn(`[BarberFlow] Tela "${tela}" não encontrada.`); return; }

    const telaAnterior = this._telaAtual;
    const atual = document.getElementById(`tela-${telaAnterior}`);

    this._historico.push(telaAnterior);
    this._telaAtual = tela;
    this._atualizarUI(tela);

    // Home é base fixa — nunca anima saída
    // Aba já aberta → carrossel: atual sai DIREITA (lento), nova entra ESQUERDA (lento)
    // Vindo da home  → nova entra pela ESQUERDA normalmente (sem exit)
    const carrossel = telaAnterior !== 'inicio';
    this._animar(
      carrossel       ? atual   : null,
      tela !== 'inicio' ? destino : null,
      carrossel       ? 'saindo-direita' : 'saindo',
      carrossel       ? 'entrando-lento' : 'ativa'
    );
  }

  /** Fecha a aba atual e volta sempre para o home.
   *  A aba sai pela ESQUERDA — NUNCA alterar isso.
   *  O histórico é limpo para que nenhuma aba anterior reapareça.
   */
  voltar() {
    if (this._telaAtual === 'inicio') return;

    const telaAtual = this._telaAtual;
    const atual = document.getElementById(`tela-${telaAtual}`);

    // Limpa histórico — garante que nada do passado remerge
    this._historico = [];
    this._telaAtual = 'inicio';
    this._atualizarUI('inicio');

    // Aba atual sai pela ESQUERDA — NUNCA mudar isso
    // Home já está por baixo — sem animação de entrada
    this._animar(
      telaAtual !== 'inicio' ? atual : null,
      null,     // home não anima — já está lá
      'saindo', // aba sai pela ESQUERDA — NUNCA mudar
      'ativa'   // ignorado pois destino é null
    );
  }

  /**
   * Navega para uma tela irmã no fluxo de auth (ex: login → cadastro).
   * @param {string} tela
   */
  push(tela) {
    if (tela === this._telaAtual) return;

    const destino = document.getElementById(`tela-${tela}`);
    if (!destino) { console.warn(`[BarberFlow] Tela "${tela}" não encontrada.`); return; }

    const telaAnterior = this._telaAtual;
    const atual = document.getElementById(`tela-${telaAnterior}`);

    this._historico.push(telaAnterior);
    this._telaAtual = tela;
    this._atualizarUI(tela);

    // Fluxo de auth (login ↔ cadastro ↔ esqueceu-senha):
    // atual sai pela DIREITA, nova entra pela ESQUERDA — padrão carrossel
    this._animar(
      telaAnterior !== 'inicio' ? atual   : null,
      tela         !== 'inicio' ? destino : null,
      'saindo-direita',
      'entrando-lento'
    );
  }

  /**
   * Sincroniza visibilidade dos footers e estado ativo dos botões.
   * - Logado:        footer completo nas telasComNav
   * - Não logado:    footer offline (3 botões) nas telasOffline
   * @param {string} tela
   * @private
   */
  _atualizarUI(tela) {
    const mostrarCompleto = this._logado && this.telasComNav.has(tela);
    if (this._footer)        this._footer.style.display        = mostrarCompleto ? 'flex' : 'none';
    if (this._footerOffline) this._footerOffline.style.display = mostrarCompleto ? 'none' : 'flex';

    this._navBtns.forEach(btn =>
      btn.classList.toggle('ativo', btn.dataset.tela === tela)
    );
    document.querySelectorAll('.menu-nav-item[data-tela]').forEach(item =>
      item.classList.toggle('ativo', item.dataset.tela === tela)
    );
  }

  /* ─────────────────────────────────────────────────────────────
     MENU DRAWER
  ───────────────────────────────────────────────────────────── */

  toggleMenu() {
    const drawer = document.getElementById('menu-drawer');
    if (!drawer) return;
    drawer.classList.contains('aberto') ? this.fecharMenu() : this._abrirMenu();
  }

  _abrirMenu() {
    document.getElementById('menu-drawer')?.classList.add('aberto');
    document.getElementById('menu-overlay')?.classList.add('ativo');
    const btn = document.querySelector('.header-menu-btn');
    if (btn) btn.classList.add('menu-aberto');
    const icon = document.getElementById('icon-menu');
    if (icon) icon.src = '/shared/img/icones-menu-fechado.png';
  }

  fecharMenu() {
    document.getElementById('menu-drawer')?.classList.remove('aberto');
    document.getElementById('menu-overlay')?.classList.remove('ativo');
    const btn = document.querySelector('.header-menu-btn');
    if (btn) btn.classList.remove('menu-aberto');
    const icon = document.getElementById('icon-menu');
    if (icon) icon.src = '/shared/img/icones-menu.png';
  }

  /**
   * Fecha o menu hamburguer e navega para a tela indicada com a
   * MESMA animação do botão equivalente no rodapé.
   *
   * Usa `transitionend` no drawer como gatilho preciso — garante
   * que o menu está 100% fechado antes de a animação de tela iniciar.
   *
   * @param {string} tela — ID sem prefixo "tela-"
   */
  navDoMenu(tela) {
    const drawer = document.getElementById('menu-drawer');

    // Drawer inexistente ou já fechado → navega imediatamente
    if (!drawer || !drawer.classList.contains('aberto')) {
      this.nav(tela);
      return;
    }

    // Aguarda apenas a transição de `transform` (ignora `box-shadow`)
    const _onFim = (e) => {
      if (e.propertyName !== 'transform') return;
      drawer.removeEventListener('transitionend', _onFim);
      this.nav(tela);
    };
    drawer.addEventListener('transitionend', _onFim);
    this.fecharMenu();
  }

  /* ─────────────────────────────────────────────────────────────
     STORIES — CURTIDA E VÍDEO
  ───────────────────────────────────────────────────────────── */

  toggleLike(btn) {
    btn.classList.toggle('curtido');
    const span = btn.querySelector('.story-like-count');
    const n = parseInt(span.textContent) || 0;
    span.textContent = btn.classList.contains('curtido') ? n + 1 : n - 1;
  }

  toggleStoryVideo(wrap) {
    const video = wrap.querySelector('.story-video');
    const play  = wrap.querySelector('.story-play-btn');
    if (video.paused) { video.play();  play.classList.add('playing'); }
    else              { video.pause(); play.classList.remove('playing'); }
  }

  /* ─────────────────────────────────────────────────────────────
     AVATAR — PREVIEW E UPLOAD
  ───────────────────────────────────────────────────────────── */

  previewAvatar(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    // 1. Preview instantâneo (antes do upload)
    const localUrl = URL.createObjectURL(file);
    ['menu-avatar-img', 'header-avatar-img'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.src = localUrl;
      el.style.filter  = 'none';
      el.style.opacity = '1';
    });

    // 2. Upload assíncrono para Supabase Storage
    this._uploadAvatar(file);
  }

  async _uploadAvatar(file) {
    try {
      const user = await SupabaseService.getUser();
      if (!user) return;

      // Comprime para máx 512KB antes de enviar
      const blob = await this._comprimirImagem(file, 512);

      const ext  = file.name.split('.').pop().toLowerCase().replace('jpg','jpeg');
      const path = `${user.id}/avatar.${ext}`;

      // Faz o upload (upsert — substitui se já existir)
      const { error: upErr } = await SupabaseService.client.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: blob.type });

      if (upErr) throw upErr;

      // Atualiza o avatar_path no profile
      await SupabaseService.client
        .from('profiles')
        .update({ avatar_path: path, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      // Substitui o preview local pela URL pública definitiva
      const { data } = SupabaseService.client.storage.from('avatars').getPublicUrl(path);
      const publicUrl = data.publicUrl + '?t=' + Date.now(); // cache-bust
      ['menu-avatar-img', 'header-avatar-img'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.src = publicUrl;
      });

      // Persiste a URL no cache local para carregamento imediato no próximo acesso
      if (typeof SessionCache !== 'undefined') SessionCache.salvarAvatar(publicUrl);

    } catch (e) {
      console.warn('[Avatar] Erro no upload:', e.message);
    }
  }

  async _comprimirImagem(file, maxKB) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const MAX = maxKB * 1024;
        let w = img.width, h = img.height;
        const max = 600;
        if (w > max || h > max) {
          const r = Math.min(max / w, max / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => resolve(b || file), 'image/jpeg', 0.82);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  abrirUploadAvatar() {
    const logado = !!(typeof AuthService !== 'undefined'
      ? AuthService.getPerfil()
      : this._logado);
    if (!logado) { this.fecharMenu(); this.nav('login'); return; }
    document.getElementById('menu-avatar-input').click();
  }

  /* ─────────────────────────────────────────────────────────────
     EVENTO: LOGIN — atualiza header e menu com nome do usuário
  ───────────────────────────────────────────────────────────── */

  _bindLoginEvent() {
    document.addEventListener('barberflow:login', e => {
      const { nome } = e.detail || {};
      if (nome) {
        const usernameEl = document.getElementById('menu-username');
        if (usernameEl) usernameEl.childNodes[0].nodeValue = nome + ' ';
        const subEl = document.getElementById('menu-user-sub');
        if (subEl) subEl.textContent = 'Bem-vindo(a)!';
        const labelEl = document.getElementById('header-user-label');
        if (labelEl) {
          const primeiro = nome.split(' ')[0];
          labelEl.textContent = 'Olá, ' + (primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase());
        }
      }
      document.getElementById('header-avatar-btn')?.classList.add('logado');
      document.getElementById('menu-avatar')?.classList.add('logado');
    });
  }

  /* ─────────────────────────────────────────────────────────────
     SPLASH — transição entre apps (BarberPole compacto)
  ───────────────────────────────────────────────────────────── */

  /**
   * Exibe splash com BarberPole e navega ao destino ao fim.
   * Detecta automaticamente o nome do app pelo URL de destino.
   * @param {string} url — caminho destino (ex: '../profissional/')
   */
  navegarApp(url) {
    if (this._navegandoApp) return;
    this._navegandoApp = true;

    // Detecta o app destino pelo URL:
    // URL com 'cliente' → CLIENTE; qualquer outro (pro / profissional / pro-two) → PROFISSIONAL
    const tipo = url.toLowerCase().includes('cliente') ? 'CLIENTE' : 'PROFISSIONAL';
    const sep  = url.includes('?') ? '&' : '?';
    const dest = `${url}${sep}t=${Date.now()}`;

    this._exibirSplash(tipo, () => window.location.replace(dest));
  }

  /**
   * Monta o overlay splash compacto (mobile-first) com BarberPole.
   * @param {string}   tipo   — 'PROFISSIONAL' | 'CLIENTE'
   * @param {Function} [onFim] — callback após fade-out
   * @private
   */
  _exibirSplash(tipo, onFim = null) {
    if (document.querySelector('.splash-overlay')) return;

    // Textos de boas-vindas diferenciados por app
    const bv = tipo === 'PROFISSIONAL'
      ? { linha1: 'Bem-vindo,', linha2: 'BarberFlow PROFISSIONAL' }
      : { linha1: 'Bem-vindo ao', linha2: 'BarberFlow CLIENTE' };

    const overlay = document.createElement('div');
    overlay.className = 'splash-overlay';
    overlay.innerHTML = `
      <img class="splash-logo-nome" src="/shared/img/LogoNomeBarberFlow.png" alt="BarberFlow">
      <p class="splash-app">${bv.linha1} <strong>${bv.linha2}</strong></p>
      <div class="splash-polo-wrap"><div id="splash-polo"></div></div>
    `;
    document.body.appendChild(overlay);

    if (typeof BarberPole !== 'undefined') {
      new BarberPole(overlay.querySelector('#splash-polo'));
    }

    setTimeout(() => {
      overlay.classList.add('saindo');
      setTimeout(() => { onFim ? onFim() : overlay.remove(); }, 450);
    }, 2200);
  }
}
