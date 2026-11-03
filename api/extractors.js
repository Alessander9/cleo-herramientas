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
 * Extrae URLs de imágenes de sitios SPA modernos usando Puppeteer y scroll dinámico.
 */
async function runBrowserExtract(targetUrl, { maxScrolls = 8, onImage, signal } = {}) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    throw new Error('Puppeteer no está instalado en el servidor.');
  }

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

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });

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
  const clean = url.trim().replace(/&amp;/g, '&');
  if (!/(googleusercontent\.com\/(?:p|grass-cs|gps-cs-s|places)\/|ggpht\.com)/i.test(clean)) return null;
  if (/default-user|mapslogo|tactile|streetview_preview/i.test(clean)) return null;
  return clean.replace(/=w\d+-h\d+.*$|=s\d+.*$/i, '=s0');
}

/**
 * Extrae fotos en alta resolución de una ubicación o ficha de Google Maps.
 */
async function runGoogleMapsExtract(targetUrl, { maxScrolls = 15, onImage, signal } = {}) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    throw new Error('Puppeteer no está instalado en el servidor.');
  }

  const foundImages = new Set();
  const reportImage = (url) => {
    const hiRes = normalizeGooglePhoto(url);
    if (hiRes && !foundImages.has(hiRes)) {
      foundImages.add(hiRes);
      if (onImage) onImage(hiRes);
    }
  };

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 768 });

    // Interceptar tráfico de red para capturar fotos dinámicas al vuelo
    page.on('response', (response) => {
      try {
        const u = response.url();
        reportImage(u);
      } catch (e) { /* noop */ }
    });

    if (signal) {
      signal.addEventListener('abort', async () => {
        try { await browser.close(); } catch (e) { /* noop */ }
      }, { once: true });
    }

    // 1. Navegar a Google Maps (sigue automáticamente redirecciones como maps.app.goo.gl)
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 35000 });

    // 2. Gestionar consentimiento de cookies si aparece
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const consent = btns.find(b => /aceptar|accept|agree|rechazar/i.test(b.innerText || ''));
        if (consent) consent.click();
      });
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {}

    // 3. Extraer imágenes iniciales visibles
    const initialDom = await page.evaluate(extractDomImages);
    initialDom.forEach(reportImage);

    // 4. Hacer clic en el botón de la galería de fotos si existe
    try {
      const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const photoBtn = btns.find(b =>
          (b.innerText && (b.innerText.includes('Ver fotos') || b.innerText.includes('Fotos'))) ||
          (b.getAttribute('aria-label') && /foto/i.test(b.getAttribute('aria-label'))) ||
          (b.getAttribute('jsaction') && b.getAttribute('jsaction').includes('heroHeaderImage'))
        );
        if (photoBtn) {
          photoBtn.click();
          return true;
        }
        return false;
      });

      if (clicked) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {}

    // 5. Scroll progresivo por el feed de fotos de Google Maps
    for (let i = 0; i < maxScrolls; i++) {
      if (signal && signal.aborted) break;

      const newUrls = await page.evaluate(() => {
        const containers = Array.from(document.querySelectorAll('div[role="feed"], div.m6QErb, div.DxyBCb, div.m6QErb.DxyBCb'));
        let scrolled = false;
        for (const el of containers) {
          if (el.scrollHeight > el.clientHeight + 50) {
            el.scrollBy(0, 1600);
            scrolled = true;
          }
        }
        if (!scrolled) window.scrollBy(0, 1600);

        // Extraer fotos presentes en el DOM en esta iteración
        const found = [];
        document.querySelectorAll('*').forEach(el => {
          if (el.tagName === 'IMG' && el.src) found.push(el.src);
          const style = el.getAttribute('style') || '';
          const m = style.match(/url\(['"]?(https:\/\/[^'"]+)['"]?\)/i);
          if (m) found.push(m[1]);
        });
        return found;
      });

      newUrls.forEach(reportImage);
      await new Promise(r => setTimeout(r, 1000));
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

