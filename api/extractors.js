/**
 * Cleo Herramientas - Motores de Extracción Avanzados (Local)
 * -----------------------------------------------------------
 * 1. Social Extract: usa gallery-dl con cookies locales del navegador para
 *    redes sociales protegidas (Facebook, Instagram, Pinterest, TikTok, etc.)
 * 2. Browser Extract: usa Puppeteer (Chromium headless) con scroll automático
 *    para sitios web SPA dinámicos con lazy-load de imágenes.
 */

const { spawn } = require('child_process');
const readline = require('readline');

/**
 * Extrae URLs de imágenes de redes sociales usando gallery-dl (local) o Chromium Headless (Vercel / fallback).
 */
async function runSocialExtract(targetUrl, { browser = 'chrome', onImage, signal } = {}) {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return runSocialBrowserExtract(targetUrl, { onImage, signal });
  }

  return new Promise((resolve, reject) => {
    const browsersToTry = [browser, 'edge', 'brave', 'firefox', null].filter((v, i, a) => a.indexOf(v) === i);
    let currentBrowserIdx = 0;
    const foundImages = new Set();
    let currentProc = null;

    if (signal) {
      signal.addEventListener('abort', () => {
        if (currentProc) {
          try { currentProc.kill(); } catch (e) { /* noop */ }
        }
      }, { once: true });
    }

    function fallbackToHeadless(originalError) {
      runSocialBrowserExtract(targetUrl, {
        onImage: (url) => {
          if (!foundImages.has(url)) {
            foundImages.add(url);
            if (onImage) onImage(url);
          }
        },
        signal
      })
        .then((imgs) => {
          imgs.forEach((u) => foundImages.add(u));
          if (foundImages.size > 0) {
            resolve(Array.from(foundImages));
          } else if (originalError) {
            reject(originalError);
          } else {
            resolve([]);
          }
        })
        .catch(() => {
          if (foundImages.size > 0) resolve(Array.from(foundImages));
          else reject(originalError || new Error('No se pudieron extraer imágenes de la red social.'));
        });
    }

    function tryNextBrowser() {
      if (signal && signal.aborted) {
        return reject(new Error('Extracción cancelada por el usuario'));
      }

      const activeBrowser = browsersToTry[currentBrowserIdx];
      const args = ['-m', 'gallery_dl', '-g'];
      if (activeBrowser) {
        args.push('--cookies-from-browser', activeBrowser);
      }
      args.push(targetUrl);

      let stdoutCount = 0;
      let stderrOutput = '';

      try {
        currentProc = spawn('python', args, { windowsHide: true });
      } catch (err) {
        return fallbackToHeadless(new Error(`Error al iniciar python gallery_dl: ${err.message}`));
      }

      const rl = readline.createInterface({ input: currentProc.stdout });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        const isActualMedia =
          /^https?:\/\//i.test(trimmed) &&
          (/\.(?:jpe?g|png|webp|gif|avif|bmp|svg)(?:\?|$)/i.test(trimmed) ||
            /(?:fbcdn\.net|cdninstagram\.com|pinimg\.com|twimg\.com|tiktokcdn|googleusercontent\.com)/i.test(trimmed));
        if (isActualMedia) {
          stdoutCount++;
          if (!foundImages.has(trimmed)) {
            foundImages.add(trimmed);
            if (onImage) onImage(trimmed);
          }
        }
      });

      currentProc.stderr.on('data', (d) => {
        stderrOutput += d.toString();
      });

      currentProc.on('error', (err) => {
        currentBrowserIdx++;
        if (currentBrowserIdx < browsersToTry.length) {
          tryNextBrowser();
        } else {
          fallbackToHeadless(err);
        }
      });

      currentProc.on('close', (code) => {
        if (signal && signal.aborted) {
          return resolve(Array.from(foundImages));
        }

        if (foundImages.size > 0 || stdoutCount > 0) {
          return resolve(Array.from(foundImages));
        }

        // Si falló y quedan navegadores por probar (por ejemplo si Chrome estaba bloqueado), probamos el siguiente
        currentBrowserIdx++;
        if (currentBrowserIdx < browsersToTry.length) {
          tryNextBrowser();
        } else {
          const err =
            foundImages.size === 0 && code !== 0
              ? new Error(stderrOutput.trim() || `gallery-dl finalizó con código ${code}`)
              : null;
          fallbackToHeadless(err);
        }
      });
    }

    tryNextBrowser();
  });
}

/**
 * Extrae fotos de redes sociales (Facebook, Instagram, Pinterest, TikTok) usando Chromium Headless,
 * interceptando respuestas GraphQL/CDN, cerrando modales de login y recorriendo tanto el feed principal
 * como la pestaña /photos en páginas de Facebook.
 */
async function runSocialBrowserExtract(targetUrl, { onImage, signal } = {}) {
  const bestByAsset = new Map();
  const orderedUrls = [];

  const reportCandidate = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    const clean = rawUrl
      .trim()
      .replace(/\\\//g, '/')
      .replace(/\\u0025/g, '%')
      .replace(/\\u0026/g, '&')
      .replace(/\\u003C/gi, '<')
      .replace(/\\u003E/gi, '>')
      .replace(/\\u003d/gi, '=')
      .replace(/&amp;/g, '&')
      .replace(/[\\)"',;]+$/, '');

    if (!/^https?:\/\//i.test(clean)) return;
    if (/emoji\.php|rsrc\.php|static\.xx\.fbcdn|static\.cdninstagram|\.svg(?:\?|$)/i.test(clean)) return;
    // Filtrar avatares diminutos, previsualizaciones borrosas (_fb50_) o iconos recortados pequeños (<= 160px)
    if (/(?:[?&](?:ctp|stp)=[^&]*?[sp](?:16|24|32|36|40|48|50|60|64|75|80|100|120|130|148|150|160)x\d+)|\/[sp](?:32|40|50|60|100|148|150|160)x\d+\/|stp=cp0|_fb50_/i.test(clean)) {
      return;
    }

    let u;
    try {
      u = new URL(clean);
    } catch (e) {
      return;
    }

    let assetKey = u.origin + u.pathname;
    let score = 500000;

    if (/fbcdn\.net|cdninstagram\.com/i.test(u.hostname)) {
      const fileSeg = u.pathname.split('/').filter(Boolean).pop() || u.pathname;
      assetKey = 'social-cdn://' + fileSeg.toLowerCase();
      const ctp = u.searchParams.get('ctp') || '';
      const stp = u.searchParams.get('stp') || '';
      const dimMatch = (ctp + ' ' + stp + ' ' + u.pathname).match(/[sp](\d{2,4})x(\d{2,4})/i);
      if (dimMatch) {
        score = parseInt(dimMatch[1], 10) * parseInt(dimMatch[2], 10);
      } else {
        const cstp = u.searchParams.get('cstp') || '';
        const cstpMatch = cstp.match(/mx(\d{2,4})x(\d{2,4})/i);
        score = cstpMatch ? parseInt(cstpMatch[1], 10) * parseInt(cstpMatch[2], 10) * 2 : 2000000;
      }
    }

    const prev = bestByAsset.get(assetKey);
    if (!prev || score > prev.score) {
      bestByAsset.set(assetKey, { url: clean, score });
      orderedUrls.push(clean);
      if (onImage) onImage(clean);
    }
  };

  const extractFromText = (txt) => {
    if (!txt || typeof txt !== 'string') return;
    const unescaped = txt
      .replace(/\\\\\//g, '/')
      .replace(/\\\//g, '/')
      .replace(/\\u0025/g, '%')
      .replace(/\\u0026/g, '&')
      .replace(/\\u003d/gi, '=')
      .replace(/&amp;/g, '&');
    const regex = /https:\/\/(?:scontent[^\s"'<>\\]+|external[^\s"'<>\\]+|[^\s"'<>\\]*fbcdn\.net[^\s"'<>\\]+|[^\s"'<>\\]*cdninstagram\.com[^\s"'<>\\]+|i\.pinimg\.com[^\s"'<>\\]+|pbs\.twimg\.com\/media[^\s"'<>\\]+)\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>\\]+)?/gi;
    const matches = unescaped.match(regex) || [];
    for (const m of matches) {
      reportCandidate(m);
    }
  };

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8'
    });
    await page.setViewport({ width: 1366, height: 768 });

    page.on('response', async (res) => {
      try {
        const u = res.url();
        if (/(?:scontent|fbcdn\.net|cdninstagram|pinimg\.com|pbs\.twimg\.com).*\.(?:jpg|jpeg|png|webp)/i.test(u)) {
          reportCandidate(u);
        }
        const ct = (res.headers()['content-type'] || '').toLowerCase();
        if (
          /graphql|ajax|facebook\.com|instagram\.com|pinterest\.com/i.test(u) &&
          (ct.includes('text') || ct.includes('json') || ct.includes('javascript'))
        ) {
          const text = await res.text();
          if (!text.includes('"ayml_logged_out"')) {
            extractFromText(text);
          }
        }
      } catch (e) { /* noop */ }
    });

    if (signal) {
      signal.addEventListener('abort', async () => {
        try { await browser.close(); } catch (e) { /* noop */ }
      }, { once: true });
    }

    // Construir lista de vistas a visitar (Facebook: feed + /photos; Instagram: /embed/ + perfil)
    const urlsToVisit = [targetUrl];
    let igUsername = null;
    try {
      const parsed = new URL(targetUrl);
      if (/facebook\.com$/i.test(parsed.hostname) && !/photo\.php|\/posts\/|\/videos\/|\/reel\//i.test(parsed.pathname)) {
        const cleanPath = parsed.pathname.replace(/\/+$/, '');
        if (/\/photos(?:_by|_albums)?$/i.test(cleanPath)) {
          const basePagePath = cleanPath.replace(/\/photos(?:_by|_albums)?$/i, '');
          if (basePagePath) {
            urlsToVisit.unshift(`${parsed.origin}${basePagePath}`);
          }
        } else if (cleanPath && cleanPath !== '/') {
          urlsToVisit.push(`${parsed.origin}${cleanPath}/photos`);
        }
      } else if (/instagram\.com$/i.test(parsed.hostname)) {
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length === 1 && !/^(p|reel|reels|stories|explore|accounts|direct)$/i.test(parts[0])) {
          igUsername = parts[0];
          urlsToVisit.unshift(`https://www.instagram.com/${igUsername}/embed/`);
        } else if (parts.length >= 2 && /^(p|reel|reels)$/i.test(parts[0])) {
          urlsToVisit.unshift(`https://www.instagram.com/p/${parts[1]}/embed/captioned/`);
        }
      }
    } catch (e) {}

    let discoveredBusinessName = null;

    const visitAndScroll = async (visitUrl, scrollSteps = 7) => {
      if (signal && signal.aborted) return;
      try {
        await page.goto(visitUrl, { waitUntil: 'networkidle2', timeout: 22000 });
      } catch (e) { /* continuar con lo cargado */ }

      try {
        const title = await page.title();
        if (title && /instagram/i.test(title) && !discoveredBusinessName) {
          const m = title.match(/^([^(@•|\n]+?)\s*(?:\(@|•)/);
          if (m && m[1].trim().length >= 3 && !/^instagram$/i.test(m[1].trim())) {
            discoveredBusinessName = m[1].trim();
          }
        }
        extractFromText(await page.content());
        const domImgs = await page.evaluate(extractDomImages);
        domImgs.forEach(reportCandidate);
      } catch (e) {}

      // Cerrar modal de inicio de sesión de Facebook/Instagram si aparece
      try {
        await page.evaluate(() => {
          const closeSelectors = [
            '[aria-label="Cerrar"]',
            '[aria-label="Close"]',
            'div[role="dialog"] [aria-label="Cerrar"]',
            'div[role="dialog"] [aria-label="Close"]',
            'div[role="dialog"] [role="button"]'
          ];
          for (const sel of closeSelectors) {
            const btn = document.querySelector(sel);
            if (btn) {
              btn.click();
              break;
            }
          }
        });
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {}

      for (let i = 0; i < scrollSteps; i++) {
        if (signal && signal.aborted) break;
        try {
          await page.evaluate(() => window.scrollBy(0, 1800));
          await new Promise(r => setTimeout(r, 500));
          const domImgs = await page.evaluate(extractDomImages);
          domImgs.forEach(reportCandidate);
        } catch (e) {
          break;
        }
      }

      try {
        extractFromText(await page.content());
      } catch (e) {}
    };

    for (const visitUrl of urlsToVisit) {
      await visitAndScroll(visitUrl, 7);
    }

    // Si es un perfil de Instagram con restricción de edad (+18, ej. bares/restaurantes como @laplaza_artesanal)
    // y no devolvió fotos sin sesión, buscar automáticamente su página espejo oficial en Facebook (Meta)
    if (igUsername && bestByAsset.size === 0 && !(signal && signal.aborted)) {
      const searchName = discoveredBusinessName || igUsername.replace(/[._-]+/g, ' ');
      let fbPageUrl = null;
      try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:facebook.com "${searchName}"`)}`;
        await page.goto(ddgUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const rawHrefs = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a.result__a, a[href*="facebook.com"]')).map(a => a.href)
        );
        for (const raw of rawHrefs) {
          let candidate = raw;
          try {
            const u = new URL(raw);
            if (u.searchParams.get('uddg')) candidate = decodeURIComponent(u.searchParams.get('uddg'));
          } catch (e) {}
          const m = candidate.match(/^https?:\/\/(?:www\.|m\.|es-la\.)?facebook\.com\/([A-Za-z0-9._-]+)(?:\/|$)/i);
          if (m && !/^(?:sharer|login|watch|events|groups|pages|story\.php|photo\.php|permalink\.php|share|reel|hashtag)$/i.test(m[1])) {
            fbPageUrl = `https://www.facebook.com/${m[1]}`;
            break;
          }
        }
      } catch (e) {}

      if (!fbPageUrl) {
        try {
          const yahooUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(`site:facebook.com "${searchName}"`)}`;
          await page.goto(yahooUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          const html = decodeURIComponent(await page.content());
          const matches = html.match(/https?:\/\/(?:www\.|m\.|es-la\.)?facebook\.com\/([A-Za-z0-9._-]+)(?:\/|["'&?])/gi) || [];
          for (const raw of matches) {
            const m = raw.match(/facebook\.com\/([A-Za-z0-9._-]+)/i);
            if (m && !/^(?:sharer|login|watch|events|groups|pages|story\.php|photo\.php|permalink\.php|share|reel|hashtag|tr)$/i.test(m[1])) {
              fbPageUrl = `https://www.facebook.com/${m[1]}`;
              break;
            }
          }
        } catch (e) {}
      }

      if (fbPageUrl) {
        await visitAndScroll(fbPageUrl, 7);
        await visitAndScroll(`${fbPageUrl}/photos`, 6);
      }
    }

    return Array.from(bestByAsset.values()).map(v => v.url);
  } finally {
    try {
      await browser.close();
    } catch (e) { /* noop */ }
  }
}

/**
 * Lanza una instancia de Chromium compatible tanto en entorno local (puppeteer)
 * como en Vercel Serverless / AWS Lambda (@sparticuz/chromium + puppeteer-core).
 */
async function launchBrowser(extraArgs = []) {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromiumMod = await import('@sparticuz/chromium');
    const chromium = chromiumMod.default || chromiumMod;
    const puppeteerCoreMod = await import('puppeteer-core');
    const puppeteerCore = puppeteerCoreMod.default || puppeteerCoreMod;
    return puppeteerCore.launch({
      args: [...chromium.args, '--disable-blink-features=AutomationControlled', ...extraArgs],
      defaultViewport: { width: 1366, height: 768 },
      executablePath: await chromium.executablePath(),
      headless: 'shell'
    });
  }

  let puppeteer;
  try {
    const puppeteerMod = await import('puppeteer');
    puppeteer = puppeteerMod.default || puppeteerMod;
  } catch (e) {
    throw new Error('Puppeteer no está instalado en el servidor.');
  }
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      ...extraArgs
    ]
  });
}

/**
 * Extrae URLs de imágenes de sitios SPA modernos usando Puppeteer y scroll dinámico.
 */
async function runBrowserExtract(targetUrl, { maxScrolls = 8, onImage, signal } = {}) {
  const foundImages = new Set();
  const reportImage = (url) => {
    if (!url || typeof url !== 'string') return;
    const clean = url.trim().replace(/&amp;/g, '&');
    if (!/^https?:\/\//i.test(clean) || clean.startsWith('data:') || clean.startsWith('blob:')) return;
    if (!foundImages.has(clean)) {
      foundImages.add(clean);
      if (onImage) onImage(clean);
    }
  };

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8'
    });
    await page.setViewport({ width: 1366, height: 768 });

    // Interceptar respuestas de red para imágenes en tiempo real
    page.on('response', (response) => {
      try {
        const ct = response.headers()['content-type'] || '';
        if (ct.startsWith('image/')) {
          reportImage(response.url());
        }
      } catch (e) { /* noop */ }
    });

    if (signal) {
      signal.addEventListener('abort', async () => {
        try { await browser.close(); } catch (e) { /* noop */ }
      }, { once: true });
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Extraer imágenes iniciales del DOM
    const initialImages = await page.evaluate(extractDomImages);
    initialImages.forEach(reportImage);

    // Scroll automático progresivo para cargar lazy-loading e infinitescroll
    for (let i = 0; i < maxScrolls; i++) {
      if (signal && signal.aborted) break;

      const newUrls = await page.evaluate(async () => {
        window.scrollBy(0, window.innerHeight * 1.5);
        await new Promise((r) => setTimeout(r, 1200));
        return extractDomImages();
      });

      newUrls.forEach(reportImage);
    }

    return Array.from(foundImages);
  } finally {
    try {
      await browser.close();
    } catch (e) { /* noop */ }
  }
}

/**
 * Función que se evalúa dentro del contexto del navegador Puppeteer
 */
function extractDomImages() {
  const urls = new Set();
  const IMAGE_EXT_RE = /\.(jpe?g|jfif|png|apng|gif|webp|avif|svg|bmp)(?:$|[?#])/i;

  // 1) <img> src, srcset, data-*
  document.querySelectorAll('img').forEach((img) => {
    if (img.src) urls.add(img.src);
    if (img.currentSrc) urls.add(img.currentSrc);
    ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'data-full', 'data-hi-res'].forEach((attr) => {
      const v = img.getAttribute(attr);
      if (v) urls.add(v);
    });
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      srcset.split(',').forEach((part) => {
        const u = part.trim().split(/\s+/)[0];
        if (u) urls.add(u);
      });
    }
  });

  // 2) Elementos con background-image
  document.querySelectorAll('*').forEach((el) => {
    const bg = el.style && el.style.backgroundImage;
    if (bg && bg.includes('url(')) {
      const match = bg.match(/url\(['"]?([^'"]+)['"]?\)/i);
      if (match && match[1]) urls.add(match[1]);
    }
  });

  // 3) Enlaces directos a imágenes
  document.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (href && IMAGE_EXT_RE.test(href)) {
      urls.add(a.href);
    }
  });

  return Array.from(urls);
}

/**
 * Normaliza una URL de foto de Google (googleusercontent/ggpht) a su máxima resolución original (=s0).
 */
function normalizeGooglePhoto(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = url
    .trim()
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\+/g, '')
    .replace(/&amp;/g, '&');
  if (!/(googleusercontent\.com\/(?:p|grass-cs|gps-cs-s|gpms-cs-s|places)\/|ggpht\.com)/i.test(clean)) return null;
  if (/default-user|mapslogo|tactile|streetview_preview|\/a\//i.test(clean)) return null;
  return clean.replace(/=[swh]\d+.*$/i, '=s0');
}

/**
 * Extrae fotos en alta resolución de una ubicación o ficha de Google Maps.
 */
async function runGoogleMapsExtract(targetUrl, { maxScrolls = 35, onImage, signal } = {}) {
  const foundImages = new Set();
  const reportImage = (url) => {
    const hiRes = normalizeGooglePhoto(url);
    if (hiRes && !foundImages.has(hiRes)) {
      foundImages.add(hiRes);
      if (onImage) onImage(hiRes);
    }
  };

  const extractUrlsFromText = (text) => {
    if (!text || typeof text !== 'string') return;
    const matches = text.match(/https?:\/\/(?:lh\d+\.googleusercontent\.com|lh\d+\.ggpht\.com)\/[a-zA-Z0-9_\-\/=]+/g);
    if (matches) matches.forEach(reportImage);
  };

  // Extraer de inmediato cualquier miniatura codificada en la propia URL (ej. 6shttps:%2F%2Flh3...)
  try {
    extractUrlsFromText(decodeURIComponent(targetUrl));
  } catch (e) {}

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8'
    });
    await page.setViewport({ width: 1366, height: 768 });

    // Ampliar el límite de fotos solicitado en el endpoint interno preview/place de Google Maps
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      try {
        let reqUrl = req.url();
        if (reqUrl.includes('/maps/preview/place')) {
          reqUrl = reqUrl.replace(/!3i\d+!/g, '!3i500!').replace(/!4i\d+!/g, '!4i100!');
          return req.continue({ url: reqUrl });
        }
        req.continue();
      } catch (e) {
        try { req.continue(); } catch (_) {}
      }
    });

    // Interceptar tráfico de red y cuerpos RPC (preview/place, photometa, batchexecute)
    page.on('response', async (response) => {
      try {
        const u = response.url();
        reportImage(u);
        if (
          u.includes('/maps/preview/place') ||
          u.includes('photometa') ||
          u.includes('batchexecute') ||
          u.includes('/maps/rpc/')
        ) {
          const text = await response.text();
          extractUrlsFromText(text);
        }
      } catch (e) { /* noop */ }
    });

    if (signal) {
      signal.addEventListener('abort', async () => {
        try { await browser.close(); } catch (e) { /* noop */ }
      }, { once: true });
    }

    // 1. Navegar a Google Maps (sigue automáticamente redirecciones como maps.app.goo.gl)
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 35000 });
    await new Promise(r => setTimeout(r, 1800));

    // 2. Gestionar consentimiento de cookies si aparece
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const consent = btns.find(b => /aceptar|accept|agree|rechazar/i.test(b.innerText || ''));
        if (consent) consent.click();
      });
      await new Promise(r => setTimeout(r, 600));
    } catch (e) {}

    // 3. Extraer imágenes iniciales del HTML y del DOM
    try {
      const html = await page.content();
      extractUrlsFromText(html);
    } catch (e) {}
    const initialDom = await page.evaluate(extractDomImages);
    initialDom.forEach(reportImage);

    // 4. Si aún no estamos en el visor/galería de fotos, abrir la galería (evitando "Agregar fotos")
    try {
      const clicked = await page.evaluate(() => {
        const inPhotoViewer = !!document.querySelector('a.MIgS0d, div.aHpZye, button.eU5Rrb, button[jsaction*="play.onRightClick"]');
        if (inPhotoViewer) return false;

        const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
        const photoBtn = btns.find(b => {
          const text = (b.innerText || '').trim();
          const aria = (b.getAttribute('aria-label') || '').trim();
          const jsaction = b.getAttribute('jsaction') || '';
          if (/agregar|add|subir|upload/i.test(text + ' ' + aria)) return false;
          return (
            /ver fotos|see photos|all photos|\d+\+?\s*(?:fotos|photos)/i.test(text) ||
            /^(?:foto de|photo of) /i.test(aria) ||
            jsaction.includes('heroHeaderImage') ||
            b.classList.contains('aoRNLd') ||
            b.classList.contains('zEjzpe')
          );
        });
        if (photoBtn) {
          photoBtn.click();
          return true;
        }
        return false;
      });

      if (clicked) {
        await new Promise(r => setTimeout(r, 2500));
      }
    } catch (e) {}

    // 5. Recorrido profundo: scroll en el feed, clic en miniaturas laterales y avance en el visor
    let stagnantCount = 0;
    let lastCount = foundImages.size;

    for (let i = 0; i < maxScrolls; i++) {
      if (signal && signal.aborted) break;

      const newUrls = await page.evaluate((step) => {
        // a) Scroll en contenedores laterales de fotos
        const containers = Array.from(document.querySelectorAll('div[role="feed"], div.m6QErb, div.DxyBCb, div.m6QErb.DxyBCb'));
        for (const el of containers) {
          if (el.scrollHeight > el.clientHeight + 20) {
            el.scrollBy(0, 1600);
          }
        }

        // b) Cada pocos pasos, seleccionar una miniatura lateral distinta para cargar su secuencia
        if (step % 4 === 0) {
          const thumbs = document.querySelectorAll('a.MIgS0d');
          const thumbIdx = Math.floor(step / 4);
          if (thumbs[thumbIdx]) {
            thumbs[thumbIdx].click();
          }
        } else {
          // c) Avanzar a la siguiente foto en el visor principal para disparar photometa/v1
          const nextBtn = document.querySelector(
            'button.eU5Rrb, button[aria-label="Siguiente"], button[aria-label="Next"], button[jsaction*="play.onRightClick"]'
          );
          if (nextBtn) nextBtn.click();
        }

        // d) Recolectar imágenes presentes en el DOM
        const found = [];
        document.querySelectorAll('*').forEach(el => {
          if (el.tagName === 'IMG' && el.src) found.push(el.src);
          const style = el.getAttribute('style') || '';
          const m = style.match(/url\(['"]?(https:\/\/[^'"]+)['"]?\)/i);
          if (m) found.push(m[1]);
        });
        return found;
      }, i);

      newUrls.forEach(reportImage);
      await new Promise(r => setTimeout(r, 350));

      if (foundImages.size > lastCount) {
        lastCount = foundImages.size;
        stagnantCount = 0;
      } else {
        stagnantCount++;
        if (stagnantCount >= 10 && i >= 12) break;
      }
    }

    return Array.from(foundImages);
  } finally {
    try {
      await browser.close();
    } catch (e) { /* noop */ }
  }
}

module.exports = {
  runSocialExtract,
  runBrowserExtract,
  runGoogleMapsExtract
};

