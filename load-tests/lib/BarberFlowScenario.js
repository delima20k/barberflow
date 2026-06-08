'use strict';

class BarberFlowScenario {
  #client;
  #config;

  constructor({ client, config }) {
    this.#client = client;
    this.#config = config;
  }

  async runOnce(vu, iteration) {
    await this.#perfil();
    await this.#cadastro(vu, iteration);
    await this.#login();
    await this.#filaAgendamento(vu, iteration);
    await this.#chat(vu, iteration);
    await this.#notificacoes(vu, iteration);
  }

  async #perfil() {
    await this.#client.get('/api/v1/health', { name: 'health' });
    await this.#client.get('/api/v1/barbearias/destaque?limit=5', { name: 'perfil_barbearias_destaque' });
    await this.#client.get('/api/v1/barbearias/todas?limit=10', { name: 'perfil_barbearias_todas' });
    if (this.#config.fixtures.professionalId) {
      await this.#client.get(`/api/v1/profissionais/${this.#config.fixtures.professionalId}/perfil-publico`, {
        name: 'perfil_profissional_publico',
      });
    }
  }

  async #cadastro(vu, iteration) {
    if (!this.#config.enableWrites) {
      await this.#client.post('/api/auth/login', {
        email: `${this.#config.prefix}_cadastro_probe@example.invalid`,
        password: 'invalid-loadtest-password',
      }, { name: 'cadastro_probe_sem_escrita' });
      return;
    }

    await this.#client.post('/api/auth/cadastro-perfil', {
      full_name: `${this.#config.prefix}_user_${vu}_${iteration}`,
      phone: '11999999999',
      role: 'client',
    }, {
      name: 'cadastro_perfil_prefixado',
      token: this.#config.clientToken,
    });
  }

  async #login() {
    if (!this.#config.fixtures.email || !this.#config.fixtures.password) {
      await this.#client.post('/api/auth/login', {
        email: `${this.#config.prefix}_login_probe@example.invalid`,
        password: 'invalid-loadtest-password',
      }, { name: 'login_probe_credencial_invalida' });
      return;
    }

    await this.#client.post('/api/auth/login', {
      email: this.#config.fixtures.email,
      password: this.#config.fixtures.password,
    }, { name: 'login_teste' });
  }

  async #filaAgendamento(vu, iteration) {
    if (this.#config.clientToken) {
      await this.#client.get('/api/agendamentos', {
        name: 'agendamento_listar',
        token: this.#config.clientToken,
      });
    }

    if (!this.#config.enableWrites || !this.#config.clientToken) return;
    if (!this.#config.fixtures.barbershopId || !this.#config.fixtures.professionalId || !this.#config.fixtures.serviceId) return;

    await this.#client.post('/api/agendamentos', {
      professional_id: this.#config.fixtures.professionalId,
      barbershop_id: this.#config.fixtures.barbershopId,
      service_id: this.#config.fixtures.serviceId,
      scheduled_at: new Date(Date.now() + 86_400_000 + (vu * 1000) + iteration).toISOString(),
      notes: `${this.#config.prefix}_agendamento_${vu}_${iteration}`,
    }, {
      name: 'agendamento_criar_prefixado',
      token: this.#config.clientToken,
    });
  }

  async #chat(vu, iteration) {
    if (!this.#config.clientToken) return;

    await this.#client.get('/api/v1/chat/conversations?limit=10', {
      name: 'chat_conversas',
      token: this.#config.clientToken,
    });

    if (!this.#config.enableWrites || !this.#config.fixtures.conversationId) return;
    await this.#client.post(`/api/v1/chat/conversations/${this.#config.fixtures.conversationId}/messages`, {
      ciphertext: `${this.#config.prefix}_chat_${vu}_${iteration}`,
      nonce: 'loadtest_nonce',
      metadata: { loadTest: true, prefix: this.#config.prefix },
    }, {
      name: 'chat_enviar_prefixado',
      token: this.#config.clientToken,
    });
  }

  async #notificacoes(vu, iteration) {
    await this.#client.get('/metrics', { name: 'notificacoes_metricas_sem_push' });

    if (!this.#config.enablePush || !this.#config.professionalToken) return;
    if (!this.#config.fixtures.professionalId || !this.#config.fixtures.queueEntryId || !this.#config.fixtures.barbershopId) return;

    await this.#client.post('/api/v1/notificacoes/push-barbeiro', {
      professionalId: this.#config.fixtures.professionalId,
      entradaId: this.#config.fixtures.queueEntryId,
      barbershopId: this.#config.fixtures.barbershopId,
      type: 'loadtest_mock',
      clienteNome: `${this.#config.prefix}_cliente_${vu}_${iteration}`,
      dryRun: true,
    }, {
      name: 'notificacao_push_dry_run',
      token: this.#config.professionalToken,
    });
  }
}

module.exports = BarberFlowScenario;
