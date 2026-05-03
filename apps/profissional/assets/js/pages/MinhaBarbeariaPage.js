'use strict';

// =============================================================
// MinhaBarbeariaPage.js — Tela "Minha Barbearia"
//
// Responsabilidades:
//  • Exibir stories ativos, equipe e serviços da barbearia.
//  • 1º story-card = card de upload de mídia (vídeo/imagem).
//    - Dono da barbearia: até 3 vídeos/dia.
//    - Barbeiro convidado: até 1 vídeo/dia.
//  • Botão +GPS → sub-painel GPS (slide sobre a tela).
//    - CEP + ViaCEP, GPS nativo, salva endereço no Supabase.
//  • Botão + Mais → sub-painel configurações (slide sobre a tela).
//    - Upload capa, upload logo circular, nome, serviços/produtos.
//  • Botão + Barbeiros → sub-painel convidar barbeiro.
//    - Busca por nome, seleção de tipo de parceria (% ou cadeira),
//      e envio de convite pela tabela barbershop_invites.
//
// Dependências: BarbershopRepository.js, BarbershopService.js,
//               AuthService.js, SupabaseService.js,
//               NotificationService.js, DigText (SearchWidget.js)
// =============================================================

class MinhaBarbeariaPage {

  // ── Estado ─────────────────────────────────────────────────
  #telaEl          = null;
  #panelEl         = null;   // mb-config-panel
  #gpsPanelEl      = null;   // mb-gps-panel
  #convitePanelEl  = null;   // mb-convite-panel
  #subTelaAtiva    = null;   // sub-painel aberto no momento
  #conviteBarbeiroId = null;
  #conviteTipo       = 'porcentagem';
  #carregou     = false;
  #barbershopId = null;
  #isOwner      = false;  // true se o usuário é dono da barbearia
  #shopData     = null;   // dados da barbearia (pré-preenchimento GPS)
  #servicos     = [];     // serviços da barbearia — reutilizados nas modais de corte
  #profissionalId = null; // UUID do profissional logado (para sentar na fila)
  #coordsGps    = null;   // coordenadas GPS capturadas no sub-painel
  #digGps       = null;   // instância DigText para o p.gps-dig
  #digBoasVindas= null;   // instância DigText para o h1#mb-boas-vindas
  #guardaBotoes = null;   // instância GuardaIten para a gaveta de botões
  #mediaP2P     = new MediaP2P(); // preview local P2P — upload adiado para o save
  #refs         = {};

  constructor() {}

  // ── Ponto de entrada ────────────────────────────────────────

  bind() {
    this.#telaEl    = document.getElementById('tela-minha-barbearia');
    this.#panelEl        = document.getElementById('mb-config-panel');
    this.#gpsPanelEl     = document.getElementById('mb-gps-panel');
    this.#convitePanelEl = document.getElementById('mb-convite-panel');
    if (!this.#telaEl) return;

    this.#cacheRefs();
    this.#bindEventos();

    // Animação "dig" no sub-painel de GPS
    const digEl = document.getElementById('gps-dig');
    if (digEl && typeof DigText !== 'undefined') {
      this.#digGps = new DigText(digEl, [
        'Configure o endereço e ative o GPS...',
        'Sua barbearia aparecerá no mapa dos clientes.',
        'Preencha o CEP e clique em Buscar.',
        'Com o GPS ativo, sua localização será precisa.',
      ], { velocidade: 36, pausaFinal: 3200, loop: true });
    }

    // Animação "dig" boas-vindas — anima uma vez ao entrar na tela
    const boasVindasEl = document.getElementById('mb-boas-vindas');
    if (boasVindasEl && typeof DigText !== 'undefined') {
      this.#digBoasVindas = new DigText(boasVindasEl,
        ['Bem-vindo à Sua Barbearia'],
        { velocidade: 48, loop: false }
      );
    }

    // GuardaIten — gaveta que revela os botões +GPS e +Mais
    const giWrapper = document.getElementById('mb-gi-botoes');
    if (giWrapper && typeof GuardaIten !== 'undefined') {
      this.#guardaBotoes = new GuardaIten(giWrapper, {
        txtEsqFechado:  'Mostrar Botões',
        txtEsqAberto:   'Fechar Botões',
        txtDirFechado:  '+Abrir',
        txtDirAberto:   '−Fechar',
        elementoOculto: document.querySelector('#mb-gi-botoes .mb-btns-row'),
      });
    }

    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) {
        this.#digBoasVindas?.iniciar();
        if (!this.#carregou) this.#carregar();
      } else {
        this.#digBoasVindas?.parar();
      }
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── DOM refs ────────────────────────────────────────────────

  #cacheRefs() {
    const q = id => document.getElementById(id);
    this.#refs = {
      nome:          q('mb-nome'),
      coverImg:      q('mb-cover-img'),
      coverInput:    q('mb-cover-input'),
      quotaTxt:      q('mb-quota-txt'),
      addBtn:        q('mb-add-btn'),
      gpsBtn:        q('mb-gps-btn'),
      maisBtn:       q('mb-mais-btn'),
      slot2:         q('mb-story-slot-2'),
      slot3:         q('mb-story-slot-3'),
      servicosLista: q('mb-servicos-lista'),
      // Convite barbeiro
      convidarBtn:        q('mb-equipe-convidar-btn'),
      conviteFechar:      q('mb-convite-fechar'),
      conviteInput:       q('mb-convite-input'),
      conviteBtnBuscar:   q('mb-convite-btn-buscar'),
      conviteResultado:   q('mb-convite-resultado'),
      conviteTipoSecao:   q('mb-convite-tipo-secao'),
      conviteCondSecao:   q('mb-convite-condicoes-secao'),
      conviteEnviarSec:   q('mb-convite-enviar-secao'),
      conviteBtnEnviar:   q('mb-convite-btn-enviar'),
      conviteFeedback:    q('mb-convite-feedback'),
      convitePct:         q('mb-convite-pct'),
      conviteAluguel:     q('mb-convite-aluguel'),
      convitePctWrap:     q('mb-convite-pct-wrap'),
      conviteAluguelWrap: q('mb-convite-aluguel-wrap'),
      conviteMsgTexto:    q('mb-convite-msg'),
      // Config panel
      cfgFechar:     q('mb-config-fechar'),
      cfgCapaInput:  q('mb-cfg-capa-input'),
      cfgCapaImg:    q('mb-cfg-capa-img'),
      cfgLogoInput:  q('mb-cfg-logo-input'),
      cfgLogoImg:    q('mb-cfg-logo-img'),
      cfgIconeWrap:  q('mb-cfg-icone-wrap'),
      cfgNome:       q('mb-cfg-nome'),
      cfgProdutos:   q('mb-cfg-produtos-lista'),
      cfgAddProd:    q('mb-cfg-add-produto'),
      cfgSalvar:      q('mb-config-salvar'),
      cfgMsg:         q('mb-config-msg'),
      // Config panel — campos editáveis (lápis)
      cfgWhats:          q('mb-cfg-whats'),
      cfgWhatsDisplay:   q('mb-cfg-whats-display'),
      cfgWhatsLapis:     q('mb-cfg-whats-lapis'),
      cfgFounded:        q('mb-cfg-founded'),
      cfgFoundedDisplay: q('mb-cfg-desde-display'),
      cfgFoundedLapis:   q('mb-cfg-desde-lapis'),
      // Info card (tela principal)
      infoCard:          q('mb-info-card'),
      infoNome:          q('mb-info-nome'),
      infoRua:           q('mb-info-rua'),
      infoCidade:        q('mb-info-cidade'),
      infoDesde:         q('mb-info-desde'),
      infoWhats:         q('mb-info-whats'),
      // Config panel — nome lápis
      cfgNomeDisplay: q('mb-cfg-nome-display'),
      cfgNomeLapis:   q('mb-cfg-nome-lapis'),
      // GPS sub-painel
      gpsFechar:        q('mb-gps-fechar'),
      gpsCep:           q('gps-cep'),
      gpsCepDisplay:    q('gps-cep-display'),
      gpsCepLapis:      q('gps-cep-lapis'),
      gpsCepRow:        q('gps-cep-row'),
      gpsBtnBuscar:     q('gps-btn-buscar'),
      gpsLogradouro:    q('gps-logradouro'),
      gpsRuaDisplay:    q('gps-rua-display'),
      gpsRuaLapis:      q('gps-rua-lapis'),
      gpsBairro:        q('gps-bairro'),
      gpsBairroDisplay: q('gps-bairro-display'),
      gpsBairroLapis:   q('gps-bairro-lapis'),
      gpsCidade:        q('gps-cidade'),
      gpsCidadeDisplay: q('gps-cidade-display'),
      gpsCidadeLapis:   q('gps-cidade-lapis'),
      gpsNumero:        q('gps-numero'),
      gpsNumDisplay:    q('gps-num-display'),
      gpsNumLapis:      q('gps-num-lapis'),
      gpsComplemento:   q('gps-complemento'),
      gpsCompDisplay:   q('gps-comp-display'),
      gpsCompLapis:     q('gps-comp-lapis'),
      gpsBtnGps:        q('gps-btn-gps'),
      gpsCoordsT:       q('gps-coords-txt'),
      gpsMsg:           q('gps-msg'),
      gpsBtnSalvar:     q('gps-btn-salvar'),
      // Status aberta/fechada
      statusTxt:    q('mb-status-txt'),
      statusToggle: q('mb-status-toggle'),
      topoStatus:   q('mb-topo-status'),
      // Hero header
      heroHeader:   q('mb-hero-header'),
      heroLogo:     q('mb-hero-logo'),
      // Equipe
      equipeDonoWrap: q('mb-equipe-dono-wrap'),
      equipeCol:      q('mb-equipe-col'),
    };
  }

  // ── Eventos ─────────────────────────────────────────────────

  #bindEventos() {
    this.#refs.maisBtn?.addEventListener('click',     () => this.#abrirSub('config'));
    this.#refs.gpsBtn?.addEventListener('click',      () => this.#abrirSub('gps'));
    this.#refs.convidarBtn?.addEventListener('click', () => this.#abrirSub('convite'));
    this.#refs.addBtn?.addEventListener('click',  () => this.#refs.coverInput?.click());
    this.#refs.cfgFechar?.addEventListener('click',    () => this.#fecharSub());
    this.#refs.conviteFechar?.addEventListener('click',() => this.#fecharSub());
    this.#refs.coverInput?.addEventListener('change',  e => this.#onUploadMidia(e));
    this.#refs.cfgCapaInput?.addEventListener('change',e => this.#onUploadCapa(e));
    this.#refs.cfgLogoInput?.addEventListener('change',e => this.#onUploadLogo(e));
    this.#refs.cfgAddProd?.addEventListener('click',   () => this.#adicionarLinhaProduto());
    this.#refs.cfgSalvar?.addEventListener('click',    () => this.#salvarConfiguracoes());
    // Convite — busca
    this.#refs.conviteBtnBuscar?.addEventListener('click', () => this.#buscarBarbeiro());
    this.#refs.conviteInput?.addEventListener('keydown',   e => { if (e.key === 'Enter') this.#buscarBarbeiro(); });
    this.#refs.conviteBtnEnviar?.addEventListener('click', () => this.#enviarConvite());
    // Convite — selecionar tipo (escopado ao painel)
    this.#convitePanelEl?.querySelectorAll('[data-tipo]').forEach(btn => {
      btn.addEventListener('click', () => this.#selecionarTipoConvite(btn.dataset.tipo));
    });
    // GPS sub-painel
    this.#refs.gpsFechar?.addEventListener('click',    () => this.#fecharSub());
    this.#refs.gpsCep?.addEventListener('input',       e  => this.#onCepInput(e));
    this.#refs.gpsBtnBuscar?.addEventListener('click', () => this.#buscarCep());
    this.#refs.gpsBtnGps?.addEventListener('click',    () => this.#ativarGps());
    this.#refs.gpsBtnSalvar?.addEventListener('click', () => this.#salvarGps());
    // Toggle de status aberta/fechada
    this.#refs.statusToggle?.addEventListener('click', () => this.#toggleStatusAberto());
    // Campos editáveis (lápis) — Config
    this.#refs.cfgNomeLapis?.addEventListener('click',    () => this.#_toggleEl(this.#refs.cfgNome,    this.#refs.cfgNomeDisplay,    this.#refs.cfgNomeLapis));
    this.#refs.cfgWhatsLapis?.addEventListener('click',   () => this.#_toggleEl(this.#refs.cfgWhats,   this.#refs.cfgWhatsDisplay,   this.#refs.cfgWhatsLapis));
    this.#refs.cfgFoundedLapis?.addEventListener('click', () => this.#_toggleEl(this.#refs.cfgFounded, this.#refs.cfgFoundedDisplay, this.#refs.cfgFoundedLapis));
    // Campos editáveis (lápis) — GPS
    this.#refs.gpsCepLapis?.addEventListener('click',    () => this.#_toggleCepRow());
    this.#refs.gpsRuaLapis?.addEventListener('click',    () => this.#_toggleEl(this.#refs.gpsLogradouro,  this.#refs.gpsRuaDisplay,     this.#refs.gpsRuaLapis,    '—'));
    this.#refs.gpsBairroLapis?.addEventListener('click', () => this.#_toggleEl(this.#refs.gpsBairro,      this.#refs.gpsBairroDisplay,  this.#refs.gpsBairroLapis, '—'));
    this.#refs.gpsCidadeLapis?.addEventListener('click', () => this.#_toggleEl(this.#refs.gpsCidade,      this.#refs.gpsCidadeDisplay,  this.#refs.gpsCidadeLapis, '—'));
    this.#refs.gpsNumLapis?.addEventListener('click',    () => this.#_toggleEl(this.#refs.gpsNumero,      this.#refs.gpsNumDisplay,     this.#refs.gpsNumLapis,    '—'));
    this.#refs.gpsCompLapis?.addEventListener('click',   () => this.#_toggleEl(this.#refs.gpsComplemento, this.#refs.gpsCompDisplay,    this.#refs.gpsCompLapis,   '—'));
  }

  // ── Carregamento principal ───────────────────────────────────

  async #carregar() {
    this.#carregou = true;
    this.#mostrarSkeleton();

    try {
      const perfil = AuthService.getPerfil();
      if (!perfil?.id) return;

      const shop = await MinhaBarbeariaPage.#fetchMinhaBarbearia(perfil.id);
      if (!shop) { this.#mostrarVazio(); return; }

      this.#barbershopId   = shop.id;
      this.#isOwner        = shop.owner_id === perfil.id;
      this.#shopData       = shop;
      this.#profissionalId = perfil.id;

      const [servicos, stories, quotaHoje, barbeiros, filaEntradas] = await Promise.all([
        MinhaBarbeariaPage.#fetchServicos(shop.id),
        MinhaBarbeariaPage.#fetchStoriesAtivos(shop.id),
        MinhaBarbeariaPage.#fetchQuotaHoje(perfil.id, shop.id),
        MinhaBarbeariaPage.#fetchBarbeiros(shop.id),
        CadeiraService.getFilaAtiva(shop.id),
      ]);

      // Armazena serviços para reuso nos re-renders das cadeiras
      this.#servicos = servicos;

      this.#renderCabecalho(shop);
      this.#renderStatusAberto(shop.is_open, shop.close_reason ?? null);
      this.#renderStoryCards(stories, shop, quotaHoje, perfil.id);
      this.#renderEquipe(barbeiros, shop.owner_id, perfil, filaEntradas);
      this.#renderServicos(servicos);
      this.#preencherConfigPanel(shop, servicos);
      this.#renderInfoCard(shop);

    } catch (err) {
      console.error('[MinhaBarbeariaPage] erro:', err);
      this.#mostrarErro();
    }
  }

  // ── Fetchers ────────────────────────────────────────────────
  static async #fetchMinhaBarbearia(ownerId) {
    const { data, error } = await SupabaseService.barbershops()
      .select('*')
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data ?? null;
  }

  static async #fetchServicos(barbershopId) {
    const { data, error } = await SupabaseService.services()
      .select('id, name, description, duration_min, price, image_path')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  static async #fetchBarbeiros(barbershopId) {
    try {
      const { data, error } = await SupabaseService.client
        .from('professional_shop_links')
        .select('professional:professionals!professional_id(id, profile:profiles!id(full_name, avatar_path, updated_at))')
        .eq('barbershop_id', barbershopId)
        .eq('is_active', true)
        .limit(20);

      if (error) return [];
      return (data ?? []).map(link => link.professional).filter(Boolean);
    } catch (_) { return []; }
  }

  static async #fetchStoriesAtivos(barbershopId) {
    try {
      const agora = new Date().toISOString();
      const { data, error } = await SupabaseService.client
        .from('stories')
        .select('id, owner_id, storage_path, thumbnail_path, media_type, views_count, created_at')
        .eq('barbershop_id', barbershopId)
        .gt('expires_at', agora)
        .order('created_at', { ascending: false })
        .limit(2);

      if (error) return [];
      return data ?? [];
    } catch (_) { return []; }
  }

  static async #fetchQuotaHoje(ownerId, barbershopId) {
    try {
      const hoje = new Date();
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();

      const { count, error } = await SupabaseService.client
        .from('stories')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .eq('barbershop_id', barbershopId)
        .gte('created_at', inicio);

      if (error) return 0;
      return count ?? 0;
    } catch (_) { return 0; }
  }

  // ── Renders ─────────────────────────────────────────────────

  // ── Equipe da barbearia ─────────────────────────────────────

  #renderEquipe(barbeiros, ownerId, perfilDono = null, filaEntradas = []) {
    const donoWrap = this.#refs.equipeDonoWrap;
    const col      = this.#refs.equipeCol;
    const section  = document.getElementById('mb-equipe-section');
    if (!donoWrap || !col) return;

    const donoProf   = barbeiros.find(b => b.id === ownerId);
    const equipe     = barbeiros.filter(b => b.id !== ownerId);

    const nomeDono   = donoProf?.profile?.full_name   ?? perfilDono?.full_name   ?? 'Dono';
    const avatarPath = donoProf?.profile?.avatar_path ?? perfilDono?.avatar_path ?? null;
    const updatedAt  = donoProf?.profile?.updated_at  ?? perfilDono?.updated_at  ?? null;

    // Fila filtrada por profissional
    const filaDonoId     = donoProf?.id ?? ownerId;
    const filaDonoEntradas = filaEntradas.filter(e => e.professional?.id === filaDonoId);

    donoWrap.innerHTML = '';
    donoWrap.appendChild(
      MinhaBarbeariaPage.#criarBarbeiroRow({
        nome: nomeDono, avatarPath, updatedAt,
        variant: 'dono', badge: 'Dono',
        onClick:         () => { if (typeof App !== 'undefined') App.nav('perfil'); },
        filaEntradas:    filaDonoEntradas,
        isOwner:         this.#isOwner,
        professionalId:  filaDonoId,
        onCadeiraClick:  (tipo, ocupada, entrada) =>
          this.#onCadeiraClick(tipo, ocupada, entrada, filaDonoId),
      })
    );

    col.innerHTML = '';
    for (const b of equipe) {
      const filaB = filaEntradas.filter(e => e.professional?.id === b.id);
      col.appendChild(
        MinhaBarbeariaPage.#criarBarbeiroRow({
          nome:           b.profile?.full_name   ?? 'Barbeiro',
          avatarPath:     b.profile?.avatar_path ?? null,
          updatedAt:      b.profile?.updated_at  ?? null,
          variant:        'membro',
          filaEntradas:   filaB,
          isOwner:        this.#isOwner,
          professionalId: b.id,
          onCadeiraClick: (tipo, ocupada, entrada) =>
            this.#onCadeiraClick(tipo, ocupada, entrada, b.id),
        })
      );
    }

    if (section) section.hidden = false;
  }

  /**
   * Re-fetcha fila e barbeiros e atualiza a seção de equipe.
   */
  async #reRenderEquipe() {
    if (!this.#barbershopId) return;
    try {
      const perfil = AuthService.getPerfil();
      const [barbeiros, filaEntradas] = await Promise.all([
        MinhaBarbeariaPage.#fetchBarbeiros(this.#barbershopId),
        CadeiraService.getFilaAtiva(this.#barbershopId),
      ]);
      this.#renderEquipe(barbeiros, this.#shopData?.owner_id ?? '', perfil, filaEntradas);
    } catch (err) {
      LoggerService.warn('[MinhaBarbeariaPage] #reRenderEquipe erro:', err);
    }
  }

  /**
   * Gerencia o clique do dono em uma cadeira.
   * @param {'producao'|'fila'} tipo
   * @param {boolean}    ocupada     true se há cliente nessa cadeira
   * @param {object|null} entrada    queue_entry atual (se ocupada)
   * @param {string}     professionalId  UUID do barbeiro dono da cadeira
   */
  async #onCadeiraClick(tipo, ocupada, entrada, professionalId) {
    if (!this.#isOwner) return;

    // ── Cadeira ocupada em produção → finalizar ──────────────
    if (tipo === 'producao' && ocupada && entrada) {
      await this.#fluxoFinalizar(entrada);
      return;
    }

    // ── Cadeira vazia (produção ou fila) → sentar ────────────
    await this.#fluxoSentar(tipo, professionalId);
  }

  /**
   * Fluxo completo: seleção de cliente → seleção de cortes → sentar.
   * @param {'producao'|'fila'} tipo
   * @param {string} professionalId
   */
  async #fluxoSentar(tipo, professionalId) {
    // 1. Busca clientes que favoritaram esta barbearia ou este barbeiro
    let favoritos;
    try {
      favoritos = await CadeiraService.getClientesFavoritos(this.#barbershopId, professionalId);
    } catch (_) {
      favoritos = [];
    }

    // Exclui clientes já sentados em qualquer cadeira desta barbearia
    let jaAssentados = new Set();
    try {
      const filaAtiva = await CadeiraService.getFilaAtiva(this.#barbershopId);
      filaAtiva.forEach(e => {
        if (e.status === 'in_service' || e.status === 'waiting') {
          if (e.client?.id) jaAssentados.add(e.client.id);
        }
      });
    } catch (_) { /* ignora */ }

    const favoritosDisponiveis = favoritos.filter(c => !jaAssentados.has(c.id));

    // 2. Modal: selecionar cliente (favoritos iniciais + busca global no input)
    const clienteSel = await ClienteSeletorModal.abrir(favoritosDisponiveis, { excluirIds: jaAssentados });
    if (!clienteSel) return;

    // 3. Modal: selecionar cortes
    const serviceIds = await CorteModal.abrir({
      servicos:    this.#servicos,
      clienteNome: clienteSel.full_name,
    });
    if (!serviceIds) return;

    // 4. Sentar
    try {
      await CadeiraService.sentar({
        barbershopId:   this.#barbershopId,
        professionalId,
        clientId:       clienteSel.id,
        serviceIds,
        tipo,
      });
      NotificationService.mostrarToast(
        'Cliente sentado',
        `${clienteSel.full_name} foi para a cadeira.`,
        NotificationService.TIPOS.SISTEMA,
      );
      await this.#reRenderEquipe();
    } catch (err) {
      LoggerService.error('[MinhaBarbeariaPage] erro ao sentar:', err);
      NotificationService.mostrarToast('Erro', err?.message ?? 'Não foi possível sentar o cliente.', NotificationService.TIPOS.SISTEMA);
    }
  }

  /**
   * Fluxo completo: confirmação → finalizar → notificar próximo.
   * @param {object} entrada  queue_entry em in_service
   */
  async #fluxoFinalizar(entrada) {
    // Descobre o próximo na fila para exibir na modal
    let proximoNome = null;
    try {
      const filaAtiva = await CadeiraService.getFilaAtiva(this.#barbershopId);
      const waiting   = filaAtiva
        .filter(e => e.status === 'waiting')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      proximoNome = waiting[0]?.client?.full_name ?? null;
    } catch (_) { /* ignora — modal mostra "Fila vazia" */ }

    const clienteNome = entrada?.client?.full_name ?? 'Cliente';
    const confirmado  = await FinalizarCorteModal.abrir({ clienteNome, proximoNome });
    if (!confirmado) return;

    try {
      const { proximoNome: nomeChamado } = await CadeiraService.finalizar(
        entrada.id, this.#barbershopId
      );
      const msg = nomeChamado
        ? `Próximo chamado: ${nomeChamado}`
        : 'Fila vazia agora.';
      NotificationService.mostrarToast('Corte finalizado', msg, NotificationService.TIPOS.SISTEMA);
      await this.#reRenderEquipe();
    } catch (err) {
      LoggerService.error('[MinhaBarbeariaPage] erro ao finalizar:', err);
      NotificationService.mostrarToast('Erro', err?.message ?? 'Não foi possível finalizar.', NotificationService.TIPOS.SISTEMA);
    }
  }

  // ── Factory: componentes de equipe ─────────────────────────

  /**
   * Avatar circular reutilizável.
   * @param {string|null} avatarPath
   * @param {string|null} updatedAt
   * @param {string}      nome
   * @param {'lg'|'md'|'sm'} mod
   */
  static #criarAvatarEl(avatarPath, updatedAt, nome, mod = 'sm') {
    const wrap = document.createElement('div');
    wrap.className = `mb-equipe-avatar mb-equipe-avatar--${mod}`;
    if (avatarPath) {
      const img   = document.createElement('img');
      img.alt     = nome;
      img.loading = 'lazy';
      img.src     = SupabaseService.resolveAvatarUrl(avatarPath, updatedAt) || '';
      img.onerror = () => { wrap.textContent = '💈'; };
      wrap.appendChild(img);
    } else {
      wrap.textContent = '💈';
    }
    return wrap;
  }

  /**
   * Card em coluna (avatar + nome + badge) — filho esquerdo da row.
   */
  static #criarBarberiroCard({ nome, avatarPath, updatedAt, variant, badge = null, cortes = null }) {
    const card = document.createElement('div');
    card.className = 'mb-barbeiro-card';

    card.appendChild(
      MinhaBarbeariaPage.#criarAvatarEl(avatarPath, updatedAt, nome, variant === 'dono' ? 'lg' : 'md')
    );

    const nomeEl = document.createElement('p');
    nomeEl.className   = 'mb-barbeiro-nome';
    nomeEl.textContent = nome;
    card.appendChild(nomeEl);

    if (badge) {
      const badgeEl = document.createElement('span');
      badgeEl.className   = 'mb-barbeiro-badge';
      badgeEl.textContent = badge;
      card.appendChild(badgeEl);
    }

    if (cortes != null) {
      const cortesEl = document.createElement('span');
      cortesEl.className   = 'mb-barbeiro-cortes';
      cortesEl.textContent = `${cortes} cortes`;
      card.appendChild(cortesEl);
    }

    return card;
  }

  /**
   * Cadeira visual com interação opcional (somente para o dono).
   * @param {'producao'|'fila'} tipo
   * @param {object|null}       entrada   queue_entry com { client, status }
   * @param {number}            posicao   exibido como #N nas cadeiras de fila
   * @param {object}            [opts]    { isOwner, onClickVazia, onClickOcupada }
   */
  static #criarCadeiraEl(tipo, entrada = null, posicao = 1, opts = {}) {
    const { isOwner = false, onClickVazia = null, onClickOcupada = null } = opts;
    const ocupada = !!entrada;

    const cadeira = document.createElement('div');
    cadeira.className = `mb-cadeira mb-cadeira--${tipo}${ocupada ? '' : ' mb-cadeira--vazia'}`;

    // Ícone — imagem da cadeira sempre visível; avatar do cliente flutua acima
    const iconWrap = document.createElement('div');
    iconWrap.className = 'mb-cadeira-icon';

    // Click restrito apenas ao ícone (não à cadeira inteira)
    if (isOwner && (ocupada ? onClickOcupada : onClickVazia)) {
      cadeira.classList.add('mb-cadeira--interativa');
      const handler = () => ocupada ? onClickOcupada(entrada) : onClickVazia();
      iconWrap.addEventListener('click', handler);
      iconWrap.setAttribute('role', 'button');
      iconWrap.setAttribute('tabindex', '0');
      iconWrap.setAttribute('aria-label',
        tipo === 'producao'
          ? (ocupada ? 'Finalizar atendimento' : 'Sentar cliente em produção')
          : (ocupada ? `Cliente #${posicao}` : 'Adicionar cliente na fila')
      );
      iconWrap.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    }

    // Imagem da cadeira — sempre como fundo
    const imgFundo = MinhaBarbeariaPage.#cadeiraImgEl(tipo);
    imgFundo.className = 'mb-cadeira-img-fundo';
    iconWrap.appendChild(imgFundo);

    // Se há cliente: avatar flutuante + badge de posição
    if (ocupada) {
      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'mb-cadeira-avatar-cli';

      const avatarPath = entrada.client?.avatar_path;
      if (avatarPath) {
        const img   = document.createElement('img');
        img.alt     = entrada.client?.full_name ?? '';
        img.loading = 'lazy';
        img.src     = SupabaseService.resolveAvatarUrl(
          avatarPath, entrada.client?.updated_at ?? null
        ) || '';
        img.onerror = () => { avatarWrap.textContent = '💈'; };
        avatarWrap.appendChild(img);
      } else {
        avatarWrap.textContent = '💈';
      }
      iconWrap.appendChild(avatarWrap);

      if (tipo === 'fila' && posicao > 0) {
        const badge = document.createElement('span');
        badge.className   = 'mb-cadeira-pos-badge';
        badge.textContent = `#${posicao}`;
        iconWrap.appendChild(badge);
      }
    }

    cadeira.appendChild(iconWrap);

    // Label de estado
    const label = document.createElement('span');
    label.className = 'mb-cadeira-label';
    if (tipo === 'producao') {
      label.textContent = entrada ? 'Atendendo' : 'Livre';
    } else {
      label.textContent = entrada ? entrada.client?.full_name?.split(' ')[0] ?? `#${posicao}` : '+';
    }
    cadeira.appendChild(label);

    return cadeira;
  }

  /**
   * Imagem estática da cadeira conforme tipo.
   * Produção → icones-cadeira-producao.png
   * Fila     → icones-cadeira-de-éspera.png
   */
  static #cadeiraImgEl(tipo) {
    const img = document.createElement('img');
    img.alt     = tipo === 'producao' ? 'Cadeira em produção' : 'Cadeira de espera';
    img.loading = 'lazy';
    img.src     = tipo === 'producao'
      ? '/shared/img/icones-cadeira-producao.png'
      : '/shared/img/icones-cadeira-de-éspera.png';
    return img;
  }

  /**
   * Row horizontal completa: card do barbeiro + 3 cadeiras visuais.
   * @param {object[]}  filaEntradas    queue_entries filtradas para este barbeiro
   * @param {boolean}   isOwner         true se o usuário logado é dono
   * @param {string}    professionalId  UUID do barbeiro desta row
   * @param {Function}  onCadeiraClick  (tipo, ocupada, entrada) => void
   */
  static #criarBarbeiroRow({ nome, avatarPath, updatedAt, variant = 'membro', badge = null, onClick = null, cortes = null, filaEntradas = [], isOwner = false, professionalId = null, onCadeiraClick = null }) {
    const row = document.createElement('div');
    row.className = `mb-barbeiro-row mb-barbeiro-row--${variant}`;

    // Card do barbeiro (coluna esquerda)
    const bCard = MinhaBarbeariaPage.#criarBarberiroCard({ nome, avatarPath, updatedAt, variant, badge, cortes });
    if (onClick) bCard.addEventListener('click', onClick);
    row.appendChild(bCard);

    // Cadeiras (container externo)
    const wrap     = document.createElement('div');
    wrap.className = 'mb-cadeiras-wrap';

    const emServico = filaEntradas.find(e => e.status === 'in_service') ?? null;
    const naFila    = filaEntradas.filter(e => e.status === 'waiting');

    // Opções de interatividade — só ativas para o dono
    const optsProducao = {
      isOwner,
      onClickVazia:   onCadeiraClick ? () => onCadeiraClick('producao', false, null) : null,
      onClickOcupada: onCadeiraClick ? (e) => onCadeiraClick('producao', true, e)    : null,
    };
    const optsFilaFn = (pos) => ({
      isOwner,
      onClickVazia: onCadeiraClick ? () => onCadeiraClick('fila', false, null) : null,
      onClickOcupada: null, // cadeiras de fila não têm ação de finalizar
    });

    // Cadeira de produção — fixa, fora do scroll
    wrap.appendChild(MinhaBarbeariaPage.#criarCadeiraEl('producao', emServico, 0, optsProducao));

    // Cadeiras de espera — dinâmicas: uma por cliente na fila + sempre 1 vazia no final
    const filaWrap     = document.createElement('div');
    filaWrap.className = 'mb-cadeiras-fila-wrap';

    naFila.forEach((entrada, i) => {
      filaWrap.appendChild(
        MinhaBarbeariaPage.#criarCadeiraEl('fila', entrada, i + 1, optsFilaFn(i + 1))
      );
    });

    // Cadeira vazia sempre ao final — permite adicionar o próximo
    filaWrap.appendChild(
      MinhaBarbeariaPage.#criarCadeiraEl('fila', null, naFila.length + 1, optsFilaFn(naFila.length + 1))
    );

    wrap.appendChild(filaWrap);

    row.appendChild(wrap);
    return row;
  }

  // ── Status aberta / fechada ─────────────────────────────────

  #renderStatusAberto(isOpen, closeReason = null) {
    const label  = StatusFechamentoModal.labelStatus(isOpen, closeReason);
    const classe = StatusFechamentoModal.classeStatus(isOpen, closeReason);

    const txt    = this.#refs.statusTxt;
    const toggle = this.#refs.statusToggle;
    const topo   = this.#refs.topoStatus;

    if (txt) {
      txt.textContent = `Barbearia ${label}`;
      txt.className   = `mb-status-txt mb-status-txt--${classe.replace('status--', '')}`;
    }
    if (toggle) {
      toggle.setAttribute('aria-checked', isOpen ? 'true' : 'false');
    }
    if (topo) {
      topo.textContent = label;
      topo.className   = `mb-topo-status ${classe}`;
      topo.hidden      = false;
    }
  }

  async #toggleStatusAberto() {
    if (!this.#barbershopId) return;
    const toggle   = this.#refs.statusToggle;
    if (!toggle) return;
    const eraAberta = toggle.getAttribute('aria-checked') === 'true';
    const novoEstado = !eraAberta;

    let closeReason = null;

    // Se estiver fechando: perguntar o motivo
    if (!novoEstado) {
      const tipo = await StatusFechamentoModal.confirmarFechamento();
      if (tipo === null) return; // cancelado pelo usuário
      closeReason = tipo === 'normal' ? null : tipo;
    }

    // Otimismo: atualiza DOM imediatamente
    this.#renderStatusAberto(novoEstado, closeReason);
    try {
      await BarbershopRepository.updateIsOpen(this.#barbershopId, novoEstado, closeReason);
      if (this.#shopData) {
        this.#shopData.is_open      = novoEstado;
        this.#shopData.close_reason = novoEstado ? null : closeReason;
      }
      // Notifica outros widgets no DOM para atualizar os badges em tempo real
      document.dispatchEvent(new CustomEvent('barberflow:statusAtualizado', {
        detail: {
          barbershopId: this.#barbershopId,
          isOpen:       novoEstado,
          closeReason:  novoEstado ? null : closeReason,
        },
      }));
    } catch (err) {
      // Rollback visual em caso de erro
      this.#renderStatusAberto(eraAberta, this.#shopData?.close_reason ?? null);
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast('Erro ao salvar status', err?.message ?? '', NotificationService.TIPOS.SISTEMA);
      }
    }
  }

  #renderCabecalho(shop) {
    const { nome, heroHeader, heroLogo, coverImg } = this.#refs;

    if (nome) {
      nome.textContent = shop.name ?? '';
      if (typeof FonteSalao !== 'undefined') FonteSalao.aplicarFonte(nome, shop.font_key);
    }

    // Hero header — background-image = capa; fallback = logo
    const bgPath = shop.cover_path || shop.logo_path;
    if (bgPath && heroHeader) {
      const bgUrl = SupabaseService.getLogoUrl(bgPath);
      if (bgUrl) heroHeader.style.backgroundImage = `url('${bgUrl}')`;
    }

    // Logo/ícone ao lado do h2
    const logoPath = shop.logo_path || shop.cover_path;
    if (logoPath && heroLogo) {
      const logoUrl = SupabaseService.getLogoUrl(logoPath);
      if (logoUrl) {
        heroLogo.src    = logoUrl;
        heroLogo.hidden = false;
      }
    }

    // Cover do story card (comportamento original)
    if (shop.cover_path) {
      const url = SupabaseService.getLogoUrl(shop.cover_path);
      if (url && coverImg) coverImg.src = url;
    } else if (shop.logo_path) {
      const url = SupabaseService.getLogoUrl(shop.logo_path);
      if (url && coverImg) coverImg.src = url;
    }
  }

  #renderStoryCards(stories, shop, quotaHoje, perfilId) {
    const maxQuota = this.#isOwner ? 3 : 1;
    const restante = Math.max(0, maxQuota - quotaHoje);

    if (this.#refs.quotaTxt) {
      this.#refs.quotaTxt.textContent = restante > 0
        ? `${restante} vídeo${restante > 1 ? 's' : ''} restante${restante > 1 ? 's' : ''} hoje`
        : 'Limite diário atingido';
    }
    if (this.#refs.coverInput) {
      this.#refs.coverInput.disabled = restante === 0;
    }
    if (this.#refs.addBtn) {
      this.#refs.addBtn.style.opacity       = restante === 0 ? '0.35' : '';
      this.#refs.addBtn.style.pointerEvents = restante === 0 ? 'none'  : '';
    }

    const slots = [this.#refs.slot2, this.#refs.slot3];
    slots.forEach((slot, i) => {
      if (!slot) return;
      const story = stories[i];
      if (!story) return;

      const thumbUrl = story.thumbnail_path
        ? SupabaseService.getLogoUrl(story.thumbnail_path)
        : null;
      const badgeSrc = this.#refs.coverImg?.src || '/shared/img/Logo01.png';

      slot.innerHTML = `
        <div class="story-video-wrap">
          ${thumbUrl
            ? `<img src="${thumbUrl}" alt="story" style="width:100%;height:100%;object-fit:cover;"
                    onerror="this.style.display='none'">`
            : `<div class="mb-slot-vazio">${story.media_type === 'video' ? '▶' : '📸'}</div>`
          }
          <div class="story-play-btn">▶</div>
          <img class="story-shop-badge" src="${badgeSrc}" alt="" onerror="this.style.display='none'">
        </div>
        <div class="story-card-info">
          <p class="story-card-name">${shop.name ?? ''}</p>
          <p class="story-card-addr">${new Date(story.created_at).toLocaleDateString('pt-BR')}</p>
        </div>
      `;
    });
  }

  #renderServicos(lista) {
    const el = this.#refs.servicosLista;
    if (!el) return;

    if (!lista.length) {
      el.innerHTML = '<p class="agenda-vazio">Nenhum serviço cadastrado. Configure no painel "Mais".</p>';
      return;
    }

    el.innerHTML = lista.map(s => `
      <div class="barber-row">
        <div class="avatar gold" style="font-size:.95rem;">✂️</div>
        <div class="barber-info">
          <p class="barber-name">${s.name}</p>
          <p class="barber-sub">${s.duration_min} min${s.description ? ' · ' + s.description : ''}</p>
        </div>
        <div class="barber-meta">
          <span style="font-size:.9rem;font-weight:800;color:var(--gold);">
            R$ ${Number(s.price).toFixed(2).replace('.', ',')}
          </span>
        </div>
      </div>
    `).join('');
  }

  // ── Sub-painéis (Config + GPS) ───────────────────────────────

  #abrirSub(id) {
    const map = { config: this.#panelEl, gps: this.#gpsPanelEl, convite: this.#convitePanelEl };
    const el  = map[id];
    if (!el) return;
    this.#subTelaAtiva = el;
    el.classList.add('mb-sub-ativa');
    el.setAttribute('aria-hidden', 'false');
    if (id === 'gps') {
      this.#preencherGpsForm();
      this.#digGps?.iniciar();
    }
    if (id === 'convite') this.#resetarConvite();
  }

  #fecharSub() {
    if (!this.#subTelaAtiva) return;
    this.#subTelaAtiva.classList.remove('mb-sub-ativa');
    this.#subTelaAtiva.setAttribute('aria-hidden', 'true');
    this.#subTelaAtiva = null;
    this.#digGps?.parar();
    // Revoga todos os blobs P2P pendentes ao fechar o painel (libera memória)
    this.#mediaP2P.cancelarTodos();
  }

  // ── Painel Convidar Barbeiro ────────────────────────────────

  #resetarConvite() {
    this.#conviteBarbeiroId = null;
    this.#conviteTipo = 'porcentagem';
    if (this.#refs.conviteInput)    this.#refs.conviteInput.value = '';
    if (this.#refs.conviteResultado) this.#refs.conviteResultado.innerHTML = '';
    if (this.#refs.conviteTipoSecao)  this.#refs.conviteTipoSecao.hidden = true;
    if (this.#refs.conviteCondSecao)  this.#refs.conviteCondSecao.hidden = true;
    if (this.#refs.conviteEnviarSec)  this.#refs.conviteEnviarSec.hidden = true;
    if (this.#refs.conviteFeedback)   this.#refs.conviteFeedback.textContent = '';
    if (this.#refs.convitePct)        this.#refs.convitePct.value = '';
    if (this.#refs.conviteAluguel)    this.#refs.conviteAluguel.value = '';
    if (this.#refs.conviteMsgTexto)   this.#refs.conviteMsgTexto.value = '';
    this.#convitePanelEl?.querySelectorAll('[data-tipo]').forEach(btn => {
      btn.classList.toggle('mb-convite-tipo-btn--ativo', btn.dataset.tipo === 'porcentagem');
    });
    if (this.#refs.convitePctWrap)     this.#refs.convitePctWrap.hidden = false;
    if (this.#refs.conviteAluguelWrap) this.#refs.conviteAluguelWrap.hidden = true;
  }

  async #buscarBarbeiro() {
    const query = this.#refs.conviteInput?.value?.trim();
    const el    = this.#refs.conviteResultado;
    if (!el || !query) return;

    el.innerHTML = '<p style="font-size:.8rem;color:var(--text-muted);padding:8px 0;">Buscando\u2026</p>';

    try {
      const { data, error } = await SupabaseService.client
        .from('profiles')
        .select('id, full_name, avatar_path, updated_at')
        .ilike('full_name', `%${query}%`)
        .eq('role', 'profissional')
        .limit(8);

      if (error) throw error;

      el.innerHTML = '';
      if (!data?.length) {
        el.innerHTML = '<p style="font-size:.8rem;color:var(--text-muted);padding:8px 0;">Nenhum barbeiro encontrado.</p>';
        return;
      }

      data.forEach(p => {
        const item = document.createElement('div');
        item.className   = 'mb-convite-barb-card';
        item.dataset.id  = p.id;

        const avatarEl = document.createElement('div');
        avatarEl.className = 'mb-convite-barb-avatar';
        if (p.avatar_path) {
          const img   = document.createElement('img');
          img.src     = SupabaseService.resolveAvatarUrl(p.avatar_path, p.updated_at) || '';
          img.alt     = p.full_name ?? '';
          img.loading = 'lazy';
          img.onerror = () => { avatarEl.textContent = '💈'; };
          avatarEl.appendChild(img);
        } else {
          avatarEl.textContent = '💈';
        }

        const info = document.createElement('div');
        info.innerHTML = `<p class="mb-convite-barb-nome">${InputValidator.sanitizar(p.full_name ?? '')}</p>`;

        item.appendChild(avatarEl);
        item.appendChild(info);
        item.addEventListener('click', () => this.#selecionarBarbeiro(p.id));
        el.appendChild(item);
      });
    } catch {
      el.innerHTML = '<p style="font-size:.8rem;color:var(--danger);padding:8px 0;">Erro ao buscar. Tente novamente.</p>';
    }
  }

  #selecionarBarbeiro(id) {
    this.#conviteBarbeiroId = id;
    this.#refs.conviteResultado?.querySelectorAll('.mb-convite-barb-card').forEach(el => {
      el.classList.toggle('mb-convite-barb-card--selecionado', el.dataset.id === id);
    });
    if (this.#refs.conviteTipoSecao)  this.#refs.conviteTipoSecao.hidden = false;
    if (this.#refs.conviteCondSecao)  this.#refs.conviteCondSecao.hidden = false;
    if (this.#refs.conviteEnviarSec)  this.#refs.conviteEnviarSec.hidden = false;
  }

  #selecionarTipoConvite(tipo) {
    this.#conviteTipo = tipo;
    this.#convitePanelEl?.querySelectorAll('[data-tipo]').forEach(btn => {
      btn.classList.toggle('mb-convite-tipo-btn--ativo', btn.dataset.tipo === tipo);
    });
    if (this.#refs.convitePctWrap)     this.#refs.convitePctWrap.hidden     = (tipo !== 'porcentagem');
    if (this.#refs.conviteAluguelWrap) this.#refs.conviteAluguelWrap.hidden = (tipo !== 'cadeira');
  }

  async #enviarConvite() {
    if (!this.#conviteBarbeiroId || !this.#barbershopId) return;

    const feedbackEl = this.#refs.conviteFeedback;
    const btn        = this.#refs.conviteBtnEnviar;

    const tipo = this.#conviteTipo;
    const pct  = tipo === 'porcentagem' ? Number(this.#refs.convitePct?.value  || 0) : null;
    const rent = tipo === 'cadeira'     ? Number(this.#refs.conviteAluguel?.value || 0) : null;

    // Validação: campo obrigatório não pode ser zero
    const valorInvalido = (tipo === 'porcentagem' && (pct  <= 0 || pct  > 99))
                       || (tipo === 'cadeira'     && (rent <= 0));
    if (valorInvalido) {
      if (feedbackEl) {
        feedbackEl.textContent = tipo === 'porcentagem'
          ? 'Informe a porcentagem (1–99%).'
          : 'Informe o valor mensal de aluguel.';
        feedbackEl.style.color = 'var(--danger, #e05050)';
      }
      return;
    }

    if (btn) btn.disabled = true;
    const msgTexto  = this.#refs.conviteMsgTexto?.value?.trim() || null;
    const tipoLabel = tipo === 'cadeira' ? '[Aluguel de Cadeira]' : '[% dos Cortes]';
    const mensagem  = msgTexto ? `${tipoLabel} ${msgTexto}` : tipoLabel;

    try {
      const { error } = await SupabaseService.client
        .from('barbershop_invites')
        .insert({
          barbershop_id:  this.#barbershopId,
          barbeiro_id:    this.#conviteBarbeiroId,
          commission_pct: pct ?? rent,
          message:        mensagem,
          status:         'pendente',
        });

      if (error) throw error;

      if (feedbackEl) {
        feedbackEl.textContent = '\u2705 Convite enviado com sucesso!';
        feedbackEl.style.color = 'var(--success, #3caf6a)';
      }
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast('Convite enviado! \ud83d\udce9', '', NotificationService.TIPOS?.SISTEMA ?? 'sistema');
      }
      this.#conviteBarbeiroId = null;
    } catch {
      if (feedbackEl) {
        feedbackEl.textContent = 'Erro ao enviar. Tente novamente.';
        feedbackEl.style.color = 'var(--danger, #e05050)';
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  #preencherConfigPanel(shop, servicos) {
    // Nome (lápis)
    const nome = shop.name ?? '';
    if (this.#refs.cfgNome) { this.#refs.cfgNome.value = nome; this.#refs.cfgNome.style.display = 'none'; }
    if (this.#refs.cfgNomeDisplay) this.#refs.cfgNomeDisplay.textContent = nome || 'Não informado';
    this.#refs.cfgNomeLapis?.classList.remove('mb-cfg-lapis-ativo');

    if (shop.cover_path && this.#refs.cfgCapaImg) {
      const url = SupabaseService.getLogoUrl(shop.cover_path);
      if (url) this.#refs.cfgCapaImg.src = url;
    }
    if (shop.logo_path && this.#refs.cfgLogoImg) {
      const url = SupabaseService.getLogoUrl(shop.logo_path);
      if (url) {
        this.#refs.cfgLogoImg.src = url;
        if (this.#refs.cfgIconeWrap) this.#refs.cfgIconeWrap.style.backgroundImage = `url('${url}')`;
      }
    }

    // Campos editáveis lápis
    const whats = shop.whatsapp ?? '';
    if (this.#refs.cfgWhats) {
      this.#refs.cfgWhats.value = whats;
      this.#refs.cfgWhats.style.display = 'none';
    }
    if (this.#refs.cfgWhatsDisplay)
      this.#refs.cfgWhatsDisplay.textContent = whats || 'Não informado';
    this.#refs.cfgWhatsLapis?.classList.remove('mb-cfg-lapis-ativo');

    const founded = shop.founded_year ? String(shop.founded_year) : '';
    if (this.#refs.cfgFounded) {
      this.#refs.cfgFounded.value = founded;
      this.#refs.cfgFounded.style.display = 'none';
    }
    if (this.#refs.cfgFoundedDisplay)
      this.#refs.cfgFoundedDisplay.textContent = founded || 'Não informado';
    this.#refs.cfgFoundedLapis?.classList.remove('mb-cfg-lapis-ativo');

    const lista = this.#refs.cfgProdutos;
    if (!lista) return;
    lista.innerHTML = '';
    servicos.forEach(s => this.#adicionarLinhaProduto(s));

    // Picker de fonte do nome
    if (typeof FonteSalao !== 'undefined') {
      const pickerEl = document.getElementById('mb-cfg-fonte-picker');
      if (pickerEl && !pickerEl.querySelector('.fs-picker')) {
        FonteSalao.criarPicker(pickerEl, this.#barbershopId, shop.font_key, key => {
          if (this.#shopData) this.#shopData.font_key = key;
          if (this.#refs.nome) FonteSalao.aplicarFonte(this.#refs.nome, key);
        });
      }
    }
  }

  #adicionarLinhaProduto(produto = null) {
    const lista = this.#refs.cfgProdutos;
    if (!lista) return;

    const uid   = `prod-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const uidN  = `${uid}-nome`;
    const uidP  = `${uid}-preco`;
    const imgSrc = produto?.image_path || '/shared/img/Logo01.png';
    const precoVal = produto ? Number(produto.price).toFixed(2) : '';
    const nomeVal  = produto ? MinhaBarbeariaPage.#escapeAttr(produto.name ?? '') : '';

    const row = document.createElement('ul');
    row.className = 'mb-cfg-produto-row';

    if (produto?.image_path)    row.dataset.imagePath = produto.image_path;
    if (produto?.id)            row.dataset.produtoId = produto.id;
    if (produto?.duration_min)  row.dataset.duracao   = produto.duration_min;
    row.dataset.mediaUid = uid;  // permite que #salvarProdutoUnico localize o pendente P2P

    row.innerHTML = `
      <li class="mb-prod-li mb-prod-li--painel">
        <div class="mb-cfg-prod-img-wrap">
          <img class="mb-cfg-prod-img-preview" src="${MinhaBarbeariaPage.#escapeAttr(imgSrc)}" alt="">
          <label class="mb-cfg-prod-img-btn" for="${uid}" aria-label="Trocar imagem">＋</label>
          <input type="file" id="${uid}" accept="image/*" style="display:none">
        </div>
        <div class="mb-cfg-prod-fields">
          <div class="mb-cfg-prod-field-group">
            <label class="mb-prod-label" for="${uidN}">Nome</label>
            <input type="text" id="${uidN}" class="mb-cfg-prod-nome"
                   placeholder="Nome do serviço / produto"
                   value="${nomeVal}" maxlength="60">
          </div>
          <div class="mb-cfg-prod-field-group">
            <label class="mb-prod-label" for="${uidP}">Preço</label>
            <div class="mb-prod-preco-row">
              <span class="mb-prod-preco-prefix">R$</span>
              <input type="number" id="${uidP}" class="mb-cfg-prod-preco"
                     placeholder="0,00" min="0" step="0.01" value="${precoVal}">
            </div>
          </div>
        </div>
        <button class="mb-prod-remove" type="button" aria-label="Remover item">✕</button>
      </li>
      <li class="mb-prod-li mb-prod-li--acao">
        <button class="btn-flow mb-prod-salvar-btn" type="button">Salvar item</button>
      </li>
    `;

    row.querySelector('.mb-prod-remove')
       .addEventListener('click', () => {
         this.#mediaP2P.cancelar(uid); // revoga blob URL pendente antes de remover
         row.remove();
       });

    row.querySelector(`#${uid}`)
       .addEventListener('change', e => this.#onUploadImagemItem(e, row, uid));

    row.querySelector('.mb-prod-salvar-btn')
       .addEventListener('click', () => this.#salvarProdutoUnico(row));

    lista.appendChild(row);
  }

  /**
   * Seleção de imagem de um item — usa MediaP2P para preview local imediato.
   * O arquivo fica pendente em memória; o upload real ocorre em #salvarProdutoUnico.
   */
  async #onUploadImagemItem(e, row, uid) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const blobUrl = await this.#mediaP2P.registrar(file, uid);
    if (!blobUrl) return; // usuário cancelou a confirmação

    row.querySelector('.mb-cfg-prod-img-preview').src = blobUrl;
    // Remove imagePath salvo anteriormente (será atualizado após upload real no save)
    delete row.dataset.imagePath;
  }

  /**
   * Salva individualmente um item da lista de serviços.
   * Se houver arquivo P2P pendente, faz o upload real antes de salvar no banco.
   */
  async #salvarProdutoUnico(row) {
    const btn  = row.querySelector('.mb-prod-salvar-btn');
    const nome = row.querySelector('.mb-cfg-prod-nome')?.value?.trim();

    if (!nome) {
      NotificationService?.mostrarToast('Atenção', 'Informe o nome do item.', 'sistema');
      return;
    }
    if (!this.#barbershopId) return;

    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

    try {
      const uid   = row.dataset.mediaUid;
      const preco = parseFloat(row.querySelector('.mb-cfg-prod-preco')?.value || '0');
      const dur   = row.dataset.duracao ? parseInt(row.dataset.duracao, 10) : 30;

      // ── Upload P2P: envia direto ao R2 via URL presigned ──────────────────────
      if (uid && this.#mediaP2P.temPendente(uid)) {
        const { publicUrl } = await this.#mediaP2P.fazerUpload(
          uid, 'services', { barbershopId: this.#barbershopId }
        );
        row.dataset.imagePath = publicUrl;
        if (publicUrl) row.querySelector('.mb-cfg-prod-img-preview').src = publicUrl;
      }

      const entry = {
        barbershop_id: this.#barbershopId,
        name:          nome,
        price:         isNaN(preco) ? 0 : preco,
        duration_min:  isNaN(dur)   ? 30 : dur,
        is_active:     true,
      };
      if (row.dataset.produtoId) entry.id          = row.dataset.produtoId;
      if (row.dataset.imagePath) entry.image_path  = row.dataset.imagePath;

      const { data, error } = await SupabaseService.services()
        .upsert(entry, { onConflict: 'id' })
        .select('id')
        .single();
      if (error) throw error;

      if (data?.id) row.dataset.produtoId = data.id;
      NotificationService?.mostrarToast('Salvo', `"${nome}" salvo com sucesso.`, 'sistema');

      // Atualiza cache de serviços para aparecer na modal das cadeiras
      if (this.#barbershopId) {
        this.#servicos = await MinhaBarbeariaPage.#fetchServicos(this.#barbershopId).catch(() => this.#servicos);
      }
    } catch (err) {
      LoggerService.error('[MinhaBarbeariaPage] salvarProdutoUnico:', err);
      NotificationService?.mostrarToast('Erro', 'Não foi possível salvar o item.', 'sistema');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar item'; }
    }
  }

  // ── Salvar configurações ─────────────────────────────────────

  async #salvarConfiguracoes() {
    if (!this.#barbershopId) return;

    const btn = this.#refs.cfgSalvar;
    const msg = this.#refs.cfgMsg;
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    if (msg) msg.textContent = '';

    try {
      const nome        = (this.#refs.cfgNome?.value     ?? '').trim();
      const whatsapp    = (this.#refs.cfgWhats?.value    ?? '').trim() || null;
      const foundedRaw  = (this.#refs.cfgFounded?.value  ?? '').trim();
      const foundedYear = foundedRaw ? (parseInt(foundedRaw, 10) || null) : null;

      const payload = { whatsapp, founded_year: foundedYear };
      if (nome) payload.name = nome;

      const { error } = await SupabaseService.barbershops()
        .update(payload)
        .eq('id', this.#barbershopId);
      if (error) throw error;

      await this.#salvarProdutos();

      // Fechar campos editáveis e atualizar exibição
      this.#_fecharEl(this.#refs.cfgNome,    this.#refs.cfgNomeDisplay,    this.#refs.cfgNomeLapis);
      this.#_fecharEl(this.#refs.cfgWhats,   this.#refs.cfgWhatsDisplay,   this.#refs.cfgWhatsLapis);
      this.#_fecharEl(this.#refs.cfgFounded, this.#refs.cfgFoundedDisplay, this.#refs.cfgFoundedLapis);

      // Atualizar cache + info card
      if (this.#shopData) {
        if (nome) this.#shopData.name = nome;
        this.#shopData.whatsapp     = whatsapp;
        this.#shopData.founded_year = foundedYear;
        this.#renderInfoCard(this.#shopData);
      }

      AnimationService.gaspar(msg, '✓ Salvo com Sucesso', 3500, 'gaspar-ok');
      if (nome && this.#refs.nome) {
        this.#refs.nome.textContent = nome;
        if (this.#shopData?.font_key && typeof FonteSalao !== 'undefined')
          FonteSalao.aplicarFonte(this.#refs.nome, this.#shopData.font_key);
      }
    } catch (err) {
      console.error('[MinhaBarbeariaPage] salvarConfiguracoes erro:', err);
      if (msg) msg.textContent = '❌ Erro ao salvar. Tente novamente.';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar alterações'; }
    }
  }

  async #salvarProdutos() {
    const lista = this.#refs.cfgProdutos;
    if (!lista) return;

    const upserts = [];
    lista.querySelectorAll('.mb-cfg-produto-row').forEach(row => {
      const nome  = row.querySelector('.mb-cfg-prod-nome')?.value?.trim();
      const preco = parseFloat(row.querySelector('.mb-cfg-prod-preco')?.value || '0');
      const dur   = row.dataset.duracao ? parseInt(row.dataset.duracao, 10) : 30;
      if (!nome) return;

      const entry = {
        barbershop_id: this.#barbershopId,
        name:          nome,
        price:         isNaN(preco) ? 0 : preco,
        duration_min:  isNaN(dur)   ? 30 : dur,
        is_active:     true,
      };
      if (row.dataset.produtoId) entry.id          = row.dataset.produtoId;
      if (row.dataset.imagePath) entry.image_path  = row.dataset.imagePath;
      upserts.push(entry);
    });

    if (!upserts.length) return;

    const { error } = await SupabaseService.services()
      .upsert(upserts, { onConflict: 'id' });
    if (error) throw error;
  }

  // ── Upload de mídia (vídeo/imagem) ───────────────────────────

  async #onUploadMidia(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !this.#barbershopId) return;

    const MAX_BYTES = 30 * 1024 * 1024; // 30 MB
    if (file.size > MAX_BYTES) {
      NotificationService?.mostrarToast('Limite', 'O arquivo deve ter no máximo 30 MB.', 'sistema');
      return;
    }

    const perfil = AuthService.getPerfil();
    const quota  = await MinhaBarbeariaPage.#fetchQuotaHoje(perfil.id, this.#barbershopId);
    if (quota >= (this.#isOwner ? 3 : 1)) {
      NotificationService?.mostrarToast('Limite diário', 'Você atingiu o limite de postagens hoje.', 'sistema');
      return;
    }

    const addBtn = this.#refs.addBtn;
    if (addBtn) { addBtn.textContent = '⏳'; addBtn.style.pointerEvents = 'none'; }

    try {
      // ── Fluxo correto: browser → R2 via presigned URL do BFF ───
      // 1. Registrar arquivo localmente (sem upload ainda)
      const uid     = `story-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const blobUrl = await this.#mediaP2P.registrar(file, uid);
      if (!blobUrl) {
        if (addBtn) { addBtn.textContent = '＋'; addBtn.style.pointerEvents = ''; }
        return; // usuário cancelou a confirmação
      }

      // 2. Upload P2P: browser → R2 direto via URL presigned
      const { publicUrl } = await this.#mediaP2P.fazerUpload(uid, 'stories', {
        barbershopId: this.#barbershopId,
        mediaType:    file.type.startsWith('video') ? 'video' : 'image',
        expiresAt:    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      // 3. Registrar story no banco (metadados — arquivo já está no R2)
      const { error: dbErr } = await SupabaseService.client
        .from('stories')
        .insert({
          owner_id:      perfil.id,
          barbershop_id: this.#barbershopId,
          media_url:     publicUrl,
          media_type:    file.type.startsWith('video') ? 'video' : 'image',
          expires_at:    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      if (dbErr) throw dbErr;

      NotificationService?.mostrarToast('Publicado', 'Seu story foi publicado por 24h!', 'sistema');
      this.#carregou = false;
      this.#carregar();

    } catch (err) {
      LoggerService?.warn('[MinhaBarbeariaPage] onUploadMidia erro:', err.message);
      NotificationService?.mostrarToast('Erro', 'Falha ao enviar mídia. Tente novamente.', 'sistema');
      if (addBtn) { addBtn.textContent = '＋'; addBtn.style.pointerEvents = ''; }
    }
  }

  // ── Upload de imagem da barbearia (método base DRY) ─────────

  /**
   * Faz upload de uma imagem para o bucket 'barbershops' e atualiza
   * o campo correspondente no banco.
   *
   * @param {File}   file      — arquivo selecionado
   * @param {string} nomeArq  — nome do arquivo sem extensão (ex: 'cover', 'logo')
   * @param {string} campo    — coluna a atualizar (ex: 'cover_path', 'logo_path')
   * @returns {Promise<{url: string, path: string}>}
   */
  async #uploadImagemBarbearia(file, nomeArq, campo) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `${this.#barbershopId}/${nomeArq}.${ext}`;

    const { error: upErr } = await SupabaseService.storageBarbershops()
      .upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) throw upErr;

    const { error: dbErr } = await SupabaseService.barbershops()
      .update({ [campo]: path })
      .eq('id', this.#barbershopId);
    if (dbErr) throw dbErr;

    return { url: SupabaseService.getLogoUrl(path), path };
  }

  // ── Upload de capa ───────────────────────────────────────────

  async #onUploadCapa(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !this.#barbershopId) return;

    try {
      const { url, path } = await this.#uploadImagemBarbearia(file, 'cover', 'cover_path');
      if (url) {
        if (this.#refs.cfgCapaImg) this.#refs.cfgCapaImg.src = url;
        if (this.#refs.coverImg)   this.#refs.coverImg.src   = url;
        if (this.#shopData)        this.#shopData.cover_path = path;
      }
    } catch (err) {
      console.error('[MinhaBarbeariaPage] onUploadCapa erro:', err);
    }
  }

  // ── Upload de logo ───────────────────────────────────────────

  async #onUploadLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !this.#barbershopId) return;

    try {
      const { url } = await this.#uploadImagemBarbearia(file, 'logo', 'logo_path');
      if (url && this.#refs.cfgLogoImg) {
        this.#refs.cfgLogoImg.src = url;
        if (this.#refs.cfgIconeWrap) this.#refs.cfgIconeWrap.style.backgroundImage = `url('${url}')`;
      }
    } catch (err) {
      console.error('[MinhaBarbeariaPage] onUploadLogo erro:', err);
    }
  }

  // ── GPS: pré-preenchimento e métodos ─────────────────────────

  #preencherGpsForm() {
    const s = this.#shopData;
    this.#coordsGps = null;
    this.#mostrarGpsMsg('', '');
    const ct  = this.#refs.gpsCoordsT;
    const btn = this.#refs.gpsBtnGps;
    if (ct)  ct.textContent  = '';
    if (btn) { btn.textContent = '📍 Ativar GPS'; btn.disabled = false; }
    // Fecha todos os campos GPS (mostra display, esconde input)
    this.#_fecharCepRow();
    const camposGps = [
      [this.#refs.gpsLogradouro,  this.#refs.gpsRuaDisplay,     this.#refs.gpsRuaLapis],
      [this.#refs.gpsBairro,      this.#refs.gpsBairroDisplay,  this.#refs.gpsBairroLapis],
      [this.#refs.gpsCidade,      this.#refs.gpsCidadeDisplay,  this.#refs.gpsCidadeLapis],
      [this.#refs.gpsNumero,      this.#refs.gpsNumDisplay,     this.#refs.gpsNumLapis],
      [this.#refs.gpsComplemento, this.#refs.gpsCompDisplay,    this.#refs.gpsCompLapis],
    ];
    camposGps.forEach(([inp, disp, lap]) => {
      if (inp) { inp.style.display = 'none'; inp.value = ''; }
      if (disp) disp.textContent = '—';
      lap?.classList.remove('mb-cfg-lapis-ativo');
    });

    if (!s) return;

    // CEP
    const rawCep = (s.zip_code ?? '').replace(/\D/g, '');
    const fmtCep = rawCep.length === 8 ? rawCep.replace(/(\d{5})(\d{3})/, '$1-$2') : (s.zip_code ?? '');
    if (this.#refs.gpsCep) this.#refs.gpsCep.value = fmtCep;
    if (this.#refs.gpsCepDisplay) this.#refs.gpsCepDisplay.textContent = fmtCep || 'Não informado';

    // Logradouro — exibe endereço salvo; input inicia vazio para re-edição limpa
    if (this.#refs.gpsRuaDisplay) this.#refs.gpsRuaDisplay.textContent = s.address || '—';

    // Bairro
    const bairro = s.neighborhood ?? '';
    if (this.#refs.gpsBairro) this.#refs.gpsBairro.value = bairro;
    if (this.#refs.gpsBairroDisplay) this.#refs.gpsBairroDisplay.textContent = bairro || '—';

    // Cidade / Estado
    const cidadeVal = s.city ? (s.state ? `${s.city} / ${s.state}` : s.city) : '';
    if (this.#refs.gpsCidade) this.#refs.gpsCidade.value = cidadeVal;
    if (this.#refs.gpsCidadeDisplay) this.#refs.gpsCidadeDisplay.textContent = cidadeVal || '—';

    // Coordenadas
    if (s.latitude && s.longitude) {
      this.#coordsGps = { lat: +s.latitude, lng: +s.longitude };
      if (ct) ct.textContent = `${this.#coordsGps.lat.toFixed(5)}, ${this.#coordsGps.lng.toFixed(5)}`;
    }
  }

  #onCepInput(e) {
    let v = e.target.value.replace(/\D/g, '').slice(0, 8);
    e.target.value = v.length > 5 ? v.replace(/(\d{5})(\d{1,3})/, '$1-$2') : v;
  }

  async #buscarCep() {
    const cep = this.#refs.gpsCep?.value.replace(/\D/g, '');
    if (!cep || cep.length !== 8) {
      this.#mostrarGpsMsg('Digite um CEP válido (8 dígitos).', 'erro'); return;
    }
    const btnB = this.#refs.gpsBtnBuscar;
    if (btnB) { btnB.textContent = '...'; btnB.disabled = true; }
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!res.ok) throw new Error('http');
      const d = await res.json();
      if (d.erro) { this.#mostrarGpsMsg('CEP não encontrado.', 'erro'); return; }
      // Atualiza inputs e displays dos campos auto-preenchidos
      const rua    = d.logradouro ?? '';
      const bairro = d.bairro     ?? '';
      const cidade = d.localidade && d.uf ? `${d.localidade} / ${d.uf}` : (d.localidade ?? '');
      if (this.#refs.gpsLogradouro)    this.#refs.gpsLogradouro.value                = rua;
      if (this.#refs.gpsRuaDisplay)    this.#refs.gpsRuaDisplay.textContent          = rua    || '—';
      if (this.#refs.gpsBairro)        this.#refs.gpsBairro.value                    = bairro;
      if (this.#refs.gpsBairroDisplay) this.#refs.gpsBairroDisplay.textContent       = bairro || '—';
      if (this.#refs.gpsCidade)        this.#refs.gpsCidade.value                    = cidade;
      if (this.#refs.gpsCidadeDisplay) this.#refs.gpsCidadeDisplay.textContent       = cidade || '—';
      // Fecha CEP; abre Número automaticamente para o usuário preencher
      this.#_fecharCepRow();
      this.#mostrarGpsMsg('', '');
      this.#_toggleEl(this.#refs.gpsNumero, this.#refs.gpsNumDisplay, this.#refs.gpsNumLapis, '—');
    } catch {
      this.#mostrarGpsMsg('Não foi possível consultar o CEP.', 'erro');
    } finally {
      if (btnB) { btnB.textContent = 'Buscar'; btnB.disabled = false; }
    }
  }

  #ativarGps() {
    if (!('geolocation' in navigator)) {
      this.#mostrarGpsMsg('GPS não disponível neste dispositivo.', 'erro'); return;
    }
    const btn = this.#refs.gpsBtnGps;
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.#coordsGps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (this.#refs.gpsCoordsT)
          this.#refs.gpsCoordsT.textContent =
            `${this.#coordsGps.lat.toFixed(5)}, ${this.#coordsGps.lng.toFixed(5)}`;
        if (btn) { btn.textContent = '📍 GPS Ativo ✅'; btn.disabled = false; }
        this.#mostrarGpsMsg('GPS capturado com sucesso.', 'ok');
      },
      err => {
        const msgs = {
          1: 'Permissão negada. Ative a localização nas configurações.',
          2: 'Posição indisponível.',
          3: 'Tempo esgotado. Tente novamente.',
        };
        this.#mostrarGpsMsg(msgs[err.code] ?? 'Erro ao obter GPS.', 'erro');
        if (btn) { btn.textContent = '📍 Ativar GPS'; btn.disabled = false; }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  async #salvarGps() {
    const cep      = this.#refs.gpsCep?.value.replace(/\D/g, '')       ?? '';
    const rua      = this.#refs.gpsLogradouro?.value.trim()            ?? '';
    const num      = this.#refs.gpsNumero?.value.trim()                ?? '';
    const cidadeUf = this.#refs.gpsCidade?.value.trim()                ?? '';
    const comp     = this.#refs.gpsComplemento?.value.trim()           ?? '';
    const bairro   = this.#refs.gpsBairro?.value.trim()                ?? '';

    // Mantém endereço existente se logradouro não foi editado
    const address = rua
      ? [rua, num, comp].filter(Boolean).join(', ')
      : (this.#shopData?.address ?? null);

    if (!address) {
      this.#mostrarGpsMsg('Informe o CEP e o logradouro para configurar o endereço.', 'erro'); return;
    }
    if (!this.#barbershopId) {
      this.#mostrarGpsMsg('Barbearia não encontrada.', 'erro'); return;
    }
    const [city, state] = cidadeUf.includes('/')
      ? cidadeUf.split('/').map(s => s.trim())
      : [cidadeUf.trim(), ''];

    const payload = {
      address,
      city:         city    || null,
      state:        state   || null,
      zip_code:     cep     || null,
      neighborhood: bairro  || null,
      updated_at:   new Date().toISOString(),
    };
    if (this.#coordsGps) {
      payload.latitude  = this.#coordsGps.lat;
      payload.longitude = this.#coordsGps.lng;
    }

    const btn = this.#refs.gpsBtnSalvar;
    if (btn) { btn.textContent = 'Salvando…'; btn.disabled = true; }
    let _sucesso = false;

    try {
      const { error } = await SupabaseService.barbershops()
        .update(payload)
        .eq('id', this.#barbershopId);
      if (error) throw error;

      // Atualiza cache e re-preenche painel (fecha todos os lápis, mostra valores salvos)
      if (this.#shopData) {
        Object.assign(this.#shopData, {
          address, city: city||null, state: state||null, zip_code: cep||null,
          neighborhood: bairro || null,
        });
        if (this.#coordsGps) {
          this.#shopData.latitude  = this.#coordsGps.lat;
          this.#shopData.longitude = this.#coordsGps.lng;
        }
        this.#renderInfoCard(this.#shopData);
      }
      this.#preencherGpsForm();

      _sucesso = true;
      AnimationService.gaspar(this.#refs.gpsMsg, '✓ Salvo com Sucesso', 3500, 'gaspar-ok');
      NotificationService?.mostrarToast('Localização', 'Endereço atualizado!', 'sistema');
    } catch (err) {
      console.error('[MinhaBarbeariaPage] salvarGps:', err);
      this.#mostrarGpsMsg('Erro ao salvar. Tente novamente.', 'erro');
    } finally {
      if (btn) {
        btn.textContent = 'Salvar Endereço';
        // Após salvo com sucesso o botão fica desabilitado (apagado) — sinal visual de "já salvo"
        if (!_sucesso) btn.disabled = false;
      }
    }
  }

  #mostrarGpsMsg(texto, tipo) {
    const el = this.#refs.gpsMsg;
    if (!el) return;
    el.textContent = texto;
    el.className   = tipo === 'ok'  ? 'gps-msg gps-msg--ok'
                   : tipo === 'erro'? 'gps-msg gps-msg--erro'
                   : 'gps-msg';
  }

  // ── Helpers ─────────────────────────────────────────────────

  static #formatarNumero(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  static #escapeAttr(str) {
    return String(str ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Card de informações (endereço + contato + fundação) ─────

  #renderInfoCard(shop) {
    const { infoCard, infoNome, infoRua, infoCidade, infoDesde, infoWhats } = this.#refs;
    if (!infoCard) return;

    const temDados = shop.address || shop.city || shop.whatsapp || shop.founded_year;
    if (!temDados) { infoCard.hidden = true; return; }

    if (infoNome) infoNome.textContent = shop.name ?? '';

    if (infoRua) {
      infoRua.textContent = shop.address || '';
      infoRua.hidden = !shop.address;
    }

    if (infoCidade) {
      const partes = [shop.neighborhood, shop.city, shop.state].filter(Boolean);
      infoCidade.textContent = partes.join(' · ');
      infoCidade.hidden = partes.length === 0;
    }

    if (infoDesde) {
      infoDesde.textContent = shop.founded_year ? `Desde ${shop.founded_year}` : '';
      infoDesde.hidden = !shop.founded_year;
    }

    if (infoWhats) {
      infoWhats.textContent = shop.whatsapp
        ? `📲 Para mais informações: WhatsApp ${shop.whatsapp}` : '';
      infoWhats.hidden = !shop.whatsapp;
    }

    infoCard.hidden = false;
  }

  // ── Lápis — genérico ─────────────────────────────────────────

  #_toggleEl(inputEl, displayEl, lapisEl, placeholder = 'Não informado') {
    if (!inputEl) return;
    const abrir = inputEl.style.display === 'none';
    if (abrir) {
      inputEl.style.display = '';
      if (displayEl) displayEl.style.display = 'none';
      lapisEl?.classList.add('mb-cfg-lapis-ativo');
      inputEl.focus?.();
    } else {
      this.#_fecharEl(inputEl, displayEl, lapisEl, placeholder);
    }
  }

  #_fecharEl(inputEl, displayEl, lapisEl, placeholder = 'Não informado') {
    if (!inputEl) return;
    const val = inputEl.value?.trim() ?? '';
    if (displayEl) {
      displayEl.style.display = '';
      displayEl.textContent   = val || placeholder;
    }
    inputEl.style.display = 'none';
    lapisEl?.classList.remove('mb-cfg-lapis-ativo');
  }

  // CEP: container row em vez do input direto
  #_toggleCepRow() {
    const row = this.#refs.gpsCepRow;
    if (!row) return;
    const abrir = row.style.display === 'none';
    if (abrir) {
      row.style.display = '';
      if (this.#refs.gpsCepDisplay) this.#refs.gpsCepDisplay.style.display = 'none';
      this.#refs.gpsCepLapis?.classList.add('mb-cfg-lapis-ativo');
      this.#refs.gpsCep?.focus();
    } else {
      this.#_fecharCepRow();
    }
  }

  #_fecharCepRow() {
    const val = this.#refs.gpsCep?.value.trim() ?? '';
    if (this.#refs.gpsCepDisplay) {
      this.#refs.gpsCepDisplay.style.display = '';
      this.#refs.gpsCepDisplay.textContent   = val || 'Não informado';
    }
    if (this.#refs.gpsCepRow) this.#refs.gpsCepRow.style.display = 'none';
    this.#refs.gpsCepLapis?.classList.remove('mb-cfg-lapis-ativo');
  }

  #mostrarSkeleton() {
    const { kpiRating, kpiClientes, kpiLikes, kpiPortfolio } = this.#refs;
    [kpiRating, kpiClientes, kpiLikes, kpiPortfolio].forEach(el => {
      if (el) el.textContent = '…';
    });
  }

  #mostrarVazio() {
    if (this.#refs.nome) this.#refs.nome.textContent = 'Nenhuma barbearia vinculada';
  }

  #mostrarErro() {
    if (this.#refs.nome) this.#refs.nome.textContent = 'Erro ao carregar';
  }
}
