const http = require('http');
const fs = require('fs');
const path = require('path');
const proxyHandler = require('./api/proxy');
const socialExtractHandler = require('./api/social-extract');
const browserExtractHandler = require('./api/browser-extract');
const mapsExtractHandler = require('./api/maps-extract');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function attachQuery(req, parsedUrl) {
  req.query = {};
  for (const [k, v] of parsedUrl.searchParams.entries()) {
    req.query[k] = v;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 1. Proxy CORS endpoint (/api/proxy)
    if (parsedUrl.pathname === '/api/proxy') {
      attachQuery(req, parsedUrl);
      await proxyHandler(req, res);
      return;
    }

    // 2. Social Media Extractor endpoint (/api/social-extract)
    if (parsedUrl.pathname === '/api/social-extract') {
      attachQuery(req, parsedUrl);
      await socialExtractHandler(req, res);
      return;
    }

    // 3. Headless Browser Extractor endpoint (/api/browser-extract)
    if (parsedUrl.pathname === '/api/browser-extract') {
      attachQuery(req, parsedUrl);
      await browserExtractHandler(req, res);
      return;
    }

    // 4. Google Maps Extractor endpoint (/api/maps-extract)
    if (parsedUrl.pathname === '/api/maps-extract') {
      attachQuery(req, parsedUrl);
      await mapsExtractHandler(req, res);
      return;
    }

    // 5. Archivos estáticos del proyecto
    let safePath = decodeURIComponent(parsedUrl.pathname);
    if (safePath === '/') safePath = '/index.html';

    const filePath = path.resolve(ROOT, '.' + safePath);
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 Cleo Herramientas ejecutándose en: http://localhost:${PORT}`);
  console.log(`   - Proxy Web Activo:      /api/proxy`);
  console.log(`   - Google Maps Extractor: /api/maps-extract (Puppeteer)`);
  console.log(`   - Browser Headless:      /api/browser-extract (Puppeteer)`);
  console.log(`   - Extractor de Redes:    /api/social-extract (Chromium / gallery-dl)`);
  console.log(`=============================================================\n`);
});
