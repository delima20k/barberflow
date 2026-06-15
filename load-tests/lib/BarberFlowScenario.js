'use strict';

class BarberFlowScenario {
  #client;
  #config;

  constructor({ client, config }) {
    this.#client = client;
    this.#config = config;
  }

  async runOnce() {
    await this.#perfilPublico();
    await this.#authReadOnly();
    await this.#filaAgendamentoReadOnly();
    await this.#chatReadOnly();
    await this.#notificacoesSemPush();
  }

  async #perfilPublico() {
    await this.#client.get('/api/health', { name: 'health_legado' });
    await this.#client.get('/api/v1/health', { name: 'health_v1' });
    await this.#client.get('/api/v1/barbearias/destaque?limit=5', { name: 'barbearias_destaque' });
    await this.#client.get('/api/v1/barbearias/todas?limit=10', { name: 'barbearias_todas' });
  }

  async #authReadOnly() {
    if (!this.#config.authToken) {
      this.#client.skip('auth_me', 'LOADTEST_ACCESS_TOKEN ausente');
      return;
    }

    await this.#client.get('/api/auth/me', {
      name: 'auth_me',
      token: this.#config.authToken,
    });
  }

  async #filaAgendamentoReadOnly() {
    if (!this.#config.clientToken) {
      this.#client.skip('agendamento_listar', 'LOADTEST_CLIENT_TOKEN ausente');
      return;
    }

    await this.#client.get('/api/agendamentos', {
      name: 'agendamento_listar',
      token: this.#config.clientToken,
    });
  }

  async #chatReadOnly() {
    if (!this.#config.clientToken) {
      this.#client.skip('chat_conversas', 'LOADTEST_CLIENT_TOKEN ausente');
      return;
    }

    await this.#client.get('/api/v1/chat/conversations?limit=10', {
      name: 'chat_conversas',
      token: this.#config.clientToken,
    });
  }

  async #notificacoesSemPush() {
    this.#client.skip('notificacao_push', 'LOADTEST_ENABLE_PUSH=false; endpoint de envio nao chamado em producao');
  }
}

module.exports = BarberFlowScenario;
