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
 * Extrae URLs de imágenes de redes sociales usando gallery-dl.
 */
function runSocialExtract(targetUrl, { browser = 'chrome', onImage, signal } = {}) {
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
        return reject(new Error(`Error al iniciar python gallery_dl: ${err.message}`));
      }

      const rl = readline.createInterface({ input: currentProc.stdout });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (/^https?:\/\//i.test(trimmed)) {
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
          reject(err);
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
          if (foundImages.size === 0 && code !== 0) {
            reject(new Error(stderrOutput.trim() || `gallery-dl finalizó con código ${code}`));
          } else {
            resolve(Array.from(foundImages));
          }
        }
      });
    }

    tryNextBrowser();
  });
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
            /ver fotos|\d+\s*fotos/i.test(text) ||
            /^foto de /i.test(aria) ||
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

