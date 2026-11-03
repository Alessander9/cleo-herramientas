/**
 * Cleo Herramientas - Endpoint Serverless para extracción de Redes Sociales (/api/social-extract)
 * Usa gallery-dl en local o Chromium Headless (@sparticuz/chromium) en Vercel.
 */
const { runSocialExtract } = require('./extractors');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const targetUrl = req.query && req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'Falta el parámetro url' }));
  }

  const streamMode =
    (req.query && req.query.stream === '1') ||
    (req.headers.accept && req.headers.accept.includes('text/event-stream'));
  const browser = (req.query && req.query.browser) || 'chrome';

  const ac = new AbortController();
  req.on('close', () => ac.abort());

  if (streamMode) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const safeWrite = (obj) => {
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.write(`data: ${JSON.stringify(obj)}\n\n`);
        } catch (e) { /* noop */ }
      }
    };

    let count = 0;
    try {
      await runSocialExtract(targetUrl, {
        browser,
        signal: ac.signal,
        onImage: (imgUrl) => {
          count++;
          safeWrite({ type: 'image', url: imgUrl });
        }
      });
      safeWrite({ type: 'done', count });
    } catch (err) {
      safeWrite({ type: 'error', error: err.message });
    }
    if (!res.writableEnded && !res.destroyed) {
      try {
        res.end();
      } catch (e) { /* noop */ }
    }
  } else {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const images = await runSocialExtract(targetUrl, {
        browser,
        signal: ac.signal
      });
      return res.end(JSON.stringify({ ok: true, count: images.length, images }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  }
};
