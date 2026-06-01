'use strict';

// =============================================================
// GpsPage.js — Tela "GPS / Endereço da Barbearia"
//
// Responsabilidades:
//  • Buscar endereço via CEP (ViaCEP API) → preenche logradouro,
//    bairro e cidade automaticamente; usuário insere só o número.
//  • Solicitar coordenadas GPS via Geolocation API.
//  • Salvar address, city, state, zip_code, latitude, longitude
//    na tabela barbershops do Supabase.
//  • Endereço atualizado reflete em todos os cards do app.
//
// Dependências: AuthService, SupabaseService, NotificationService
// =============================================================

class GpsPage {

  // ── Estado ─────────────────────────────────────────────────
  #telaEl       = null;
  #refs         = {};
  #coords       = null;   // { lat, lng }
  #barbershopId = null;

  constructor() {}

  // ── Ponto de entrada ────────────────────────────────────────

  bind() {
    this.#telaEl = document.getElementById('tela-gps-barbearia');
    if (!this.#telaEl) return;

    this.#cacheRefs();
    this.#bindEventos();

    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) this.#aoEntrar();
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── DOM refs ────────────────────────────────────────────────

  #cacheRefs() {
    const q = id => document.getElementById(id);
    this.#refs = {
      cep:         q('gps-cep'),
      btnBuscar:   q('gps-btn-buscar'),
      logradouro:  q('gps-logradouro'),
      bairro:      q('gps-bairro'),
      cidade:      q('gps-cidade'),
      numero:      q('gps-numero'),
      complemento: q('gps-complemento'),
      btnGps:      q('gps-btn-gps'),
      coordsTxt:   q('gps-coords-txt'),
      msg:         q('gps-msg'),
      btnSalvar:   q('gps-btn-salvar'),
    };
  }

  // ── Eventos ─────────────────────────────────────────────────

  #bindEventos() {
    this.#refs.cep?.addEventListener('input', e => this.#onCepInput(e));
    this.#refs.btnBuscar?.addEventListener('click', () => this.#buscarCep());
    this.#refs.btnGps?.addEventListener('click',    () => this.#ativarGps());
    this.#refs.btnSalvar?.addEventListener('click', () => this.#salvar());
  }

  // ── Ao entrar na tela ───────────────────────────────────────

  async #aoEntrar() {
    // Limpa mensagens anteriores
    this.#coords = null;
    this.#mostrarMsg('', '');
    if (this.#refs.coordsTxt)  this.#refs.coordsTxt.textContent = '';
    const btn = this.#refs.btnGps;
    if (btn) { btn.textContent = '📍 Ativar GPS'; btn.disabled = false; }

    // Pré-preenche com dados já salvos
    try {
      const perfil = AuthService.getPerfil();
      if (!perfil?.id) return;
      const shop = await GpsPage.#fetchShop(perfil.id);
      if (!shop) return;
      this.#barbershopId = shop.id;
      this.#preencherFormulario(shop);
    } catch (_) { /* silencioso — não impede o uso */ }
  }

  // ── Pré-preenchimento ────────────────────────────────────────

  #preencherFormulario(shop) {
    if (shop.zip_code && this.#refs.cep) {
      const raw = shop.zip_code.replace(/\D/g, '');
      this.#refs.cep.value = raw.length === 8
        ? raw.replace(/(\d{5})(\d{3})/, '$1-$2')
        : shop.zip_code;
    }
    if (shop.address && this.#refs.logradouro)
      this.#refs.logradouro.value = shop.address;
    if (shop.city && this.#refs.cidade) {
      this.#refs.cidade.value = shop.state
        ? `${shop.city} / ${shop.state}`
        : shop.city;
    }
    if (shop.latitude && shop.longitude) {
      this.#coords = { lat: Number(shop.latitude), lng: Number(shop.longitude) };
      if (this.#refs.coordsTxt)
        this.#refs.coordsTxt.textContent =
          `${this.#coords.lat.toFixed(5)}, ${this.#coords.lng.toFixed(5)}`;
    }
  }

  // ── Busca CEP ────────────────────────────────────────────────

  #onCepInput(e) {
    // Apenas aplica máscara; busca só via botão "Buscar"
    let v = e.target.value.replace(/\D/g, '').slice(0, 8);
    e.target.value = v.length > 5 ? v.replace(/(\d{5})(\d{1,3})/, '$1-$2') : v;
  }

  async #buscarCep() {
    const cep = this.#refs.cep?.value.replace(/\D/g, '');
    if (!cep || cep.length !== 8) {
      this.#mostrarMsg('Digite um CEP válido (8 dígitos).', 'erro');
      return;
    }

    const btnB = this.#refs.btnBuscar;
    if (btnB) { btnB.textContent = '...'; btnB.disabled = true; }

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!res.ok) throw new Error('http');
      const d = await res.json();
      if (d.erro) {
        this.#mostrarMsg('CEP não encontrado.', 'erro');
        return;
      }
      if (this.#refs.logradouro) this.#refs.logradouro.value = d.logradouro ?? '';
      if (this.#refs.bairro)     this.#refs.bairro.value     = d.bairro     ?? '';
      if (this.#refs.cidade)     this.#refs.cidade.value     = d.localidade && d.uf
        ? `${d.localidade} / ${d.uf}`
        : (d.localidade ?? '');
      this.#mostrarMsg('', '');
      this.#refs.numero?.focus();
    } catch {
      this.#mostrarMsg('Não foi possível consultar o CEP. Verifique sua conexão.', 'erro');
    } finally {
      if (btnB) { btnB.textContent = 'Buscar'; btnB.disabled = false; }
    }
  }

  // ── Ativar GPS ───────────────────────────────────────────────

  #ativarGps() {
    if (!('geolocation' in navigator)) {
      this.#mostrarMsg('GPS não disponível neste dispositivo.', 'erro');
      return;
    }
    const btn = this.#refs.btnGps;
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

    navigator.geolocation.getCurrentPosition(
      pos => {
        this.#coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (this.#refs.coordsTxt)
          this.#refs.coordsTxt.textContent =
            `${this.#coords.lat.toFixed(5)}, ${this.#coords.lng.toFixed(5)}`;
        if (btn) { btn.textContent = '📍 GPS Ativo ✅'; btn.disabled = false; }
        this.#mostrarMsg('GPS capturado com sucesso.', 'ok');
      },
      err => {
        const mensagens = {
          1: 'Permissão negada. Ative a localização nas configurações do dispositivo.',
          2: 'Posição indisponível. Tente em local aberto.',
          3: 'Tempo esgotado. Tente novamente.',
        };
        this.#mostrarMsg(mensagens[err.code] ?? 'Erro ao obter GPS.', 'erro');
        if (btn) { btn.textContent = '📍 Ativar GPS'; btn.disabled = false; }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  // ── Salvar no Supabase ───────────────────────────────────────

  async #salvar() {
    const cep        = this.#refs.cep?.value.replace(/\D/g, '') ?? '';
    const rua        = this.#refs.logradouro?.value.trim()  ?? '';
    const num        = this.#refs.numero?.value.trim()      ?? '';
    const bairro     = this.#refs.bairro?.value.trim()      ?? '';
    const cidadeUf   = this.#refs.cidade?.value.trim()      ?? '';
    const comp       = this.#refs.complemento?.value.trim() ?? '';

    if (!rua) {
      this.#mostrarMsg('Informe o CEP para preencher o endereço.', 'erro');
      return;
    }
    if (!num) {
      this.#mostrarMsg('Informe o número do estabelecimento.', 'erro');
      this.#refs.numero?.focus();
      return;
    }

    // Garante que temos o ID da barbearia
    if (!this.#barbershopId) {
      const perfil = AuthService.getPerfil();
      if (!perfil?.id) {
        this.#mostrarMsg('Usuário não autenticado.', 'erro');
        return;
      }
      const shop = await GpsPage.#fetchShop(perfil.id);
      if (!shop) {
        this.#mostrarMsg('Barbearia não encontrada. Crie sua barbearia primeiro.', 'erro');
        return;
      }
      this.#barbershopId = shop.id;
    }

    // Monta endereço completo (sem duplicar bairro quando já está em address)
    const partes = [rua, num, comp].filter(Boolean);
    const address = partes.join(', ');
    const [city, state] = cidadeUf.includes('/')
      ? cidadeUf.split('/').map(s => s.trim())
      : [cidadeUf.trim(), ''];

    const payload = {
      address,
      city:     city   || null,
      state:    state  || null,
      zip_code: cep    || null,
      updated_at: new Date().toISOString(),
    };
    if (this.#coords) {
      payload.latitude  = this.#coords.lat;
      payload.longitude = this.#coords.lng;
    }

    const btn = this.#refs.btnSalvar;
    if (btn) { btn.textContent = 'Salvando…'; btn.disabled = true; }

    try {
      const { error } = await SupabaseService.barbershops()
        .update(payload)
        .eq('id', this.#barbershopId);
      if (error) throw error;
      this.#mostrarMsg('✅ Endereço salvo! Sua barbearia já aparece no mapa.', 'ok');
      NotificationService?.mostrarToast('Localização', 'Endereço atualizado!', 'sistema');
    } catch (err) {
      console.error('[GpsPage] salvar:', err);
      this.#mostrarMsg('Erro ao salvar. Tente novamente.', 'erro');
    } finally {
      if (btn) { btn.textContent = 'Salvar Endereço'; btn.disabled = false; }
    }
  }

  // ── Util ─────────────────────────────────────────────────────

  #mostrarMsg(texto, tipo) {
    const el = this.#refs.msg;
    if (!el) return;
    el.textContent = texto;
    el.className   = tipo === 'ok'
      ? 'gps-msg gps-msg--ok'
      : tipo === 'erro'
        ? 'gps-msg gps-msg--erro'
        : 'gps-msg';
  }

  // ── Fetcher ──────────────────────────────────────────────────

  static async #fetchShop(ownerId) {
    const { data, error } = await SupabaseService.barbershops()
      .select('id, name, address, city, state, zip_code, latitude, longitude')
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') return null;
    return data ?? null;
  }
}
