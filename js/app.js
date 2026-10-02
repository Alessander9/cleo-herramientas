/**
 * Cleo-Herramientas - High Performance Application Controller & PWA Manager
 * Capable of processing up to 500+ photos concurrently with 0% browser lag.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Register Service Worker for PWA & Offline Support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('✅ Service Worker Cleo-Herramientas activo:', reg.scope))
      .catch(err => console.log('SW fallback:', err));
  }

  // PWA Install Prompt Listener & Handler
  let deferredPrompt = null;
  const btnInstallPwa = document.getElementById('btnInstallPwa');
  const installGuideModal = document.getElementById('installGuideModal');
  const btnInstallGuideClose = document.getElementById('btnInstallGuideClose');
  const btnTriggerNativeInstall = document.getElementById('btnTriggerNativeInstall');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('💡 PWA beforeinstallprompt capturado listo para instalar.');
  });

  if (btnInstallPwa) {
    btnInstallPwa.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          btnInstallPwa.style.display = 'none';
        }
        deferredPrompt = null;
      } else {
        if (installGuideModal) {
          installGuideModal.style.display = 'flex';
        }
      }
    });
  }

  if (btnTriggerNativeInstall) {
    btnTriggerNativeInstall.addEventListener('click', () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
      }
      if (installGuideModal) installGuideModal.style.display = 'none';
    });
  }

  if (btnInstallGuideClose) {
    btnInstallGuideClose.addEventListener('click', () => {
      if (installGuideModal) installGuideModal.style.display = 'none';
    });
  }

  // Application State
  const state = {
    items: [],
    filter: 'all',
    searchQuery: '',
    viewMode: 'table', // 'table' or 'grid'
    isProcessing: false,
    settings: {
      format: 'webp',
      quality: 0.80,
      resizeMode: 'original',
      stripExif: true,
      fileSuffix: '_opt',
      autoCompress: true,
      workers: navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 12) : 6
    }
  };

  const compressor = new TurboCompressor({ concurrency: state.settings.workers });

  // DOM Elements
  const dropZone = document.getElementById('dropZone');
  const dropContentEmpty = document.getElementById('dropContentEmpty');
  const dropCompactStrip = document.getElementById('dropCompactStrip');
  const fileInput = document.getElementById('fileInput');
  const folderInput = document.getElementById('folderInput');
  
  const btnBrowseFiles = document.getElementById('btnBrowseFiles');
  const btnBrowseFolder = document.getElementById('btnBrowseFolder');
  const btnPasteClipboard = document.getElementById('btnPasteClipboard');
  const btnCompactAddFiles = document.getElementById('btnCompactAddFiles');
  const btnCompactAddFolder = document.getElementById('btnCompactAddFolder');
  
  // Settings Elements
  const formatPillGroup = document.getElementById('formatPillGroup');
  const outputFormat = document.getElementById('outputFormat');
  const qualitySlider = document.getElementById('qualitySlider');
  const qualityValueBadge = document.getElementById('qualityValueBadge');
  const resizeMode = document.getElementById('resizeMode');
  const workerCountText = document.getElementById('workerCountText');

  // Stats & Actions
  const statCount = document.getElementById('statCount');
  const statOriginalSize = document.getElementById('statOriginalSize');
  const statOptimizedSize = document.getElementById('statOptimizedSize');
  const statSaving = document.getElementById('statSaving');
  const btnCompressAll = document.getElementById('btnCompressAll');
  const btnClearAll = document.getElementById('btnClearAll');
  const btnDownloadZip = document.getElementById('btnDownloadZip');

  // Table, Grid & Filters
  const searchInput = document.getElementById('searchInput');
  const filterTabs = document.querySelectorAll('.tab-filter-btn');
  const tabCountAll = document.getElementById('tabCountAll');
  const tabCountDone = document.getElementById('tabCountDone');
  const tabCountHighSaving = document.getElementById('tabCountHighSaving');
  
  const btnViewTable = document.getElementById('btnViewTable');
  const btnViewGrid = document.getElementById('btnViewGrid');
  const tableViewContainer = document.getElementById('tableViewContainer');
  const gridViewContainer = document.getElementById('gridViewContainer');
  const tableBody = document.getElementById('tableBody');
  const cardsGrid = document.getElementById('cardsGrid');
  const emptyState = document.getElementById('emptyState');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');

  // Batch Progress
  const batchProgressContainer = document.getElementById('batchProgressContainer');
  const batchProgressText = document.getElementById('batchProgressText');
  const batchProgressPercent = document.getElementById('batchProgressPercent');
  const batchProgressFill = document.getElementById('batchProgressFill');

  // Modals
  const proToolsModal = document.getElementById('proToolsModal');
  const btnProTools = document.getElementById('btnProTools');
  const btnProToolsClose = document.getElementById('btnProToolsClose');
  const chkStripExif = document.getElementById('chkStripExif');
  const txtFileSuffix = document.getElementById('txtFileSuffix');
  const chkAutoCompress = document.getElementById('chkAutoCompress');
  const selWorkersCount = document.getElementById('selWorkersCount');
  const btnSaveProSettings = document.getElementById('btnSaveProSettings');

  const shortcutsModal = document.getElementById('shortcutsModal');
  const btnShortcuts = document.getElementById('btnShortcuts');
  const btnShortcutsClose = document.getElementById('btnShortcutsClose');

  const compareModal = document.getElementById('compareModal');
  const btnCompareClose = document.getElementById('btnCompareClose');
  const compareImgOriginal = document.getElementById('compareImgOriginal');
  const compareImgOptimized = document.getElementById('compareImgOptimized');
  const compareBadgeOriginal = document.getElementById('compareBadgeOriginal');
  const compareBadgeOptimized = document.getElementById('compareBadgeOptimized');
  const compareOptimizedLayer = document.getElementById('compareOptimizedLayer');
  const compareSliderHandle = document.getElementById('compareSliderHandle');
  const comparisonViewer = document.getElementById('comparisonViewer');
  const btnCompareDownload = document.getElementById('btnCompareDownload');
  let currentCompareItem = null;

  // Initialize display
  if (workerCountText) {
    workerCountText.textContent = `${state.settings.workers} hilos paralelos activos`;
  }
  if (selWorkersCount) {
    selWorkersCount.value = String(state.settings.workers);
  }

  function updateSliderBackground(value) {
    qualitySlider.style.background = `linear-gradient(90deg, #6366f1 0%, #8b5cf6 ${value}%, rgba(255,255,255,0.12) ${value}%)`;
  }
  updateSliderBackground(80);

  // =========================================================================
  // VIEW MODE TOGGLE (Table vs Grid Cards)
  // =========================================================================
  btnViewTable.addEventListener('click', () => {
    state.viewMode = 'table';
    btnViewTable.classList.add('active');
    btnViewGrid.classList.remove('active');
    tableViewContainer.style.display = 'block';
    gridViewContainer.style.display = 'none';
    renderGallery();
  });

  btnViewGrid.addEventListener('click', () => {
    state.viewMode = 'grid';
    btnViewGrid.classList.add('active');
    btnViewTable.classList.remove('active');
    gridViewContainer.style.display = 'block';
    tableViewContainer.style.display = 'none';
    renderGallery();
  });

  // =========================================================================
  // FORMAT PILLS EVENT
  // =========================================================================
  if (formatPillGroup) {
    const pills = formatPillGroup.querySelectorAll('.pill-btn');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const fmt = pill.getAttribute('data-format');
        state.settings.format = fmt;
        outputFormat.value = fmt;
      });
    });
  }

  // =========================================================================
  // DRAG & DROP + IMPORT (Files & Recursive Folders)
  // =========================================================================
  ['dragenter', 'dragover'].forEach(eventName => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    }, false);
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const dt = e.dataTransfer;
    if (!dt) return;

    const files = [];

    if (dt.items && dt.items.length > 0) {
      const items = Array.from(dt.items);
      const queue = [];

      for (const item of items) {
        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry) queue.push(traverseFileTree(entry));
        } else if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f && isImageFile(f)) files.push(f);
        }
      }

      if (queue.length > 0) {
        const nestedFiles = await Promise.all(queue);
        nestedFiles.flat().forEach(f => {
          if (isImageFile(f)) files.push(f);
        });
      }
    } else if (dt.files && dt.files.length > 0) {
      Array.from(dt.files).forEach(f => {
        if (isImageFile(f)) files.push(f);
      });
    }

    if (files.length > 0) {
      addFiles(files);
    }
  });

  async function traverseFileTree(item) {
    return new Promise((resolve) => {
      if (item.isFile) {
        item.file(file => resolve([file]), () => resolve([]));
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const entriesList = [];

        const readEntries = () => {
          dirReader.readEntries(async (entries) => {
            if (!entries.length) {
              const files = await Promise.all(entriesList.map(e => traverseFileTree(e)));
              resolve(files.flat());
            } else {
              entriesList.push(...entries);
              readEntries();
            }
          }, () => resolve([]));
        };
        readEntries();
      } else {
        resolve([]);
      }
    });
  }

  function isImageFile(file) {
    if (!file) return false;
    const name = (file.name || '').toLowerCase();
    return file.type.startsWith('image/') || 
           name.endsWith('.jpg') || name.endsWith('.jpeg') || 
           name.endsWith('.png') || name.endsWith('.webp') || 
           name.endsWith('.avif') || name.endsWith('.bmp') || name.endsWith('.gif');
  }

  if (btnBrowseFiles) btnBrowseFiles.addEventListener('click', () => fileInput.click());
  if (btnBrowseFolder) btnBrowseFolder.addEventListener('click', () => folderInput.click());
  if (btnCompactAddFiles) btnCompactAddFiles.addEventListener('click', () => fileInput.click());
  if (btnCompactAddFolder) btnCompactAddFolder.addEventListener('click', () => folderInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      fileInput.value = '';
    }
  });

  folderInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      folderInput.value = '';
    }
  });

  // Paste Support (Ctrl+V)
  function handlePaste(e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const files = [];
    const items = clipboardData.items;

    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
            const renamedFile = new File([blob], `captura_${timestamp}.png`, { type: blob.type });
            files.push(renamedFile);
          }
        }
      }
    }

    if (files.length > 0) {
      addFiles(files);
    }
  }

  window.addEventListener('paste', handlePaste);
  if (btnPasteClipboard) {
    btnPasteClipboard.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.read) {
          const clipboardItems = await navigator.clipboard.read();
          const files = [];
          for (const item of clipboardItems) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
                const file = new File([blob], `captura_${timestamp}.png`, { type });
                files.push(file);
              }
            }
          }
          if (files.length > 0) {
            addFiles(files);
            return;
          }
        }
        alert('Presiona Ctrl + V en tu teclado para pegar imágenes capturadas.');
      } catch (err) {
        alert('Presiona Ctrl + V en tu teclado para pegar imágenes capturadas.');
      }
    });
  }

  // Add files to state
  async function addFiles(newFiles) {
    const validFiles = newFiles.filter(isImageFile);
    if (validFiles.length === 0) return;

    const newItems = validFiles.map((file, idx) => {
      const id = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_' + idx;
      const previewUrl = URL.createObjectURL(file);
      
      return {
        id,
        file,
        name: file.name,
        size: file.size,
        origWidth: 0,
        origHeight: 0,
        previewUrl,
        status: 'pending',
        result: null,
        optimizedBlob: null,
        optimizedSize: 0,
        savingPercent: 0,
        savingBytes: 0,
        targetWidth: 0,
        targetHeight: 0,
        optimizedUrl: null,
        selected: false
      };
    });

    state.items.push(...newItems);
    updateUI();

    if (state.settings.autoCompress) {
      startCompressionBatch();
    }
  }

  // Settings
  resizeMode.addEventListener('change', (e) => {
    state.settings.resizeMode = e.target.value;
  });

  qualitySlider.addEventListener('input', (e) => {
    const val = e.target.value;
    qualityValueBadge.textContent = `${val}%`;
    state.settings.quality = parseInt(val, 10) / 100;
    updateSliderBackground(val);
  });

  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderGallery();
  });

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.filter = tab.getAttribute('data-filter');
      renderGallery();
    });
  });

  selectAllCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked;
    state.items.forEach(it => it.selected = checked);
    renderGallery();
  });

  // =========================================================================
  // COMPRESSION EXECUTION
  // =========================================================================
  btnCompressAll.addEventListener('click', () => {
    startCompressionBatch();
  });

  async function startCompressionBatch() {
    if (state.isProcessing || state.items.length === 0) return;

    state.isProcessing = true;
    btnCompressAll.disabled = true;
    batchProgressContainer.style.display = 'block';

    const itemsToProcess = state.items.filter(it => it.status !== 'done');
    const totalToProcess = itemsToProcess.length;

    if (totalToProcess === 0) {
      state.isProcessing = false;
      btnCompressAll.disabled = false;
      batchProgressContainer.style.display = 'none';
      return;
    }

    const getOptions = () => ({
      quality: state.settings.quality,
      format: state.settings.format,
      resizeMode: state.settings.resizeMode,
      stripExif: state.settings.stripExif
    });

    let processedCount = 0;

    await compressor.processBatch(
      itemsToProcess,
      getOptions,
      (item) => updateItemUIState(item),
      (item) => {
        processedCount++;
        const percent = Math.round((processedCount / totalToProcess) * 100);
        batchProgressText.textContent = `Comprimiendo fotos: ${processedCount} / ${totalToProcess}`;
        batchProgressPercent.textContent = `${percent}%`;
        batchProgressFill.style.width = `${percent}%`;
        updateItemUIState(item);
        updateStats();
      }
    );

    state.isProcessing = false;
    btnCompressAll.disabled = false;
    setTimeout(() => {
      batchProgressContainer.style.display = 'none';
    }, 1000);

    updateUI();
  }

  // Clear all
  btnClearAll.addEventListener('click', () => {
    if (state.items.length === 0) return;
    if (confirm('¿Deseas vaciar la lista de imágenes?')) {
      state.items.forEach(it => {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        if (it.optimizedUrl) URL.revokeObjectURL(it.optimizedUrl);
      });
      state.items = [];
      updateUI();
    }
  });

  // =========================================================================
  // DOWNLOAD ZIP (JSZip)
  // =========================================================================
  btnDownloadZip.addEventListener('click', async () => {
    const doneItems = state.items.filter(it => it.status === 'done' && it.optimizedBlob);
    if (doneItems.length === 0) {
      alert('No hay fotos optimizadas listas para descargar.');
      return;
    }

    btnDownloadZip.disabled = true;
    btnDownloadZip.innerHTML = `<div class="spinner-ring"></div><span>Creando ZIP...</span>`;

    try {
      const zip = new JSZip();
      const suffix = state.settings.fileSuffix || '';

      doneItems.forEach(item => {
        const ext = TurboCompressor.getExtension(item.result.mimeType);
        const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
        const finalName = `${baseName}${suffix}${ext}`;
        zip.file(finalName, item.optimizedBlob);
      });

      const content = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cleo_Fotos_Optimizadas_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Error al generar archivo ZIP: ' + err.message);
    } finally {
      btnDownloadZip.disabled = false;
      btnDownloadZip.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>Descargar ZIP (${doneItems.length})</span>
      `;
    }
  });

  function downloadSingleItem(item) {
    if (!item.optimizedBlob) return;
    const ext = TurboCompressor.getExtension(item.result.mimeType);
    const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
    const finalName = `${baseName}${state.settings.fileSuffix || ''}${ext}`;

    const a = document.createElement('a');
    a.href = item.optimizedUrl;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function deleteSingleItem(itemId) {
    const idx = state.items.findIndex(it => it.id === itemId);
    if (idx !== -1) {
      const it = state.items[idx];
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      if (it.optimizedUrl) URL.revokeObjectURL(it.optimizedUrl);
      state.items.splice(idx, 1);
      updateUI();
    }
  }

  // =========================================================================
  // UI & STATS UPDATES
  // =========================================================================
  function updateUI() {
    const count = state.items.length;

    if (count === 0) {
      dropContentEmpty.style.display = 'flex';
      dropCompactStrip.style.display = 'none';
      dropZone.style.borderStyle = 'dashed';
    } else {
      dropContentEmpty.style.display = 'none';
      dropCompactStrip.style.display = 'flex';
      dropZone.style.borderStyle = 'solid';
    }

    updateStats();
    renderGallery();
  }

  function updateStats() {
    const count = state.items.length;
    statCount.textContent = `${count} foto${count === 1 ? '' : 's'}`;

    let totalOrig = 0;
    let totalOpt = 0;
    let doneCount = 0;
    let highSavingCount = 0;

    state.items.forEach(it => {
      totalOrig += it.size;
      if (it.status === 'done') {
        doneCount++;
        totalOpt += it.optimizedSize;
        if (it.savingPercent >= 80) highSavingCount++;
      } else {
        totalOpt += it.size;
      }
    });

    statOriginalSize.textContent = TurboCompressor.formatBytes(totalOrig);
    statOptimizedSize.textContent = TurboCompressor.formatBytes(totalOpt);

    const savingBytes = Math.max(0, totalOrig - totalOpt);
    const savingPercent = totalOrig > 0 ? Math.round((savingBytes / totalOrig) * 100) : 0;
    statSaving.textContent = `-${savingPercent}%`;

    tabCountAll.textContent = count;
    tabCountDone.textContent = doneCount;
    tabCountHighSaving.textContent = highSavingCount;

    btnCompressAll.disabled = count === 0 || state.isProcessing;
    btnClearAll.disabled = count === 0 || state.isProcessing;
    btnDownloadZip.disabled = doneCount === 0;
    
    if (doneCount > 0) {
      btnDownloadZip.querySelector('span').textContent = `Descargar ZIP (${doneCount})`;
    } else {
      btnDownloadZip.querySelector('span').textContent = `Descargar ZIP`;
    }

    emptyState.style.display = count === 0 ? 'flex' : 'none';
  }

  function getFilteredItems() {
    return state.items.filter(item => {
      if (state.searchQuery && !item.name.toLowerCase().includes(state.searchQuery)) {
        return false;
      }
      if (state.filter === 'done' && item.status !== 'done') return false;
      if (state.filter === 'high-saving' && (!item.savingPercent || item.savingPercent < 80)) return false;
      return true;
    });
  }

  function renderGallery() {
    if (state.items.length === 0) {
      tableBody.innerHTML = '';
      cardsGrid.innerHTML = '';
      emptyState.style.display = 'flex';
      return;
    }

    const filtered = getFilteredItems();
    emptyState.style.display = filtered.length === 0 ? 'flex' : 'none';

    if (state.viewMode === 'table') {
      tableBody.innerHTML = filtered.map((item, index) => createTableRowHtml(item, index + 1)).join('');
    } else {
      cardsGrid.innerHTML = filtered.map((item, index) => createCardHtml(item, index + 1)).join('');
    }

    attachGalleryEventListeners();
  }

  function createTableRowHtml(item, num) {
    let savingBadgeHtml = `<span class="size-bold">-</span>`;
    let optSizeHtml = `<span class="size-bold">-</span>`;
    let statusHtml = `<span class="status-capsule status-pending">Pendiente</span>`;
    let dimensions = item.result ? `${item.result.width} × ${item.result.height} px` : 'Original';

    if (item.status === 'processing') {
      statusHtml = `<span class="status-capsule status-processing"><div class="spinner-ring"></div> Comprimiendo</span>`;
    } else if (item.status === 'done') {
      optSizeHtml = `<span class="size-bold text-cyan">${TurboCompressor.formatBytes(item.optimizedSize)}</span>`;
      const badgeClass = item.savingPercent >= 80 ? 'high' : item.savingPercent >= 40 ? 'medium' : 'low';
      savingBadgeHtml = `<span class="saving-tag ${badgeClass}">-${item.savingPercent}%</span>`;
      statusHtml = `<span class="status-capsule status-done">Listo</span>`;
    } else if (item.status === 'error') {
      statusHtml = `<span class="status-capsule status-error">Error</span>`;
    }

    return `
      <tr data-id="${item.id}">
        <td class="th-chk">
          <input type="checkbox" class="cleo-chk row-chk" data-id="${item.id}" ${item.selected ? 'checked' : ''}>
        </td>
        <td class="th-num">${num}</td>
        <td class="th-thumb">
          <img src="${item.previewUrl}" alt="${item.name}" class="table-preview-img" loading="lazy">
        </td>
        <td class="th-name">
          <div class="file-meta-stack">
            <span class="file-name-line" title="${item.name}">${item.name}</span>
            <span class="file-dims-line">${dimensions}</span>
          </div>
        </td>
        <td class="th-orig">
          <span class="size-bold">${TurboCompressor.formatBytes(item.size)}</span>
        </td>
        <td class="th-opt">${optSizeHtml}</td>
        <td class="th-saving">${savingBadgeHtml}</td>
        <td class="th-status">${statusHtml}</td>
        <td class="th-actions">
          <div class="actions-cluster">
            ${item.status === 'done' ? `
              <button class="btn-icon-action btn-compare-item" data-id="${item.id}" title="Comparar antes/después">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
              </button>
              <button class="btn-icon-action btn-dl-item" data-id="${item.id}" title="Descargar imagen optimizada">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
            ` : ''}
            <button class="btn-icon-action btn-del-action" data-id="${item.id}" title="Eliminar de la lista">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function createCardHtml(item, num) {
    let optText = '-';
    let savingBadge = '';
    if (item.status === 'done') {
      optText = TurboCompressor.formatBytes(item.optimizedSize);
      savingBadge = `<span class="card-saving-badge">-${item.savingPercent}%</span>`;
    }

    return `
      <div class="photo-card" data-id="${item.id}">
        <div class="card-img-wrap">
          <img src="${item.previewUrl}" alt="${item.name}" loading="lazy">
          ${savingBadge}
        </div>
        <div class="card-body-info">
          <div class="card-title" title="${item.name}">${item.name}</div>
          <div class="card-stats-row">
            <span>${TurboCompressor.formatBytes(item.size)}</span>
            <span class="text-cyan font-bold">${optText}</span>
          </div>
          <div class="card-actions-row">
            ${item.status === 'done' ? `
              <button class="btn-icon-action btn-compare-item" data-id="${item.id}" title="Comparar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
              </button>
              <button class="btn-icon-action btn-dl-item" data-id="${item.id}" title="Descargar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
            ` : '<span class="status-capsule status-pending">Pendiente</span>'}
            <button class="btn-icon-action btn-del-action" data-id="${item.id}" title="Eliminar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function updateItemUIState(item) {
    if (state.viewMode === 'table') {
      const row = tableBody.querySelector(`tr[data-id="${item.id}"]`);
      if (!row) return;

      const optCell = row.querySelector('.th-opt');
      const savingCell = row.querySelector('.th-saving');
      const statusCell = row.querySelector('.th-status');
      const actionsCell = row.querySelector('.th-actions');
      const dimsSpan = row.querySelector('.file-dims-line');

      if (dimsSpan && item.result) {
        dimsSpan.textContent = `${item.result.width} × ${item.result.height} px`;
      }

      if (item.status === 'processing') {
        statusCell.innerHTML = `<span class="status-capsule status-processing"><div class="spinner-ring"></div> Comprimiendo</span>`;
      } else if (item.status === 'done') {
        optCell.innerHTML = `<span class="size-bold text-cyan">${TurboCompressor.formatBytes(item.optimizedSize)}</span>`;
        const badgeClass = item.savingPercent >= 80 ? 'high' : item.savingPercent >= 40 ? 'medium' : 'low';
        savingCell.innerHTML = `<span class="saving-tag ${badgeClass}">-${item.savingPercent}%</span>`;
        statusCell.innerHTML = `<span class="status-capsule status-done">Listo</span>`;

        actionsCell.innerHTML = `
          <div class="actions-cluster">
            <button class="btn-icon-action btn-compare-item" data-id="${item.id}" title="Comparar antes/después">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
            <button class="btn-icon-action btn-dl-item" data-id="${item.id}" title="Descargar imagen optimizada">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <button class="btn-icon-action btn-del-action" data-id="${item.id}" title="Eliminar de la lista">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        `;
        attachGalleryEventListeners(row);
      }
    } else {
      const card = cardsGrid.querySelector(`.photo-card[data-id="${item.id}"]`);
      if (card && item.status === 'done') {
        const newCard = document.createElement('div');
        newCard.innerHTML = createCardHtml(item);
        card.replaceWith(newCard.firstElementChild);
        attachGalleryEventListeners();
      }
    }
  }

  function attachGalleryEventListeners(parent = document) {
    parent.querySelectorAll('.row-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-id');
        const item = state.items.find(it => it.id === id);
        if (item) item.selected = e.target.checked;
      });
    });

    parent.querySelectorAll('.btn-del-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        deleteSingleItem(id);
      });
    });

    parent.querySelectorAll('.btn-dl-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const item = state.items.find(it => it.id === id);
        if (item) downloadSingleItem(item);
      });
    });

    parent.querySelectorAll('.btn-compare-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const item = state.items.find(it => it.id === id);
        if (item) openCompareModal(item);
      });
    });
  }

  // =========================================================================
  // COMPARISON MODAL
  // =========================================================================
  function openCompareModal(item) {
    if (!item || !item.optimizedUrl) return;
    currentCompareItem = item;

    compareImgOriginal.src = item.previewUrl;
    compareImgOptimized.src = item.optimizedUrl;

    compareBadgeOriginal.textContent = `Original (${TurboCompressor.formatBytes(item.size)})`;
    compareBadgeOptimized.textContent = `Optimizado (${TurboCompressor.formatBytes(item.optimizedSize)}, -${item.savingPercent}%)`;

    setCompareSliderPosition(50);
    compareModal.style.display = 'flex';
  }

  function setCompareSliderPosition(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    compareSliderHandle.style.left = `${clamped}%`;
    compareOptimizedLayer.style.width = `${clamped}%`;
    
    const containerWidth = comparisonViewer.offsetWidth;
    compareImgOptimized.style.width = `${containerWidth}px`;
  }

  let isDraggingCompare = false;

  function onCompareMove(e) {
    if (!isDraggingCompare) return;
    const rect = comparisonViewer.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const offset = clientX - rect.left;
    const percent = (offset / rect.width) * 100;
    setCompareSliderPosition(percent);
  }

  comparisonViewer.addEventListener('mousedown', (e) => {
    isDraggingCompare = true;
    onCompareMove(e);
  });
  window.addEventListener('mousemove', onCompareMove);
  window.addEventListener('mouseup', () => { isDraggingCompare = false; });

  comparisonViewer.addEventListener('touchstart', (e) => {
    isDraggingCompare = true;
    onCompareMove(e);
  });
  window.addEventListener('touchmove', onCompareMove);
  window.addEventListener('touchend', () => { isDraggingCompare = false; });

  btnCompareClose.addEventListener('click', () => {
    compareModal.style.display = 'none';
    currentCompareItem = null;
  });

  btnCompareDownload.addEventListener('click', () => {
    if (currentCompareItem) {
      downloadSingleItem(currentCompareItem);
    }
  });

  // =========================================================================
  // PRO TOOLS & SHORTCUTS MODALS
  // =========================================================================
  btnProTools.addEventListener('click', () => {
    proToolsModal.style.display = 'flex';
  });
  btnProToolsClose.addEventListener('click', () => {
    proToolsModal.style.display = 'none';
  });

  btnSaveProSettings.addEventListener('click', () => {
    state.settings.stripExif = chkStripExif.checked;
    state.settings.fileSuffix = txtFileSuffix.value || '';
    state.settings.autoCompress = chkAutoCompress.checked;
    const workers = parseInt(selWorkersCount.value, 10) || 6;
    state.settings.workers = workers;
    compressor.setConcurrency(workers);
    if (workerCountText) workerCountText.textContent = `${workers} hilos paralelos activos`;
    proToolsModal.style.display = 'none';
  });

  btnShortcuts.addEventListener('click', () => {
    shortcutsModal.style.display = 'flex';
  });
  btnShortcutsClose.addEventListener('click', () => {
    shortcutsModal.style.display = 'none';
  });

  [compareModal, proToolsModal, shortcutsModal, installGuideModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      fileInput.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      startCompressionBatch();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      if (!btnDownloadZip.disabled) {
        e.preventDefault();
        btnDownloadZip.click();
      }
    } else if (e.key === 'Escape') {
      if (compareModal) compareModal.style.display = 'none';
      if (proToolsModal) proToolsModal.style.display = 'none';
      if (shortcutsModal) shortcutsModal.style.display = 'none';
      if (installGuideModal) installGuideModal.style.display = 'none';
    }
  });

});
