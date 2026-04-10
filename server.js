'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.js'  : 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg' : 'image/svg+xml',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico' : 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff' : 'font/woff',
};

function log(status, url) {
  const color = status < 300 ? '\x1b[32m' : status < 400 ? '\x1b[33m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(`${color}${status}${reset}  ${url}`);
}

const server = http.createServer((req, res) => {
  // Normaliza URL — remove query string e decodifica
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  // Redireciona "/" -> "/index.html"
  if (urlPath === '/') urlPath = '/index.html';

  // Redireciona diretórios sem trailing slash
  if (!path.extname(urlPath)) {
    if (!urlPath.endsWith('/')) urlPath += '/';
    urlPath += 'index.html';
  }

  const filePath = path.join(ROOT, urlPath);

  // Segurança: impede path traversal fora do ROOT
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403);
    res.end('403 Forbidden');
    log(403, req.url);
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404 — Arquivo não encontrado: ${urlPath}`);
        log(404, req.url);
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        log(500, req.url);
      }
      return;
    }

    const ext      = path.extname(filePath).toLowerCase();
    const mimeType = MIME[ext] || 'application/octet-stream';

    // HTML: no-store desabilita bfcache — página sempre carrega do zero
    // Outros assets (CSS/JS/img): no-cache permite revalidação normal
    const cacheControl = ext === '.html' ? 'no-store' : 'no-cache';

    res.writeHead(200, {
      'Content-Type'  : mimeType,
      'Cache-Control' : cacheControl,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
    log(200, req.url);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const os    = require('os');
  const iface = Object.values(os.networkInterfaces())
    .flat()
    .find(i => i.family === 'IPv4' && !i.internal);
  const ip = iface ? iface.address : 'SEU_IP';

  console.log('\n\x1b[33m BarberFlow — Servidor de desenvolvimento\x1b[0m');
  console.log('─────────────────────────────────────────');
  console.log(`\x1b[36m Local    →  http://localhost:${PORT}/\x1b[0m`);
  console.log(`\x1b[32m Rede     →  http://${ip}:${PORT}/\x1b[0m`);
  console.log('─────────────────────────────────────────');
  console.log(`\x1b[32m 📱 Celular (mesma Wi-Fi):\x1b[0m`);
  console.log(`\x1b[32m  Cliente       →  http://${ip}:${PORT}/apps/cliente/\x1b[0m`);
  console.log(`\x1b[32m  Profissional  →  http://${ip}:${PORT}/apps/profissional/\x1b[0m`);
  console.log('─────────────────────────────────────────');
  console.log(' Ctrl+C para parar\n');
});
