'use strict';

// =============================================================
// app.js — Configuração do Express + wiring de DI.
//
// Responsabilidade única: montar o app Express injetando as
// dependências em cada camada (Repository → Service → Controller).
//
// Não inicia o servidor (isso cabe ao api.js).
// =============================================================

const express    = require('express');
const cors       = require('cors');
const supabase   = require('./infra/SupabaseClient');

// ── Repositories ──────────────────────────────────────────────
const ClienteRepository      = require('./repositories/ClienteRepository');
const AgendamentoRepository  = require('./repositories/AgendamentoRepository');
const BarbeariaRepository    = require('./repositories/BarbeariaRepository');
const ProfissionalRepository = require('./repositories/ProfissionalRepository');
const SocialRepository       = require('./repositories/SocialRepository');
const ComunicacaoRepository  = require('./repositories/ComunicacaoRepository');
const FilaRepository         = require('./repositories/FilaRepository');
const LgpdRepository         = require('./repositories/LgpdRepository');
const AuthRepository         = require('./repositories/AuthRepository');

// ── Services ──────────────────────────────────────────────────
const ClienteService      = require('./services/ClienteService');
const AgendamentoService  = require('./services/AgendamentoService');
const BarbeariaService    = require('./services/BarbeariaService');
const ProfissionalService = require('./services/ProfissionalService');
const SocialService       = require('./services/SocialService');
const ComunicacaoService  = require('./services/ComunicacaoService');
const FilaService         = require('./services/FilaService');
const LgpdService         = require('./services/LgpdService');
const CadastroService     = require('./services/CadastroService');

// ── Controllers ───────────────────────────────────────────────
const criarClienteController      = require('./controllers/ClienteController');
const criarAgendamentoController   = require('./controllers/AgendamentoController');
const criarBarbeariaController     = require('./controllers/BarbeariaController');
const criarProfissionalController  = require('./controllers/ProfissionalController');
const criarSocialController        = require('./controllers/SocialController');
const criarComunicacaoController   = require('./controllers/ComunicacaoController');
const criarFilaController          = require('./controllers/FilaController');
const criarLgpdController          = require('./controllers/LgpdController');
const criarAuthController          = require('./controllers/AuthController');

// ── Origens permitidas (CORS) ──────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://barberflow.vercel.app',
  'https://www.barberflow.app',
  'https://barberflow.app',
  'http://localhost:3000',
  'http://localhost:3001',
]);

function criarApp() {
  const app = express();

  // ── Middlewares globais ──────────────────────────────────────
  app.use(cors({
    origin(origin, callback) {
      // Sem origin (ex: curl) ou origem permitida
      if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
      callback(new Error('Origem não permitida.'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '50kb' }));

  // ── DI: instâncias ───────────────────────────────────────────
  const clienteRepo      = new ClienteRepository(supabase);
  const agendamentoRepo  = new AgendamentoRepository(supabase);
  const barbeariaRepo    = new BarbeariaRepository(supabase);
  const profissionalRepo = new ProfissionalRepository(supabase);
  const socialRepo       = new SocialRepository(supabase);
  const comunicacaoRepo  = new ComunicacaoRepository(supabase);
  const filaRepo         = new FilaRepository(supabase);
  const lgpdRepo         = new LgpdRepository(supabase);
  const authRepo         = new AuthRepository(supabase);

  const clienteService      = new ClienteService(clienteRepo);
  const agendamentoService  = new AgendamentoService(agendamentoRepo);
  const barbeariaService    = new BarbeariaService(barbeariaRepo);
  const profissionalService = new ProfissionalService(profissionalRepo);
  const socialService       = new SocialService(socialRepo);
  const comunicacaoService  = new ComunicacaoService(comunicacaoRepo);
  const filaService         = new FilaService(filaRepo);
  const lgpdService         = new LgpdService(lgpdRepo);
  const cadastroService     = new CadastroService(authRepo);

  // ── Rotas ────────────────────────────────────────────────────
  app.use('/api/clientes',      criarClienteController(clienteService));
  app.use('/api/agendamentos',  criarAgendamentoController(agendamentoService));
  app.use('/api/barbearias',    criarBarbeariaController(barbeariaService));
  app.use('/api/profissionais', criarProfissionalController(profissionalService));
  app.use('/api/social',        criarSocialController(socialService));
  app.use('/api/comunicacao',   criarComunicacaoController(comunicacaoService));
  app.use('/api/fila',          criarFilaController(filaService));
  app.use('/api/lgpd',          criarLgpdController(lgpdService));
  app.use('/api/auth',          criarAuthController(cadastroService));

  // ── Health check ─────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, env: process.env.APP_ENV ?? 'development' });
  });

  // ── 404 para rotas não mapeadas ──────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Rota não encontrada.' });
  });

  // ── Handler de erros global (Express 5: captura erros async) ─
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status ?? 500;
    res.status(status).json({ ok: false, error: err.message ?? 'Erro interno.' });
  });

  return app;
}

module.exports = criarApp;
