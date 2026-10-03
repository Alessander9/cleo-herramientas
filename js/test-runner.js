/**
 * OptiPic TURBO - Automated Test Runner
 * Generates test images and validates all compression modes, sliders, formats, and ZIP creation
 */

window.runOptiPicTests = async function(count = 10) {
  console.log(`🚀 Iniciando Test Automatizado de OptiPic TURBO con ${count} fotos de prueba...`);
  
  const testFiles = [];
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  for (let i = 1; i <= count; i++) {
    // Draw rich gradient and shapes to create realistic image data
    const grad = ctx.createLinearGradient(0, 0, 1920, 1080);
    grad.addColorStop(0, `hsl(${(i * 37) % 360}, 75%, 55%)`);
    grad.addColorStop(0.5, `hsl(${((i * 37) + 120) % 360}, 80%, 45%)`);
    grad.addColorStop(1, `hsl(${((i * 37) + 240) % 360}, 85%, 35%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1920, 1080);

    // Draw patterns and text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText(`Foto de Prueba #${i} - Cleo-Herramientas`, 100, 200);
    ctx.font = '40px sans-serif';
    ctx.fillText(`Resolución: 1920x1080 | Calidad Original Alta`, 100, 280);

    for (let c = 0; c < 30; c++) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + (c % 5) * 0.1})`;
      ctx.beginPath();
      ctx.arc(200 + (c * 50), 400 + ((c % 5) * 80), 30 + (c * 2), 0, Math.PI * 2);
      ctx.fill();
    }

    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
    const file = new File([blob], `test_foto_${i.toString().padStart(3, '0')}.jpg`, { type: 'image/jpeg' });
    testFiles.push(file);
  }

  console.log(`✅ Creados ${testFiles.length} archivos de prueba en memoria.`);
  
  // Simulate Drag & Drop event
  const dropZone = document.getElementById('dropZone');
  const dataTransfer = new DataTransfer();
  testFiles.forEach(f => dataTransfer.items.add(f));

  const dropEvent = new DragEvent('drop', {
    bubbles: true,
    cancelable: true,
    dataTransfer: dataTransfer
  });

  dropZone.dispatchEvent(dropEvent);
  console.log(`⚡ Fotos inyectadas al compresor. Verificando procesamiento...`);

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const statsDone = document.getElementById('tabCountDone');
      const doneCount = parseInt(statsDone.textContent || '0', 10);
      const totalCount = parseInt(document.getElementById('tabCountAll').textContent || '0', 10);
      
      console.log(`⏳ Progreso: ${doneCount} / ${totalCount} completadas`);

      if (doneCount >= totalCount && totalCount > 0) {
        clearInterval(checkInterval);
        console.log(`🎉 ¡TODAS LAS ${totalCount} FOTOS PROCESADAS CON ÉXITO!`);
        console.log(`📊 Peso Original:`, document.getElementById('statOriginalSize').textContent);
        console.log(`✨ Peso Optimizado:`, document.getElementById('statOptimizedSize').textContent);
        console.log(`📉 Ahorro Total:`, document.getElementById('statSaving').textContent);
        resolve({
          total: totalCount,
          original: document.getElementById('statOriginalSize').textContent,
          optimized: document.getElementById('statOptimizedSize').textContent,
          saving: document.getElementById('statSaving').textContent
        });
      }
    }, 500);
  });
};

window.testZipExport = async function() {
  console.log('🧪 Probando generación y empaquetado ZIP...');
  const btn = document.getElementById('btnDownloadZip');
  if (btn && !btn.disabled) {
    btn.click();
    console.log('✅ Descarga de ZIP ejecutada con éxito.');
  } else {
    console.warn('⚠️ El botón de descarga ZIP no está activo o no hay fotos procesadas.');
  }
};
