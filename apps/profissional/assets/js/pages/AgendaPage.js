'use strict';

// =============================================================
// AgendaPage.js — Tela "Agenda" do app profissional.
// Exibe os agendamentos do profissional logado por período
// (Hoje / Amanhã / Semana / Mês) com troca de status inline.
//
// Dependências: AppointmentRepository.js, AuthService.js,
//               AppState.js, SupabaseService.js
// =============================================================

class AgendaPage {

  #telaEl    = null;
  #listaEl   = null;
  #filtros   = null;     // botões de período
  #periodo   = 'hoje';   // período selecionado
  #cache     = {};       // { hoje: [...], amanha: [...], ... }

  // ── Mapeamento período → método do repositório ─────────────
  static #FETCH = {
    hoje:   (id) => AppointmentRepository.getHoje(id),
    amanha: (id) => AppointmentRepository.getAmanha(id),
    semana: (id) => AppointmentRepository.getSemana(id),
    mes:    (id) => AppointmentRepository.getMes(id),
  };

  // ── Status legíveis ao usuário ──────────────────────────────
  static #STATUS_LABEL = {
    pending:     'Pendente',
    confirmed:   'Confirmado',
    in_progress: 'Em curso',
    done:        'Concluído',
    cancelled:   'Cancelado',
    no_show:     'Não compareceu',
  };

  // Quais transições são permitidas a partir de cada status
  static #PROXIMOS_STATUS = {
    pending:     ['confirmed', 'cancelled'],
    confirmed:   ['in_progress', 'cancelled'],
    in_progress: ['done', 'no_show'],
    done:        [],
    cancelled:   [],
    no_show:     [],
  };

  constructor() {}

  bind() {
    this.#telaEl  = document.getElementById('tela-agenda');
    this.#listaEl = document.getElementById('agenda-lista');
    this.#filtros = document.querySelectorAll('#tela-agenda .filtro-periodo');
    if (!this.#telaEl) return;

    // Filtros de período
    this.#filtros.forEach(btn => {
      btn.addEventListener('click', () => {
        this.#filtros.forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        this.#periodo = btn.dataset.periodo;
        this.#renderPeriodo();
      });
    });

    // Carrega ao entrar na tela
    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) this.#renderPeriodo();
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── Privados ────────────────────────────────────────────────

  async #renderPeriodo() {
    if (!this.#listaEl) return;
    if (this.#cache[this.#periodo]) {
      this.#renderLista(this.#cache[this.#periodo]);
      return;
    }
    this.#listaEl.innerHTML = this.#skeleton(5);
    await this.#carregar();
  }

  async #carregar() {
    const perfil = AuthService.getPerfil();
    if (!perfil?.id) {
      this.#listaEl.innerHTML = '<p class="agenda-vazio">Faça login para ver sua agenda.</p>';
      return;
    }

    try {
      const fn   = AgendaPage.#FETCH[this.#periodo];
      const data = await fn(perfil.id);
      this.#cache[this.#periodo] = data;
      this.#renderLista(data);
    } catch (err) {
      console.error('[AgendaPage] erro:', err);
      this.#listaEl.innerHTML = '<p class="agenda-vazio agenda-erro">Erro ao carregar agenda.</p>';
    }
  }

  #renderLista(lista) {
    if (!lista.length) {
      this.#listaEl.innerHTML = '<p class="agenda-vazio">Nenhum agendamento neste período.</p>';
      return;
    }
    this.#listaEl.innerHTML = '';
    lista.forEach(a => this.#listaEl.appendChild(this.#criarCard(a)));
  }

  #criarCard(a) {
    const dt     = new Date(a.scheduled_at);
    const hora   = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const nome   = a.client?.full_name ?? '—';
    const serv   = a.service?.name    ?? '—';
    const dur    = a.service?.duration_min ?? a.duration_min ?? '—';
    const preco  = a.price_charged != null
      ? `R$ ${Number(a.price_charged).toFixed(2).replace('.', ',')}`
      : (a.service?.price != null ? `R$ ${Number(a.service.price).toFixed(2).replace('.', ',')}` : '');
    const statusLabel = AgendaPage.#STATUS_LABEL[a.status] ?? a.status;
    const proximos    = AgendaPage.#PROXIMOS_STATUS[a.status] ?? [];

    const card = document.createElement('div');
    card.className = `agenda-item agenda-item--${a.status}`;
    card.dataset.appointmentId = a.id;

    // Avatar do cliente
    let avatarHTML;
    if (a.client?.avatar_path) {
      const url = SupabaseService.getAvatarUrl(a.client.avatar_path) || '';
      avatarHTML = `<img src="${url}" alt="${nome}" onerror="this.outerHTML='👤'">`;
    } else {
      avatarHTML = '👤';
    }

    // Dropdown de próximos status (só se houver transição possível)
    const acoesHTML = proximos.length
      ? `<div class="agenda-acoes">
          ${proximos.map(s => `
            <button class="badge agenda-badge-acao agenda-badge-acao--${s}"
                    data-appointment-id="${a.id}"
                    data-novo-status="${s}">
              ${AgendaPage.#STATUS_LABEL[s]}
            </button>`).join('')}
        </div>`
      : '';

    card.innerHTML = `
      <div class="agenda-time">
        <span class="agenda-hr">${hora}</span>
      </div>
      <div class="avatar gold">${avatarHTML}</div>
      <div class="agenda-info">
        <p class="agenda-name">${nome}</p>
        <p class="agenda-serv">${serv} · ${dur} min</p>
        ${preco ? `<p class="agenda-val">${preco}</p>` : ''}
      </div>
      <span class="badge agenda-status agenda-status--${a.status}">${statusLabel}</span>
      ${acoesHTML}
    `;

    // Delegação de cliques nos botões de ação
    card.querySelectorAll('.agenda-badge-acao').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.#mudarStatus(a.id, btn.dataset.novoStatus, card);
      });
    });

    return card;
  }

  async #mudarStatus(id, novoStatus, cardEl) {
    // Desabilita todos os botões do card durante a operação
    cardEl.querySelectorAll('button').forEach(b => { b.disabled = true; });

    try {
      await AppointmentRepository.updateStatus(id, novoStatus);
      // Invalida cache do período atual para forçar re-fetch
      delete this.#cache[this.#periodo];
      await this.#carregar();
    } catch (err) {
      console.error('[AgendaPage] erro ao atualizar status:', err);
      cardEl.querySelectorAll('button').forEach(b => { b.disabled = false; });
      NotificationService?.mostrarToast('Erro', 'Não foi possível atualizar o agendamento.', 'sistema');
    }
  }

  #skeleton(n) {
    return Array.from({ length: n }, () =>
      `<div class="agenda-item agenda-skeleton">
        <div class="skel skel-time"></div>
        <div class="skel skel-avatar"></div>
        <div class="skel-info">
          <div class="skel skel-nome"></div>
          <div class="skel skel-serv"></div>
        </div>
      </div>`
    ).join('');
  }
}
