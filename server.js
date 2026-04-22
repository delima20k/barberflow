'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

// =============================================================
// DevServer — Servidor de desenvolvimento BarberFlow (OOP)
//
// Responsabilidades:
//   - Servir arquivos estáticos com MIME types corretos
//   - Aplicar security headers OWASP em todas as respostas
//   - Rate limiting em memória (200 req/min por IP)
//   - Bloquear path traversal
//   - Inicializar via DevServer.iniciar()
// =============================================================

class DevServer {

  // ── Configuração ──────────────────────────────────────────
  static #PORT = 3000;
  static #ROOT = __dirname;

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

  // ── Security headers (OWASP) ──────────────────────────────
  static #SECURITY_HEADERS = Object.freeze({
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
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://androidpublisher.googleapis.com https://oauth2.googleapis.com",
      "worker-src 'self'",
      "manifest-src 'self'",
    ].join('; '),
  });

  // ── Rate limiting (em memória) ────────────────────────────
  // Em dev: 2000 req/min (páginas HTML) — arquivos estáticos isentos.
  // Em produção use Vercel Edge Middleware ou Cloudflare.
  static #RATE_MAX = 2000;
  static #RATE_WIN = 60_000; // 1 minuto (ms)
  static #ipRate   = new Map(); // IP → { count, resetAt }

  // Extensões isentas de rate-limit (assets estáticos sem estado)
  static #RATE_ISENTOS = new Set([
    '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg',
    '.ico', '.webp', '.woff', '.woff2', '.map',
  ]);

  // ── Instância do servidor ─────────────────────────────────
  static #server = null;

  // ── Público ───────────────────────────────────────────────

  /**
   * Inicia o servidor na porta configurada.
   * Ponto de entrada único — chame apenas DevServer.iniciar().
   */
  static iniciar() {
    DevServer.#server = http.createServer((req, res) => DevServer.#handle(req, res));

    // Limpa entradas de rate-limit expiradas a cada 5 minutos
    setInterval(() => DevServer.#limparRate(), 5 * 60_000);

    DevServer.#server.listen(DevServer.#PORT, '0.0.0.0', () => DevServer.#banner());
  }

  // ── Privados ──────────────────────────────────────────────

  /** Handler principal de cada requisição HTTP. */
  static #handle(req, res) {
    const clientIp = req.socket.remoteAddress ?? '0.0.0.0';
    const ext      = path.extname(req.url.split('?')[0]).toLowerCase();
    const isAsset  = DevServer.#RATE_ISENTOS.has(ext);

    if (!isAsset && !DevServer.#checkRate(clientIp)) {
      DevServer.#responder(res, 429, 'text/plain', '429 Too Many Requests',
        { 'Retry-After': '60' });
      DevServer.#log(429, req.url);
      return;
    }

    const urlPath  = DevServer.#normalizarUrl(req.url);
    const filePath = path.join(DevServer.#ROOT, urlPath);

    // Bloqueia path traversal fora do ROOT
    if (!filePath.startsWith(DevServer.#ROOT + path.sep) && filePath !== DevServer.#ROOT) {
      DevServer.#responder(res, 403, 'text/plain', '403 Forbidden');
      DevServer.#log(403, req.url);
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          DevServer.#responder(res, 404, 'text/plain', `404 — Arquivo não encontrado: ${urlPath}`);
          DevServer.#log(404, req.url);
        } else {
          DevServer.#responder(res, 500, 'text/plain', '500 Internal Server Error');
          DevServer.#log(500, req.url);
        }
        return;
      }

      const ext          = path.extname(filePath).toLowerCase();
      const mimeType     = DevServer.#MIME[ext] ?? 'application/octet-stream';
      // HTML: no-store desabilita bfcache. Outros assets: no-cache para revalidação.
      const cacheControl = ext === '.html' ? 'no-store' : 'no-cache';

      DevServer.#responder(res, 200, mimeType, data, { 'Cache-Control': cacheControl });
      DevServer.#log(200, req.url);
    });
  }

  /** Normaliza URL: remove query string, resolve diretórios. */
  static #normalizarUrl(rawUrl) {
    let p = decodeURIComponent(rawUrl.split('?')[0]);
    if (p === '/') return '/index.html';
    if (!path.extname(p)) {
      if (!p.endsWith('/')) p += '/';
      p += 'index.html';
    }
    return p;
  }

  /** Envia resposta com security headers em todas as situações. */
  static #responder(res, status, contentType, body, extraHeaders = {}) {
    res.writeHead(status, {
      ...DevServer.#SECURITY_HEADERS,
      'Content-Type': contentType,
      ...extraHeaders,
    });
    res.end(body);
  }

  /** Verifica e incrementa o rate limit para um IP. */
  static #checkRate(ip) {
    const now   = Date.now();
    const entry = DevServer.#ipRate.get(ip);
    if (!entry || now > entry.resetAt) {
      DevServer.#ipRate.set(ip, { count: 1, resetAt: now + DevServer.#RATE_WIN });
      return true;
    }
    if (entry.count >= DevServer.#RATE_MAX) return false;
    entry.count++;
    return true;
  }

  /** Remove entradas de rate-limit expiradas para evitar leak de memória. */
  static #limparRate() {
    const now = Date.now();
    for (const [ip, entry] of DevServer.#ipRate) {
      if (now > entry.resetAt) DevServer.#ipRate.delete(ip);
    }
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

