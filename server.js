'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

// =============================================================
// server.js — Servidor de desenvolvimento BarberFlow
//
// Arquitetura em camadas (cada classe tem responsabilidade única):
//   RateLimiter       — controle de requisições por IP
//   SecurityMiddleware — headers OWASP + MIME types + path traversal
//   StaticFileHandler  — normalização de URL + leitura de arquivo
//   DevServer          — coordenação, bootstrap e banner
//
// Ponto de entrada: DevServer.iniciar()
// =============================================================

// ─────────────────────────────────────────────────────────────
// RateLimiter — controle de taxa de requisições por IP
// ─────────────────────────────────────────────────────────────
class RateLimiter {

  // Em dev: 2000 req/min (páginas HTML) — assets estáticos isentos.
  // Em produção use Vercel Edge Middleware ou Cloudflare.
  static #MAX = 2000;
  static #WIN = 60_000; // 1 minuto (ms)
  static #map = new Map(); // IP → { count, resetAt }

  // Extensões isentas de rate-limit (assets estáticos sem estado)
  static #ISENTOS = new Set([
    '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg',
    '.ico', '.webp', '.woff', '.woff2', '.map',
  ]);

  /**
   * Verifica e incrementa o rate limit para um IP.
   * Retorna true se a requisição deve prosseguir, false se deve ser bloqueada.
   * Assets estáticos (ext em #ISENTOS) são sempre permitidos.
   * @param {string} ip
   * @param {string} ext — extensão do arquivo (ex: '.js', '.html', '')
   * @returns {boolean}
   */
  static check(ip, ext) {
    if (RateLimiter.#ISENTOS.has(ext)) return true;
    const now   = Date.now();
    const entry = RateLimiter.#map.get(ip);
    if (!entry || now > entry.resetAt) {
      RateLimiter.#map.set(ip, { count: 1, resetAt: now + RateLimiter.#WIN });
      return true;
    }
    if (entry.count >= RateLimiter.#MAX) return false;
    entry.count++;
    return true;
  }

  /**
   * Remove entradas expiradas para evitar leak de memória.
   * Deve ser chamado periodicamente (ex: a cada 5 minutos).
   */
  static limpar() {
    const now = Date.now();
    for (const [ip, entry] of RateLimiter.#map) {
      if (now > entry.resetAt) RateLimiter.#map.delete(ip);
    }
  }

  /**
   * Inicia o timer de limpeza automática.
   * @param {number} [intervaloMs=300_000] — padrão: 5 minutos
   */
  static iniciarLimpeza(intervaloMs = 5 * 60_000) {
    setInterval(() => RateLimiter.limpar(), intervaloMs);
  }
}

// ─────────────────────────────────────────────────────────────
// SecurityMiddleware — headers OWASP, MIME types, path traversal
// ─────────────────────────────────────────────────────────────
class SecurityMiddleware {

  static #HEADERS = Object.freeze({
    'X-Content-Type-Options'  : 'nosniff',
    'X-Frame-Options'         : 'SAMEORIGIN',
    'Referrer-Policy'         : 'strict-origin-when-cross-origin',
    'Permissions-Policy'      : 'geolocation=(self), camera=(), microphone=()',
    'Content-Security-Policy' : [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh",
      "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://androidpublisher.googleapis.com https://oauth2.googleapis.com https://cdn.jsdelivr.net https://unpkg.com https://viacep.com.br",
      "worker-src 'self'",
      "manifest-src 'self'",
    ].join('; '),
  });

  static #MIME = Object.freeze({
    '.html' : 'text/html; charset=utf-8',
    '.css'  : 'text/css; charset=utf-8',
    '.js'   : 'application/javascript; charset=utf-8',
    '.json' : 'application/json',
    '.svg'  : 'image/svg+xml',
    '.png'  : 'image/png',
    '.jpg'  : 'image/jpeg',
    '.jpeg' : 'image/jpeg',
    '.ico'  : 'image/x-icon',
    '.webp' : 'image/webp',
    '.woff2': 'font/woff2',
    '.woff' : 'font/woff',
  });

  /**
   * Retorna o Content-Type para uma extensão de arquivo.
   * @param {string} ext — ex: '.html', '.js'
   * @returns {string}
   */
  static contentType(ext) {
    return SecurityMiddleware.#MIME[ext] ?? 'application/octet-stream';
  }

  /**
   * Verifica se um filePath está dentro do root (protege contra path traversal).
   * @param {string} filePath — caminho absoluto resolvido
   * @param {string} root     — diretório raiz absoluto
   * @returns {boolean} true se seguro
   */
  static dentroDoRoot(filePath, root) {
    return filePath.startsWith(root + path.sep) || filePath === root;
  }

  /**
   * Envia resposta HTTP com security headers aplicados em todas as situações.
   * @param {import('http').ServerResponse} res
   * @param {number} status
   * @param {string} contentType
   * @param {string|Buffer} body
   * @param {object} [extraHeaders={}]
   */
  static responder(res, status, contentType, body, extraHeaders = {}) {
    res.writeHead(status, {
      ...SecurityMiddleware.#HEADERS,
      'Content-Type': contentType,
      ...extraHeaders,
    });
    res.end(body);
  }
}

// ─────────────────────────────────────────────────────────────
// StaticFileHandler — normalização de URL e leitura de arquivo
// ─────────────────────────────────────────────────────────────
class StaticFileHandler {

  /**
   * Normaliza URL bruta para um caminho de arquivo relativo.
   * Remove query string, resolve raiz para index.html, adiciona index.html
   * em diretórios sem extensão.
   * @param {string} rawUrl
   * @returns {string}
   */
  static normalizarUrl(rawUrl) {
    let p = decodeURIComponent(rawUrl.split('?')[0]);
    if (p === '/') return '/index.html';
    if (!path.extname(p)) {
      if (!p.endsWith('/')) p += '/';
      p += 'index.html';
    }
    return p;
  }

  /**
   * Serve um arquivo do sistema de arquivos, aplicando MIME e cache headers.
   * Chama o callback com (err, data, mimeType, cacheControl).
   * @param {string} filePath — caminho absoluto do arquivo
   * @param {function} cb     — cb(err, data, mimeType, cacheControl)
   */
  static ler(filePath, cb) {
    fs.readFile(filePath, (err, data) => {
      if (err) { cb(err, null, null, null); return; }
      const ext          = path.extname(filePath).toLowerCase();
      const mimeType     = SecurityMiddleware.contentType(ext);
      // HTML: no-store desabilita bfcache. Outros assets: no-cache para revalidação.
      const cacheControl = ext === '.html' ? 'no-store' : 'no-cache';
      cb(null, data, mimeType, cacheControl);
    });
  }
}

// ─────────────────────────────────────────────────────────────
// DevServer — coordenador: bootstrap, roteamento e banner
// ─────────────────────────────────────────────────────────────
class DevServer {

  static #PORT   = 3000;
  static #ROOT   = __dirname;
  static #server = null;

  /**
   * Inicia o servidor na porta configurada.
   * Ponto de entrada único — chame apenas DevServer.iniciar().
   */
  static iniciar() {
    RateLimiter.iniciarLimpeza();
    DevServer.#server = http.createServer((req, res) => DevServer.#handle(req, res));
    DevServer.#server.listen(DevServer.#PORT, '0.0.0.0', () => DevServer.#banner());
  }

  /** Handler principal — delega às camadas especializadas. */
  static #handle(req, res) {
    const clientIp = req.socket.remoteAddress ?? '0.0.0.0';
    const ext      = path.extname(req.url.split('?')[0]).toLowerCase();

    if (!RateLimiter.check(clientIp, ext)) {
      SecurityMiddleware.responder(res, 429, 'text/plain', '429 Too Many Requests',
        { 'Retry-After': '60' });
      DevServer.#log(429, req.url);
      return;
    }

    const urlPath  = StaticFileHandler.normalizarUrl(req.url);
    const filePath = path.join(DevServer.#ROOT, urlPath);

    if (!SecurityMiddleware.dentroDoRoot(filePath, DevServer.#ROOT)) {
      SecurityMiddleware.responder(res, 403, 'text/plain', '403 Forbidden');
      DevServer.#log(403, req.url);
      return;
    }

    StaticFileHandler.ler(filePath, (err, data, mimeType, cacheControl) => {
      if (err) {
        if (err.code === 'ENOENT') {
          SecurityMiddleware.responder(res, 404, 'text/plain',
            `404 — Arquivo não encontrado: ${urlPath}`);
          DevServer.#log(404, req.url);
        } else {
          SecurityMiddleware.responder(res, 500, 'text/plain', '500 Internal Server Error');
          DevServer.#log(500, req.url);
        }
        return;
      }
      SecurityMiddleware.responder(res, 200, mimeType, data, { 'Cache-Control': cacheControl });
      DevServer.#log(200, req.url);
    });
  }

  /** Loga requisições com cor por status code. */
  static #log(status, url) {
    const color = status < 300 ? '\x1b[32m' : status < 400 ? '\x1b[33m' : '\x1b[31m';
    console.log(`${color}${status}\x1b[0m  ${url}`);
  }

  /** Exibe o banner de inicialização no terminal. */
  static #banner() {
    const os    = require('os');
    const iface = Object.values(os.networkInterfaces())
      .flat()
      .find(i => i.family === 'IPv4' && !i.internal);
    const ip = iface ? iface.address : 'SEU_IP';

    console.log('\n\x1b[33m BarberFlow — Servidor de desenvolvimento\x1b[0m');
    console.log('─────────────────────────────────────────');
    console.log(`\x1b[36m Local    →  http://localhost:${DevServer.#PORT}/\x1b[0m`);
    console.log(`\x1b[32m Rede     →  http://${ip}:${DevServer.#PORT}/\x1b[0m`);
    console.log('─────────────────────────────────────────');
    console.log('\x1b[32m 📱 Celular (mesma Wi-Fi):\x1b[0m');
    console.log(`\x1b[32m  Cliente       →  http://${ip}:${DevServer.#PORT}/apps/cliente/\x1b[0m`);
    console.log(`\x1b[32m  Profissional  →  http://${ip}:${DevServer.#PORT}/apps/profissional/\x1b[0m`);
    console.log('─────────────────────────────────────────');
    console.log(' Ctrl+C para parar\n');
  }
}

/* ── Ponto de entrada ─────────────────────────────────────── */
DevServer.iniciar();

