/* --- BOOT SEQUENCE --- */
(function initBoot() {
  const bootDiv = document.getElementById('boot-sequence');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let hasPlayed = false;

  try { hasPlayed = sessionStorage.getItem('bootPlayed') === 'true'; } catch (e) {}

  if (hasPlayed || prefersReducedMotion) {
    bootDiv.style.display = 'none';
    return;
  }

  const lines = [
    { id: 'boot-1', text: 'INITIALISING SENSOR ARRAY ... OK', delay: 200 },
    { id: 'boot-2', text: 'LOADING SIGNAL CHAIN ... OK', delay: 600 },
    { id: 'boot-3', text: 'CALIBRATING ... OK', delay: 1000 },
    { id: 'boot-4', text: 'LINK ESTABLISHED.', delay: 1400 }
  ];

  lines.forEach(line => {
    setTimeout(() => { document.getElementById(line.id).textContent = line.text; }, line.delay);
  });

  const finishBoot = () => {
    bootDiv.classList.add('hidden');
    try { sessionStorage.setItem('bootPlayed', 'true'); } catch (e) {}
    setTimeout(() => { bootDiv.style.display = 'none'; }, 400); 
  };

  setTimeout(finishBoot, 1800);
  
  window.addEventListener('keydown', finishBoot, { once: true });
  window.addEventListener('click', finishBoot, { once: true });
  window.addEventListener('touchstart', finishBoot, { once: true });
})();

/* --- SPECTROMETER DSP & ANIMATION --- */
(function initSpectrometer() {
  const M = 512; 
  const P = 4;   
  const N = M * P; 
  const MAX_ACC = 64;

  const canvasTime = document.getElementById('canvas-time');
  const canvasFreq = document.getElementById('canvas-freq');
  const ctxTime = canvasTime.getContext('2d', { alpha: false });
  const ctxFreq = canvasFreq.getContext('2d', { alpha: false });
  
  let signalBuffer = new Float64Array(N);
  let pfbOut = new Float64Array(M);
  let real = new Float64Array(M);
  let imag = new Float64Array(M);
  let power = new Float64Array(M/2);
  let accumulatedPower = new Float64Array(M/2);
  
  let accumulations = 0;
  let showSpurs = false;
  let isAnimating = false;
  let activeNode = -1;
  let loopCount = 0;
  let tickTimeout = null; 

  const filter = new Float64Array(N);
  for (let m = 0; m < N; m++) {
    let x = (m - (M * P) / 2) / M;
    let sinc = (x === 0) ? 1.0 : Math.sin(Math.PI * x) / (Math.PI * x);
    let hann = 0.5 * (1 - Math.cos((2 * Math.PI * m) / (N - 1)));
    filter[m] = sinc * hann;
  }

  const bitRev = new Uint16Array(M);
  const cosT = new Float64Array(M/2);
  const sinT = new Float64Array(M/2);
  
  let bits = Math.log2(M);
  for (let i = 0; i < M; i++) {
    let rev = 0, num = i;
    for (let j = 0; j < bits; j++) {
      rev = (rev << 1) | (num & 1);
      num >>= 1;
    }
    bitRev[i] = rev;
  }
  for (let i = 0; i < M/2; i++) {
    cosT[i] = Math.cos(-2 * Math.PI * i / M);
    sinT[i] = Math.sin(-2 * Math.PI * i / M);
  }

  function doFFT() {
    for (let i = 0; i < M; i++) {
      let j = bitRev[i];
      if (j > i) {
        let tr = real[i], ti = imag[i];
        real[i] = real[j]; imag[i] = imag[j];
        real[j] = tr; imag[j] = ti;
      }
    }
    for (let size = 2; size <= M; size *= 2) {
      let halfsize = size / 2;
      let tablestep = M / size;
      for (let i = 0; i < M; i += size) {
        for (let j = i, k = 0; j < i + halfsize; j++, k += tablestep) {
          let tr = real[j + halfsize] * cosT[k] - imag[j + halfsize] * sinT[k];
          let ti = real[j + halfsize] * sinT[k] + imag[j + halfsize] * cosT[k];
          real[j + halfsize] = real[j] - tr;
          imag[j + halfsize] = imag[j] - ti;
          real[j] += tr;
          imag[j] += ti;
        }
      }
    }
  }

  let spareRandom = null;
  function randn() {
    if (spareRandom !== null) {
      let v = spareRandom; spareRandom = null; return v;
    }
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    let mag = Math.sqrt(-2.0 * Math.log(u));
    spareRandom = mag * Math.cos(2.0 * Math.PI * v);
    return mag * Math.sin(2.0 * Math.PI * v);
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    [canvasTime, canvasFreq].forEach(c => {
      let rect = c.getBoundingClientRect();
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
    });
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas(); 

  function processFrame() {
    if (accumulations >= MAX_ACC) return; 

    const f_s = M;
    const toneAmp = 0.22; 
    const f0 = 100.3; 
    
    for (let i = 0; i < N - M; i++) {
      signalBuffer[i] = signalBuffer[i + M];
    }
    
    const offset = accumulations * M;
    for (let i = 0; i < M; i++) {
      let n = offset + i;
      let val = randn(); 
      val += toneAmp * Math.sin(2 * Math.PI * f0 * n / f_s);
      
      val += 0.08 * Math.sin(2 * Math.PI * 30.2 * n / f_s); 
      val += 0.08 * Math.sin(2 * Math.PI * 180.1 * n / f_s); 
      val += 0.08 * Math.sin(2 * Math.PI * 200.4 * n / f_s); 
      val += 0.08 * Math.sin(2 * Math.PI * 230.7 * n / f_s); 

      if (showSpurs) {
        for(let s = 1; s < 10; s++) {
          val += 0.04 * Math.sin(2 * Math.PI * (s * 25) * n / f_s);
        }
      }
      signalBuffer[(N - M) + i] = val;
    }

    for (let i = 0; i < M; i++) {
      let sum = 0;
      for (let p = 0; p < P; p++) {
        sum += signalBuffer[i + p * M] * filter[i + p * M];
      }
      pfbOut[i] = sum;
      real[i] = sum;
      imag[i] = 0;
    }

    doFFT();

    for (let i = 0; i < M/2; i++) {
      power[i] = (real[i]*real[i] + imag[i]*imag[i]);
    }

    accumulations++;
    for (let i = 0; i < M/2; i++) {
      accumulatedPower[i] += power[i];
    }
    
    updateReadouts();
  }

  function updateReadouts() {
    document.getElementById('spec-accum').textContent = `ACCUMULATIONS: ${accumulations} / ${MAX_ACC}`;
    
    if (accumulations > 0) {
      let sumNoise = 0;
      let peak = 0;
      for(let i=10; i < M/2 - 10; i++) { 
        let p = accumulatedPower[i] / accumulations;
        if(p > peak) peak = p;
        sumNoise += p;
      }
      let meanNoise = sumNoise / (M/2 - 20);
      let snr = 10 * Math.log10(peak / meanNoise);
      document.getElementById('spec-snr').textContent = `SNR &approx; ${snr.toFixed(1)} dB`;
    }

    if(accumulations < 10) {
      if(activeNode !== -1) document.getElementById(`node-${activeNode}`).classList.remove('active');
      activeNode = (activeNode + 1) % 6;
      document.getElementById(`node-${activeNode}`).classList.add('active');
    } else if (activeNode !== -1) {
      document.getElementById(`node-${activeNode}`).classList.remove('active');
      activeNode = -1;
    }
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    
    const wT = canvasTime.width, hT = canvasTime.height;
    ctxTime.fillStyle = '#04070b';
    ctxTime.fillRect(0, 0, wT, hT);
    
    ctxTime.beginPath();
    ctxTime.strokeStyle = '#6b8794';
    ctxTime.lineWidth = 1 * dpr;
    const yCenter = hT / 2;
    const scaleT = hT / 8; 
    
    for (let i = 0; i < M; i++) {
      let x = (i / M) * wT;
      let y = yCenter - (signalBuffer[(N - M) + i] * scaleT);
      if (i === 0) ctxTime.moveTo(x, y);
      else ctxTime.lineTo(x, y);
    }
    ctxTime.stroke();

    const wF = canvasFreq.width, hF = canvasFreq.height;
    ctxFreq.fillStyle = '#04070b';
    ctxFreq.fillRect(0, 0, wF, hF);
    
    ctxFreq.strokeStyle = 'rgba(27, 58, 74, 0.4)';
    ctxFreq.beginPath();
    for(let i=1; i<4; i++) {
      let y = i * hF / 4;
      ctxFreq.moveTo(0, y); ctxFreq.lineTo(wF, y);
    }
    ctxFreq.stroke();
    
    ctxFreq.fillStyle = '#6b8794';
    ctxFreq.font = `${10*dpr}px 'JetBrains Mono'`;
    ctxFreq.fillText('FREQUENCY (ILLUSTRATIVE)', 10*dpr, hF - 10*dpr);
    
    ctxFreq.beginPath();
    ctxFreq.strokeStyle = '#3fe0ff';
    ctxFreq.lineWidth = 1.5 * dpr;
    
    for (let i = 0; i < M/2; i++) {
      let avgP = (accumulations > 0) ? (accumulatedPower[i] / accumulations) : 0.001;
      let db = 10 * Math.log10(avgP + 1e-10); 
      let mappedY = hF - ((db - 15) / 30) * hF;
      let x = (i / (M/2)) * wF;
      
      if (i === 0) ctxFreq.moveTo(x, mappedY);
      else ctxFreq.lineTo(x, mappedY);
    }
    ctxFreq.stroke();

    if (accumulations === MAX_ACC) {
      ctxFreq.fillStyle = '#ffb347';
      ctxFreq.textAlign = 'center';
      
      const drawLabel = (bin, text, isPrimary = false) => {
        let x = (bin / (M/2)) * wF;
        let avgP = accumulatedPower[bin] / accumulations;
        let db = 10 * Math.log10(avgP);
        let y = hF - ((db - 15) / 30) * hF - 10*dpr; 
        
        ctxFreq.fillText(text, x, y);
        if(isPrimary) {
           ctxFreq.font = `${8*dpr}px 'JetBrains Mono'`;
           ctxFreq.fillText('(as in TIFR loopback test)', x, y + 12*dpr);
           ctxFreq.font = `${10*dpr}px 'JetBrains Mono'`;
        }
      };

      drawLabel(30, 'RESEARCH');
      drawLabel(100, 'TEST TONE 393.216 MHz', true);
      drawLabel(180, 'INSTRUMENT');
      drawLabel(200, 'FIELD KIT');
      drawLabel(231, 'OFF-DUTY');
    }
  }

  function tick() {
    if (isAnimating) {
      processFrame();
      draw();
      if (accumulations < MAX_ACC) {
        clearTimeout(tickTimeout);
        tickTimeout = setTimeout(() => requestAnimationFrame(tick), 50); 
      } else {
        document.getElementById('btn-reset-loop').style.display = 'inline-block';
      }
    }
  }

  // --- ACTION 1: SOFT CLEAR (For Replay & Spurs) ---
  function softClear() {
    const wasFinished = (accumulations >= MAX_ACC);
    accumulatedPower.fill(0);
    signalBuffer.fill(0);
    accumulations = 0;
    activeNode = -1;
    document.getElementById('btn-reset-loop').style.display = 'none';
    
    if (wasFinished && isAnimating) {
      tick(); 
    } else if (!isAnimating) {
      isAnimating = true;
      tick();
    }
  }

  // --- ACTION 2: HARD RESET (For Reset Loop) ---
  function hardReset() {
    softClear(); // Wipes the data
    
    // Add the dramatic hardware flash and loop increment
    loopCount++;
    const lc = document.getElementById('loop-counter');
    lc.textContent = `LOOP 000${loopCount}`.slice(-9);
    lc.style.display = 'inline';
    
    let flash = document.createElement('div');
    flash.className = 'flash-overlay flash-anim';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
  }

  window.addEventListener('triggerResetLoop', hardReset);

  const observer = new IntersectionObserver((entries) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    entries.forEach(entry => {
      isAnimating = entry.isIntersecting;
      if (isAnimating && accumulations < MAX_ACC) tick();
    });
  }, { threshold: 0.1 });
  observer.observe(document.getElementById('sec-01'));

  // --- BIND BUTTONS TO SPECIFIC ACTIONS ---
  
  // 1. Show Spurs Button
  document.getElementById('btn-spurs').addEventListener('click', (e) => {
    showSpurs = !showSpurs;
    e.target.textContent = showSpurs ? 'HIDE CLOCK SPURS' : 'SHOW CLOCK SPURS';
    // Soft clear so you can actually see the spurs form if it was already finished
    if (accumulations === MAX_ACC) softClear();
  });
  
  // 2. Replay Button
  document.getElementById('btn-replay').addEventListener('click', softClear);
  
  // 3. Reset Loop Button
  document.getElementById('btn-reset-loop').addEventListener('click', hardReset);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    processFrame(); draw();
  }
})();