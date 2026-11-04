/**
 * Cleo Herramientas - Endpoint Serverless para extracción SPA con Chromium (/api/browser-extract)
 */
const { validateTargetUrl, runBrowserExtract } = require('./extractors');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  let targetUrl;
  try {
    targetUrl = validateTargetUrl(req.query && req.query.url);
  } catch (err) {
    res.statusCode = err.status || 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: err.message }));
  }

  const streamMode =
    (req.query && req.query.stream === '1') ||
    (req.headers.accept && req.headers.accept.includes('text/event-stream'));
  const scrolls = Math.min(30, Math.max(1, parseInt((req.query && req.query.scrolls) || '8', 10) || 8));

  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) ac.abort();
  });

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
      await runBrowserExtract(targetUrl, {
        maxScrolls: scrolls,
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
      const images = await runBrowserExtract(targetUrl, {
        maxScrolls: scrolls,
        signal: ac.signal
      });
      return res.end(JSON.stringify({ ok: true, count: images.length, images }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  }
};

