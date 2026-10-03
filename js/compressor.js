/**
 * OptiPic TURBO - High Throughput Multi-threaded Image Compression Engine
 * Supports up to 500+ images concurrently without freezing UI
 */

class TurboCompressor {
  constructor(options = {}) {
    this.concurrency = options.concurrency || (navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 12) : 6);
    this.activeWorkers = 0;
    this.queue = [];
  }

  setConcurrency(count) {
    this.concurrency = parseInt(count, 10) || 6;
  }

  /**
   * Format bytes into human-readable string (e.g. 1.45 MB)
   */
  static formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Calculate dimensions based on resize mode
   */
  static calculateDimensions(origWidth, origHeight, resizeMode) {
    let targetWidth = origWidth;
    let targetHeight = origHeight;

    switch (resizeMode) {
      case 'scale_75':
        targetWidth = Math.round(origWidth * 0.75);
        targetHeight = Math.round(origHeight * 0.75);
        break;
      case 'scale_50':
        targetWidth = Math.round(origWidth * 0.5);
        targetHeight = Math.round(origHeight * 0.5);
        break;
      case 'max_1920':
        if (origWidth > 1920) {
          targetWidth = 1920;
          targetHeight = Math.round((origHeight * 1920) / origWidth);
        }
        break;
      case 'max_1280':
        if (origWidth > 1280) {
          targetWidth = 1280;
          targetHeight = Math.round((origHeight * 1280) / origWidth);
        }
        break;
      case 'max_800':
        if (origWidth > 800) {
          targetWidth = 800;
          targetHeight = Math.round((origHeight * 800) / origWidth);
        }
        break;
      case 'original':
      default:
        targetWidth = origWidth;
        targetHeight = origHeight;
        break;
    }

    return {
      width: Math.max(1, targetWidth),
      height: Math.max(1, targetHeight)
    };
  }

  /**
   * Resolve target mime type
   */
  static getMimeType(format, originalType) {
    switch (format) {
      case 'webp': return 'image/webp';
      case 'jpeg':
      case 'jpg': return 'image/jpeg';
      case 'png': return 'image/png';
      case 'avif': return 'image/avif';
      case 'original':
      default:
        return originalType || 'image/jpeg';
    }
  }

  /**
   * Resolve file extension from mime type
   */
  static getExtension(mimeType) {
    switch (mimeType) {
      case 'image/webp': return '.webp';
      case 'image/jpeg': return '.jpg';
      case 'image/png': return '.png';
      case 'image/avif': return '.avif';
      default: return '.jpg';
    }
  }

  /**
   * Fast client-side image loader using createImageBitmap or Image element
   */
  static async loadImage(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
          }
        };
      } catch (e) {
        try {
          const bitmap = await createImageBitmap(file);
          return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            cleanup: () => {
              if (bitmap && typeof bitmap.close === 'function') bitmap.close();
            }
          };
        } catch (err) {
          // Fallback to Image element
        }
      }
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        resolve({
          source: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          cleanup: () => URL.revokeObjectURL(url)
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo decodificar la imagen'));
      };
      img.src = url;
    });
  }

  /**
   * Compress single image file
   */
  async compressImage(file, options = {}) {
    const {
      quality = 0.8,
      mode = 'quality', // 'quality' or 'targetSize'
      targetSizeBytes = 300 * 1024,
      format = 'webp',
      resizeMode = 'original',
      stripExif = true,
      onProgress = () => {}
    } = options;

    const mimeType = TurboCompressor.getMimeType(format, file.type);
    const loaded = await TurboCompressor.loadImage(file);

    try {
      const { width, height } = TurboCompressor.calculateDimensions(loaded.width, loaded.height, resizeMode);

      // Create Canvas
      let canvas;
      let ctx;
      
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(width, height);
        ctx = canvas.getContext('2d', { alpha: mimeType !== 'image/jpeg' });
      } else {
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        ctx = canvas.getContext('2d', { alpha: mimeType !== 'image/jpeg' });
      }

      if (!ctx) {
        throw new Error('No se pudo inicializar el contexto de renderizado 2D');
      }

      // High quality scaling settings
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // If JPEG, paint white background to avoid black background on PNG transparency
      if (mimeType === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
      }

      ctx.drawImage(loaded.source, 0, 0, width, height);

      let outputBlob;

      if (mode === 'targetSize' && mimeType !== 'image/png') {
        // Binary search quality to achieve target weight
        let minQ = 0.05;
        let maxQ = 0.98;
        let bestBlob = null;
        let iterations = 0;

        while (minQ <= maxQ && iterations < 6) {
          iterations++;
          const currentQ = (minQ + maxQ) / 2;
          let blob;
          if (canvas.convertToBlob) {
            blob = await canvas.convertToBlob({ type: mimeType, quality: currentQ });
          } else {
            blob = await new Promise(res => canvas.toBlob(res, mimeType, currentQ));
          }

          if (!blob) break;
          bestBlob = blob;

          if (blob.size > targetSizeBytes) {
            maxQ = currentQ - 0.08;
          } else if (blob.size < targetSizeBytes * 0.85) {
            minQ = currentQ + 0.08;
          } else {
            break; // Close enough
          }
        }
        outputBlob = bestBlob;
      } else {
        // Standard Quality percentage
        const finalQ = mimeType === 'image/png' ? undefined : quality;
        if (canvas.convertToBlob) {
          outputBlob = await canvas.convertToBlob({ type: mimeType, quality: finalQ });
        } else {
          outputBlob = await new Promise(res => canvas.toBlob(res, mimeType, finalQ));
        }
      }

      // Fallback if conversion failed
      if (!outputBlob) {
        throw new Error('Error al codificar imagen');
      }

      const savingBytes = Math.max(0, file.size - outputBlob.size);
      const savingPercent = file.size > 0 ? Math.round(((file.size - outputBlob.size) / file.size) * 100) : 0;

      return {
        blob: outputBlob,
        originalSize: file.size,
        optimizedSize: outputBlob.size,
        savingBytes: savingBytes,
        savingPercent: savingPercent,
        width: width,
        height: height,
        origWidth: loaded.width,
        origHeight: loaded.height,
        mimeType: mimeType
      };
    } finally {
      if (loaded && typeof loaded.cleanup === 'function') {
        loaded.cleanup();
      }
    }
  }
          blob = await canvas.convertToBlob({ type: mimeType, quality: currentQ });
        } else {
          blob = await new Promise(res => canvas.toBlob(res, mimeType, currentQ));
        }

        if (!blob) break;
        bestBlob = blob;

        if (blob.size > targetSizeBytes) {
          maxQ = currentQ - 0.08;
        } else if (blob.size < targetSizeBytes * 0.85) {
          minQ = currentQ + 0.08;
        } else {
          break; // Close enough
        }
      }
      outputBlob = bestBlob;
    } else {
      // Standard Quality percentage
      const finalQ = mimeType === 'image/png' ? undefined : quality;
      if (canvas.convertToBlob) {
        outputBlob = await canvas.convertToBlob({ type: mimeType, quality: finalQ });
      } else {
        outputBlob = await new Promise(res => canvas.toBlob(res, mimeType, finalQ));
      }
    }

    // Fallback if conversion failed
    if (!outputBlob) {
      throw new Error('Error al codificar imagen');
    }

    const savingBytes = Math.max(0, file.size - outputBlob.size);
    const savingPercent = file.size > 0 ? Math.round(((file.size - outputBlob.size) / file.size) * 100) : 0;

    return {
      blob: outputBlob,
      originalSize: file.size,
      optimizedSize: outputBlob.size,
      savingBytes: savingBytes,
      savingPercent: savingPercent,
      width: width,
      height: height,
      origWidth: loaded.width,
      origHeight: loaded.height,
      mimeType: mimeType
    };
  }

  /**
   * Process a queue of image items with concurrent workers
   */
  async processBatch(items, getOptionsFn, onItemProgress, onItemComplete) {
    let index = 0;
    const total = items.length;
    let completed = 0;

    const worker = async () => {
      while (index < total) {
        const currentIndex = index++;
        const item = items[currentIndex];

        if (item.status === 'done') {
          completed++;
          continue;
        }

        try {
          item.status = 'processing';
          if (onItemProgress) onItemProgress(item, currentIndex, completed, total);

          const options = getOptionsFn(item);
          const result = await this.compressImage(item.file, options);

          item.status = 'done';
          item.result = result;
          if (item.optimizedUrl) {
            URL.revokeObjectURL(item.optimizedUrl);
          }
          item.optimizedBlob = result.blob;
          item.optimizedSize = result.optimizedSize;
          item.savingPercent = result.savingPercent;
          item.savingBytes = result.savingBytes;
          item.targetWidth = result.width;
          item.targetHeight = result.height;
          item.optimizedUrl = URL.createObjectURL(result.blob);
        } catch (err) {
          console.error(`Error procesando ${item.name}:`, err);
          item.status = 'error';
          item.error = err.message;
        }

        completed++;
        if (onItemComplete) onItemComplete(item, currentIndex, completed, total);
        
        // Yield momentarily to guarantee 60fps main UI responsiveness
        await new Promise(r => setTimeout(r, 0));
      }
    };

    const threadCount = Math.min(this.concurrency, items.length);
    const pool = [];
    for (let i = 0; i < threadCount; i++) {
      pool.push(worker());
    }

    await Promise.all(pool);
  }
}

window.TurboCompressor = TurboCompressor;
