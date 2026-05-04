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
const helmet     = require('helmet');
const compression = require('compression');
const pinoHttp   = require('pino-http');
const supabase   = require('./infra/SupabaseClient');
const logger     = require('./infra/LoggerService');
const RateLimitMiddleware    = require('./infra/RateLimitMiddleware');
const RequestTimeoutMiddleware = require('./infra/RequestTimeoutMiddleware');

// ── Repositories ──────────────────────────────────────────────
const ClienteRepository      = require('./repositories/ClienteRepository');
const SearchRepository       = require('./repositories/SearchRepository');
const AgendamentoRepository  = require('./repositories/AgendamentoRepository');
const BarbeariaRepository    = require('./repositories/BarbeariaRepository');
const ProfissionalRepository = require('./repositories/ProfissionalRepository');
const SocialRepository       = require('./repositories/SocialRepository');
const ComunicacaoRepository  = require('./repositories/ComunicacaoRepository');
const FilaRepository         = require('./repositories/FilaRepository');
const LgpdRepository         = require('./repositories/LgpdRepository');
const AuthRepository         = require('./repositories/AuthRepository');
const AdminRepository        = require('./repositories/AdminRepository');

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
const UserService         = require('./services/UserService');
const AuthService         = require('./services/AuthService');
const AdminService        = require('./services/AdminService');
const R2Client                  = require('./infra/R2Client');
const SupabaseStorageClient     = require('./infra/SupabaseStorageClient');
const ImageProcessor            = require('./services/ImageProcessor');
const MediaManager              = require('./services/MediaManager');
const SecureMediaAccessService  = require('./services/SecureMediaAccessService');

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
const criarUserController          = require('./controllers/UserController');
const criarMediaController         = require('./controllers/MediaController');
const criarSecureMediaController   = require('./controllers/SecureMediaController');
const criarWebRTCController        = require('./controllers/WebRTCController');
const criarAdminController         = require('./controllers/AdminController');

// ── Origens permitidas (CORS) ──────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://barberflow.vercel.app',
  'https://barberflow-cliente.vercel.app',
  'https://barberflow-profissional.vercel.app',
  'https://barberflow-pro-one.vercel.app',
  'https://www.barberflow.app',
  'https://barberflow.app',
  'http://localhost:3000',
  'http://localhost:3001',
]);

function criarApp() {
  const app = express();

  // ── Middlewares globais ──────────────────────────────────────

  // CORS — middleware global aplicado antes de todas as rotas.
  // Trata preflight (OPTIONS) respondendo imediatamente com 200.
  // Não usa o pacote cors() npm: quando a origem não bate ele lança
  // callback(new Error), gerando 500 SEM headers — browser vê CORS error.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin',      origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,apikey,x-client-info');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }

    next();
  });

  // Segurança: headers HTTP defensivos (OWASP).
  // crossOriginResourcePolicy: cross-origin — permite fetch() de outros domínios
  // (padrão same-origin do helmet v8 conflitava com CORS em ambientes CDN).
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy:   false,
  }));

  // Compressão gzip/deflate — reduz banda em ~70%
  app.use(compression());

  // Log estruturado de cada requisição (pino)
  app.use(pinoHttp({
    logger,
    // Não loga health check para não poluir
    autoLogging: { ignore: (req) => req.url === '/api/health' },
    customLogLevel: (_req, res) => res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
  }));

  // Rate limiting geral (proteção contra DDoS / abuso)
  app.use('/api/', RateLimitMiddleware.geral);

  // Rate limiting extra em rotas de escrita
  app.use('/api/', RateLimitMiddleware.escrita);

  // Timeout por requisição (30s padrão)
  app.use(RequestTimeoutMiddleware.handle);
  app.use(express.json({ limit: '50kb' }));

  // ── DI: instâncias ───────────────────────────────────────────
  const clienteRepo      = new ClienteRepository(supabase);
  const searchRepo        = new SearchRepository(supabase);
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
  const userService         = new UserService(clienteRepo, searchRepo);
  const authService         = new AuthService(supabase);
  const adminRepo           = new AdminRepository(supabase);
  const adminService        = new AdminService(adminRepo);
  const r2Client            = R2Client.getInstance();
  const supabaseStorage     = new SupabaseStorageClient(supabase);
  const imageProcessor      = new ImageProcessor();
  const mediaManager        = new MediaManager(r2Client, supabase, { supabaseStorage });
  const secureMediaAccess   = new SecureMediaAccessService(r2Client, supabase);

  // ── Rate limiting extra em rotas de autenticação ────────────
  app.use('/api/auth', RateLimitMiddleware.auth);

  // ── Rotas ────────────────────────────────────────────────────
  app.use('/api/clientes',      criarClienteController(clienteService));
  app.use('/api/agendamentos',  criarAgendamentoController(agendamentoService));
  app.use('/api/barbearias',    criarBarbeariaController(barbeariaService));
  app.use('/api/profissionais', criarProfissionalController(profissionalService));
  app.use('/api/social',        criarSocialController(socialService));
  app.use('/api/comunicacao',   criarComunicacaoController(comunicacaoService));
  app.use('/api/fila',          criarFilaController(filaService));
  app.use('/api/lgpd',          criarLgpdController(lgpdService));
  app.use('/api/auth',          criarAuthController(cadastroService, authService));
  app.use('/api/users',         criarUserController(userService));
  app.use('/api/media',         criarMediaController(mediaManager, imageProcessor, supabaseStorage));
  app.use('/api/media/secure',  criarSecureMediaController(secureMediaAccess));
  app.use('/api/p2p',           criarWebRTCController(supabase));
  app.use('/api/admin',         criarAdminController(adminService));

  // ── Health check com ping real no banco ─────────────────────
  app.get('/api/health', async (_req, res) => {
    try {
      // Ping real: consulta 1 linha para confirmar conexão com o banco
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) throw error;
      res.json({ ok: true, db: 'up', env: process.env.APP_ENV ?? 'development' });
    } catch (err) {
      logger.error({ err }, 'Health check falhou — banco inacessível');
      res.status(503).json({ ok: false, db: 'down', error: 'Banco de dados inacessível.' });
    }
  });

  // ── 404 para rotas não mapeadas ──────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Rota não encontrada.' });
  });

  // ── Handler de erros global (Express 5: captura erros async) ─
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status ?? 500;
    const IS_PROD = process.env.APP_ENV === 'production';

    // Loga o erro completo no servidor
    if (status >= 500) {
      logger.error({ err, method: req.method, path: req.path }, 'Erro interno');
    }

    // Em produção: NUNCA expõe detalhes internos ao cliente
    const mensagem = IS_PROD && status >= 500
      ? 'Erro interno do servidor.'
      : (err.message ?? 'Erro interno.');

    res.status(status).json({ ok: false, error: mensagem });
  });

  return app;
}

module.exports = criarApp;
